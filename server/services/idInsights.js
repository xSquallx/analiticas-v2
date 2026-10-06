// Protagonismo de los IDs de cliente en los KPI, calculado de los CSV del reporte (sin IA).
// Para cada KPI numérico se ordenan los IDs; un ID es "destacado" si aparece entre los primeros
// (valores más altos) o, en columnas con negativos, entre los más bajos.
// Si el CSV trae una columna de fecha, se arma una línea temporal por ID; si no, el perfil es atemporal.

import { explicitIdColumn, numericColumns, parseCsv, toNumber } from './csv.js';

const TOP_N = 10;
const MAX_PROTAGONISTS = 12;
const MAX_TIMELINE = 8;
const DATE_COLUMN = /(date|fecha|d[ií]a|day|time|hora|periodo|period)/i;

const round = (n) => Math.round(n * 100) / 100;

function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  // Un número suelto ("3", "12.5") no es una fecha: evita confundir columnas como "Activity Days"
  if (/^-?d+([.,]d+)?$/.test(s)) return null;
  // dd/mm/yyyy o dd-mm-yyyy (formato habitual en LATAM)
  const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    const d = new Date(Date.UTC(year, Number(dmy[2]) - 1, Number(dmy[1])));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO (2026-08-15) u otros formatos con año explícito
  if (!/d{4}/.test(s)) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateColumn(rows, columns) {
  return (
    columns.find((c) => {
      if (!DATE_COLUMN.test(c)) return false;
      const sample = rows.slice(0, 20).map((r) => r[c]).filter(Boolean);
      return sample.length > 0 && sample.filter((v) => parseDate(v)).length / sample.length >= 0.8;
    }) ?? null
  );
}

/**
 * files: [{ label, text }] (solo CSV). Devuelve null si ningún CSV tiene columna de ID.
 */
export function buildIdInsights(files) {
  const kpis = new Map(); // nombre del KPI → Map(id → valor agregado)
  const timelines = new Map(); // id → [{ date, kpi, value }]
  const allIds = new Set();
  let temporal = false;
  let sources = 0;

  // Si dos archivos tienen una columna con el mismo nombre, se distingue por archivo
  const parsed = files
    .map((f) => ({ ...f, ...parseCsv(f.text) }))
    .map((f) => ({ ...f, idCol: explicitIdColumn(f.columns) }))
    .filter((f) => f.idCol);
  const columnCount = new Map();
  for (const f of parsed) for (const c of f.columns) columnCount.set(c, (columnCount.get(c) ?? 0) + 1);

  for (const f of parsed) {
    sources++;
    const dateCol = dateColumn(f.rows, f.columns);
    const numCols = numericColumns(f.rows, f.columns).filter((c) => c !== f.idCol && c !== dateCol);
    if (dateCol) temporal = true;

    for (const row of f.rows) {
      const id = String(row[f.idCol] ?? '').trim();
      if (!id) continue;
      allIds.add(id);
      const date = dateCol ? parseDate(row[dateCol]) : null;
      for (const col of numCols) {
        const value = toNumber(row[col]);
        if (value === null) continue;
        const kpi = columnCount.get(col) > 1 ? `${col} (${f.label})` : col;
        if (!kpis.has(kpi)) kpis.set(kpi, new Map());
        const perId = kpis.get(kpi);
        // Si un ID aparece en varias filas (por ejemplo, una por día), se suma
        perId.set(id, (perId.get(id) ?? 0) + value);
        if (date) {
          if (!timelines.has(id)) timelines.set(id, []);
          timelines.get(id).push({ date: date.toISOString().slice(0, 10), kpi, value: round(value) });
        }
      }
    }
  }
  if (sources === 0 || kpis.size === 0) return null;

  // Ranking por KPI
  const highlights = new Map(); // id → [{ kpi, value, rank, of, direction }]
  const add = (id, h) => {
    if (!highlights.has(id)) highlights.set(id, []);
    highlights.get(id).push(h);
  };
  for (const [kpi, perId] of kpis) {
    const entries = [...perId.entries()].map(([id, value]) => ({ id, value }));
    const desc = [...entries].sort((a, b) => b.value - a.value);
    desc.slice(0, TOP_N).forEach((e, i) => e.value > 0 && add(e.id, { kpi, value: round(e.value), rank: i + 1, of: entries.length, direction: 'alto' }));
    if (entries.some((e) => e.value < 0)) {
      const asc = [...entries].sort((a, b) => a.value - b.value);
      asc.slice(0, TOP_N).forEach((e, i) => e.value < 0 && add(e.id, { kpi, value: round(e.value), rank: i + 1, of: entries.length, direction: 'bajo' }));
    }
  }

  const protagonists = [...highlights.entries()]
    .map(([id, list]) => {
      const values = Object.fromEntries([...kpis.entries()].filter(([, m]) => m.has(id)).map(([k, m]) => [k, round(m.get(id))]));
      const events = (timelines.get(id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      const days = [...new Set(events.map((e) => e.date))];
      return {
        id,
        highlights: list.sort((a, b) => a.rank - b.rank),
        values,
        timeline: events.length
          ? { firstDate: days[0], lastDate: days.at(-1), activeDays: days.length, events: events.slice(0, MAX_TIMELINE) }
          : null,
      };
    })
    .sort((a, b) => b.highlights.length - a.highlights.length || a.highlights[0].rank - b.highlights[0].rank)
    .slice(0, MAX_PROTAGONISTS);

  return { uniqueIds: allIds.size, kpis: [...kpis.keys()], temporal, protagonists };
}

/** Texto compacto para la IA. */
export function idInsightsForPrompt(insights) {
  if (!insights?.protagonists.length) return '';
  const lines = insights.protagonists.map((p) => {
    const hl = p.highlights.map((h) => `${h.kpi} ${h.value} (#${h.rank} ${h.direction === 'bajo' ? 'más bajo' : 'más alto'} de ${h.of})`).join('; ');
    const tl = p.timeline
      ? ` · actividad entre ${p.timeline.firstDate} y ${p.timeline.lastDate} (${p.timeline.activeDays} días con registros)`
      : '';
    return `- ID ${p.id}: ${hl}${tl}`;
  });
  return `

IDS CON PROTAGONISMO EN LOS KPI (calculado por el sistema sobre los CSV; ${insights.uniqueIds} IDs únicos en total)
${lines.join('\n')}

Agrega al final del reporte una sección "## Clientes destacados (IDs)" con una viñeta por ID (máximo 10):
indica en qué KPI tiene protagonismo y describe su línea ${insights.temporal ? 'temporal (fechas de actividad)' : 'atemporal (perfil a través de los KPI, sin fechas)'}.
Solo describe los datos, con tono neutral.`;
}
