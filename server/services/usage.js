import { config } from '../config.js';
import { MONTHS } from '../lib/catalog.js';
import { prisma } from '../lib/db.js';

// Precios en USD por 1M de tokens (nivel pagado estándar de la Gemini API).
// Fuente: https://ai.google.dev/gemini-api/docs/pricing — revisar si Google los cambia.
// Se pueden sobrescribir con GEMINI_PRICE_INPUT_PER_M y GEMINI_PRICE_OUTPUT_PER_M.
const PRICES = {
  'gemini-3.5-flash': { input: 1.5, output: 9.0 },
  'gemini-2.5-flash': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
};

export function priceFor(model) {
  const base = PRICES[model];
  const input = config.GEMINI_PRICE_INPUT_PER_M ?? base?.input;
  const output = config.GEMINI_PRICE_OUTPUT_PER_M ?? base?.output;
  return input != null && output != null ? { input, output } : null;
}

/**
 * Acumula el consumo de una operación con Gemini (puede incluir reintentos)
 * y lo guarda al terminar, haya salido bien o no.
 */
export class UsageTracker {
  constructor(kind, { user, report } = {}) {
    this.kind = kind;
    this.user = user;
    this.report = report;
    this.started = Date.now();
    this.attempts = 0;
    this.inputTokens = 0;
    this.outputTokens = 0;
  }

  /** Suma el usageMetadata de una respuesta de Gemini. */
  add(meta) {
    this.attempts++;
    if (!meta) return;
    this.inputTokens += meta.promptTokenCount ?? 0;
    this.outputTokens += (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0);
  }

  async save({ success, error }) {
    const price = priceFor(config.GEMINI_MODEL);
    const costUsd = price ? (this.inputTokens * price.input + this.outputTokens * price.output) / 1_000_000 : 0;
    const r = this.report;
    try {
      await prisma.aiUsage.create({
        data: {
          kind: this.kind,
          model: config.GEMINI_MODEL,
          success,
          error: error ? String(error).slice(0, 500) : null,
          attempts: Math.max(this.attempts, 1),
          durationMs: Date.now() - this.started,
          inputTokens: this.inputTokens,
          outputTokens: this.outputTokens,
          totalTokens: this.inputTokens + this.outputTokens,
          costUsd,
          userId: this.user?.id ?? null,
          userLabel: this.user?.name ?? null,
          reportId: r?.id ?? null,
          reportLabel: r ? `${r.flowName} · ${MONTHS[r.month - 1]} ${r.year} · ${r.currency}` : null,
        },
      });
    } catch (err) {
      // El registro de consumo nunca debe romper el análisis.
      console.error('No se pudo guardar el consumo de IA:', err.message);
    }
  }
}

/** Resumen de consumo de un mes: totales, por usuario, por día y últimos registros. */
export async function usageSummary(year, month) {
  // Hora local del servidor (TZ en el Dockerfile) para que los cortes de mes coincidan con el equipo.
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  const rows = await prisma.aiUsage.findMany({
    where: { createdAt: { gte: from, lt: to } },
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { name: true } }, report: { select: { id: true } } },
  });

  const sum = (list, key) => list.reduce((a, r) => a + r[key], 0);
  const analyses = rows.filter((r) => r.kind === 'ANALYSIS');

  const byUser = new Map();
  for (const r of rows) {
    const name = r.user?.name ?? r.userLabel ?? 'Usuario eliminado';
    const u = byUser.get(name) ?? { name, analyses: 0, failed: 0, tokens: 0, costUsd: 0 };
    if (r.kind === 'ANALYSIS') r.success ? u.analyses++ : u.failed++;
    u.tokens += r.totalTokens;
    u.costUsd += r.costUsd;
    byUser.set(name, u);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const byDay = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, analyses: 0, costUsd: 0 }));
  for (const r of analyses) {
    const d = byDay[r.createdAt.getDate() - 1];
    d.analyses++;
    d.costUsd += r.costUsd;
  }

  const ok = analyses.filter((r) => r.success);
  return {
    year,
    month,
    model: config.GEMINI_MODEL,
    price: priceFor(config.GEMINI_MODEL),
    totals: {
      analyses: ok.length,
      failed: analyses.length - ok.length,
      tests: rows.length - analyses.length,
      inputTokens: sum(rows, 'inputTokens'),
      outputTokens: sum(rows, 'outputTokens'),
      totalTokens: sum(rows, 'totalTokens'),
      costUsd: sum(rows, 'costUsd'),
      avgCostPerAnalysis: ok.length ? sum(ok, 'costUsd') / ok.length : null,
      avgSeconds: ok.length ? sum(ok, 'durationMs') / ok.length / 1000 : null,
    },
    byUser: [...byUser.values()].sort((a, b) => b.costUsd - a.costUsd),
    byDay,
    recent: rows.slice(0, 100).map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      kind: r.kind,
      model: r.model,
      success: r.success,
      error: r.error,
      attempts: r.attempts,
      durationMs: r.durationMs,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      costUsd: r.costUsd,
      user: r.user?.name ?? r.userLabel,
      reportLabel: r.reportLabel,
      reportId: r.report?.id ?? null,
    })),
  };
}
