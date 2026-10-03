import Papa from 'papaparse';

// CSVs más pequeños que esto se envían completos a la IA; los más grandes se resumen.
const FULL_TEXT_LIMIT = 60_000;
const SAMPLE_ROWS = 150;
const TOP_N = 10;

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().replace(/[$\s]/g, '');
  if (s === '') return null;
  // Acepta "1,234.56", "1.234,56" y "1234.56"
  const normalized = /,\d{1,2}$/.test(s) && s.includes('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Quita BOM y detecta separador automáticamente. */
export function parseCsv(text) {
  const clean = text.replace(/^﻿/, '');
  const { data, meta } = Papa.parse(clean, { header: true, skipEmptyLines: 'greedy', dynamicTyping: false });
  const columns = (meta.fields ?? []).filter((c) => c && c.trim() !== '');
  return { rows: data, columns };
}

/** Columnas en las que al menos el 80% de los valores no vacíos son numéricos. */
function numericColumns(rows, columns) {
  return columns.filter((col) => {
    const values = rows.map((r) => r[col]).filter((v) => v !== undefined && String(v).trim() !== '');
    if (values.length === 0) return false;
    const numeric = values.filter((v) => toNumber(v) !== null).length;
    return numeric / values.length >= 0.8;
  });
}

function idColumn(columns) {
  return columns.find((c) => /(^|\b)(customer|client|cliente|user|usuario|player|jugador)?[\s_-]*id\b/i.test(c)) ?? columns[0];
}

/** Cuenta valores únicos de la columna de ID (para el archivo de depositantes). */
export function countUniqueIds(text) {
  const { rows, columns } = parseCsv(text);
  if (columns.length === 0) return null;
  const col = idColumn(columns);
  const ids = new Set(rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean));
  return ids.size || null;
}

/**
 * Prepara el contenido de un CSV para la IA. Si es pequeño se envía completo;
 * si es grande se envían estadísticas exactas calculadas aquí + muestra + extremos.
 */
export function describeCsvForAi(text) {
  const { rows, columns } = parseCsv(text);
  if (text.length <= FULL_TEXT_LIMIT) {
    return { mode: 'full', rowCount: rows.length, content: text.replace(/^﻿/, '') };
  }

  const numCols = numericColumns(rows, columns);
  const idCol = idColumn(columns);
  const lines = [`Filas totales: ${rows.length}`, `Columnas: ${columns.join(', ')}`, '', 'Estadísticas exactas por columna numérica (calculadas sobre TODAS las filas):'];

  for (const col of numCols.filter((c) => c !== idCol)) {
    const values = rows.map((r) => toNumber(r[col])).filter((v) => v !== null);
    if (values.length === 0) continue;
    const sum = values.reduce((a, b) => a + b, 0);
    const negatives = values.filter((v) => v < 0).length;
    const min = values.reduce((a, b) => (b < a ? b : a));
    const max = values.reduce((a, b) => (b > a ? b : a));
    lines.push(`- ${col}: n=${values.length}, suma=${round(sum)}, promedio=${round(sum / values.length)}, min=${round(min)}, max=${round(max)}, negativos=${negatives}`);
  }

  for (const col of numCols.filter((c) => c !== idCol).slice(0, 6)) {
    const sorted = rows
      .map((r) => ({ id: r[idCol], v: toNumber(r[col]) }))
      .filter((x) => x.v !== null)
      .sort((a, b) => b.v - a.v);
    lines.push('', `Top ${TOP_N} por ${col}: ${sorted.slice(0, TOP_N).map((x) => `${x.id}=${round(x.v)}`).join('; ')}`);
    lines.push(`Últimos ${TOP_N} por ${col}: ${sorted.slice(-TOP_N).map((x) => `${x.id}=${round(x.v)}`).join('; ')}`);
  }

  lines.push('', `Muestra de las primeras ${Math.min(SAMPLE_ROWS, rows.length)} filas:`);
  lines.push(Papa.unparse(rows.slice(0, SAMPLE_ROWS), { columns }));

  return { mode: 'summary', rowCount: rows.length, content: lines.join('\n') };
}

const round = (n) => Math.round(n * 10000) / 10000;
