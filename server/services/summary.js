import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { METRICS, MONTHS } from '../lib/catalog.js';
import { prisma } from '../lib/db.js';
import { HttpError } from '../lib/http.js';
import { computeOutliers, median } from '../lib/quality.js';
import { friendlyGeminiError } from './analysis.js';
import { UsageTracker } from './usage.js';

const ai = config.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: config.GEMINI_API_KEY }) : null;

const KPI = METRICS.filter((m) => m.group === 'kpi');
const SELECT = { id: true, flowName: true, month: true, year: true, currency: true, ...Object.fromEntries(METRICS.map((m) => [m.key, true])) };
const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
const pctChange = (now, prev) => (now == null || prev == null || prev === 0 ? null : round(((now - prev) / Math.abs(prev)) * 100));

/** Vertical deducida del nombre del flujo (solo para agrupar; si no se reconoce, "Otros"). */
function vertical(name) {
  const n = name.toLowerCase();
  const casino = /casino|maquinita|slot|live/.test(n);
  const sport = /deporte|deportiv|sport/.test(n);
  if (casino && !sport) return 'Casino';
  if (sport && !casino) return 'Deporte';
  return 'Otros / mixtos';
}

function metricStats(list) {
  return Object.fromEntries(
    KPI.map((m) => {
      const v = list.map((r) => r[m.key]).filter((x) => x != null);
      return [m.key, { n: v.length, median: round(median(v)), average: v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null }];
    }),
  );
}

const previousPeriod = (year, month) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });

/**
 * Cifras exactas del mes (calculadas aquí, no por la IA) a partir de los reportes publicados.
 * Los valores marcados por el control de calidad se informan aparte y no entran en el ranking.
 */
export async function buildMonthStats(year, month, currency) {
  const prev = previousPeriod(year, month);
  // Todos los publicados de la moneda: sirven para el historial del control de calidad
  const all = await prisma.report.findMany({ where: { status: 'PUBLISHED', currency }, select: SELECT });
  const current = all.filter((r) => r.year === year && r.month === month);
  const previous = all.filter((r) => r.year === prev.year && r.month === prev.month);
  const outliers = computeOutliers(all);

  const clean = current.filter((r) => !outliers.has(r.id));
  const ranked = clean.filter((r) => r.avgNetRevenue != null).sort((a, b) => b.avgNetRevenue - a.avgNetRevenue);
  const pick = (r) => ({ id: r.id, flowName: r.flowName, avgNetRevenue: r.avgNetRevenue, avgDeposits: r.avgDeposits, avgDepositAmount: r.avgDepositAmount, avgActivityDays: r.avgActivityDays });

  const currentStats = metricStats(clean);
  const previousStats = previous.length ? metricStats(previous.filter((r) => !outliers.has(r.id))) : null;
  const nr = clean.map((r) => r.avgNetRevenue).filter((v) => v != null);

  const verticals = {};
  for (const r of clean) {
    const v = vertical(r.flowName);
    (verticals[v] ??= []).push(r);
  }

  return {
    year, month, currency,
    period: `${MONTHS[month - 1]} ${year}`,
    previousPeriod: `${MONTHS[prev.month - 1]} ${prev.year}`,
    reportCount: current.length,
    previousReportCount: previous.length,
    metrics: currentStats,
    previousMetrics: previousStats,
    changes: previousStats
      ? Object.fromEntries(KPI.map((m) => [m.key, pctChange(currentStats[m.key].median, previousStats[m.key].median)]))
      : null,
    netRevenue: { withData: nr.length, positive: nr.filter((v) => v > 0).length, negative: nr.filter((v) => v < 0).length },
    top: ranked.slice(0, 3).map(pick),
    bottom: ranked.slice(-3).reverse().map(pick),
    verticals: Object.fromEntries(Object.entries(verticals).map(([k, list]) => [k, { count: list.length, metrics: metricStats(list) }])),
    flagged: current
      .filter((r) => outliers.has(r.id))
      .map((r) => ({ id: r.id, flowName: r.flowName, issues: outliers.get(r.id).map((f) => f.message) })),
    flows: current.map((r) => ({ ...pick(r), flagged: outliers.has(r.id) })),
  };
}

// Reglas fijas del resumen: solo análisis de datos, tono neutral, sin recomendaciones.
const SUMMARY_RULES = `Eres un analista de datos. Redacta un resumen ejecutivo en español de los flujos de CRM de un mes.

REGLAS (obligatorias):
1. Solo describe y compara los datos proporcionados. Usa las cifras exactas tal como vienen.
2. No des recomendaciones, sugerencias, propuestas, próximos pasos ni consejos de marketing.
3. Tono neutral y descriptivo. No uses palabras alarmistas o dramáticas (por ejemplo: "crítico", "grave", "alarmante",
   "preocupante", "desplome", "fracaso", "catastrófico", "riesgo"). Usa "disminuyó", "aumentó", "por debajo de", "por encima de".
4. No hagas juicios ni conclusiones que no se desprendan directamente de los números.
5. Los flujos marcados para verificar se mencionan solo en su sección, como "pendientes de verificación", sin valorarlos.
6. Si un dato no está disponible, dilo así; no lo estimes.
7. Responde solo con Markdown, sin introducción ni despedida.

FORMATO (exactamente estas secciones, omite una sección solo si no hay datos para ella):
## Resumen del mes
2 a 4 viñetas con las cifras generales (cantidad de flujos, medianas principales, cuántos con net revenue positivo).
## Flujos con mayor net revenue
Los 3 primeros con sus cifras.
## Flujos con menor net revenue
Los 3 últimos con sus cifras.
## Comparación con el mes anterior
Variación de las medianas principales en %.
## Por vertical
Comparación descriptiva entre Casino, Deporte y otros.
## Datos pendientes de verificación
Lista de flujos marcados por el control de calidad y el motivo.`;

function statsForPrompt(s) {
  const lines = [`Periodo: ${s.period} · Moneda: ${s.currency} · Flujos publicados: ${s.reportCount} (mes anterior ${s.previousPeriod}: ${s.previousReportCount})`];
  lines.push('', 'Medianas del mes (sin los flujos pendientes de verificación):');
  for (const m of KPI) {
    const cur = s.metrics[m.key];
    const ch = s.changes?.[m.key];
    lines.push(`- ${m.label}: mediana ${cur.median ?? 'no disponible'} (promedio ${cur.average ?? 'n/d'}, ${cur.n} flujos con dato)${ch != null ? ` · variación vs mes anterior: ${ch > 0 ? '+' : ''}${ch}%` : ''}`);
  }
  lines.push(`- Net revenue: ${s.netRevenue.positive} flujos positivos y ${s.netRevenue.negative} negativos de ${s.netRevenue.withData} con dato`);
  const row = (r) => `"${r.flowName}": net revenue ${r.avgNetRevenue}, depósitos ${r.avgDeposits ?? 'n/d'}, monto depósitos ${r.avgDepositAmount ?? 'n/d'}, días actividad ${r.avgActivityDays ?? 'n/d'}`;
  lines.push('', 'Mayor net revenue:', ...s.top.map((r, i) => `${i + 1}. ${row(r)}`));
  lines.push('', 'Menor net revenue:', ...s.bottom.map((r, i) => `${i + 1}. ${row(r)}`));
  lines.push('', 'Por vertical (medianas):');
  for (const [v, d] of Object.entries(s.verticals)) {
    lines.push(`- ${v} (${d.count} flujos): ${KPI.map((m) => `${m.label} ${d.metrics[m.key].median ?? 'n/d'}`).join('; ')}`);
  }
  lines.push('', 'Pendientes de verificación:', ...(s.flagged.length ? s.flagged.map((f) => `- "${f.flowName}": ${f.issues.join(' ')}`) : ['- Ninguno']));
  return lines.join('\n');
}

/** Genera (o regenera) el resumen del mes. Queda en borrador para revisarlo antes de publicar. */
export async function generateSummary(year, month, currency, { user } = {}) {
  if (!ai) throw new HttpError(503, 'Falta configurar GEMINI_API_KEY en el servidor');
  const stats = await buildMonthStats(year, month, currency);
  if (stats.reportCount === 0) throw new HttpError(400, `No hay reportes publicados de ${stats.period} en ${currency}`);

  const tracker = new UsageTracker('SUMMARY', { user });
  let content;
  try {
    const response = await ai.models.generateContent({
      model: config.GEMINI_MODEL,
      contents: [{ role: 'user', parts: [{ text: statsForPrompt(stats) }] }],
      config: { systemInstruction: SUMMARY_RULES, temperature: 0.3 },
    });
    tracker.add(response.usageMetadata);
    content = (response.text ?? '').trim();
    if (!content) throw new Error('La IA devolvió un resumen vacío');
    await tracker.save({ success: true });
  } catch (err) {
    const message = err.status ? friendlyGeminiError(err) : `No se pudo generar el resumen: ${err.message}`;
    await tracker.save({ success: false, error: message });
    throw new HttpError(502, message);
  }

  const data = { content, stats, reportCount: stats.reportCount, aiModel: config.GEMINI_MODEL, generatedAt: new Date(), status: 'DRAFT' };
  return prisma.monthlySummary.upsert({
    where: { year_month_currency: { year, month, currency } },
    update: data,
    create: { ...data, year, month, currency, createdById: user?.id ?? null },
  });
}
