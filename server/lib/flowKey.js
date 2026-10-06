// Agrupa reportes del "mismo flujo" a lo largo de los meses.
// La fecha que llevan los nombres de Optimove ("… JLV 08-07" → "… 20/08") es solo la fecha
// de última modificación del flujo: no lo distingue de nada. Por eso el flujo se identifica
// por su nombre SIN fechas (familyKey). La clave incluye el mercado (VES/USD, CLP, PEN, MXN).

const normalize = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const clean = (s) => s.replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();

const stripDates = (s) =>
  s
    .replace(/\b\d{1,2}\s*[/.-]\s*\d{1,2}(\s*[/.-]\s*\d{2,4})?\b/g, ' ') // 08-07, 20/08, 05/06/2026
    .replace(/\b\d{4}\b/g, ' '); // 0207

export const familyKey = (name, currency) => `${clean(stripDates(normalize(name)))}|${currency}`;

export const periodIndex = (r) => r.year * 12 + (r.month - 1);

/**
 * Para cada reporte de un mismo flujo (ordenados por periodo) busca con cuál compararlo:
 * el reporte del periodo anterior más reciente. Si en ese periodo hay más de uno del mismo
 * flujo, la comparación es ambigua y se omite (null) en lugar de elegir uno al azar.
 */
export function previousMatches(items) {
  const result = new Map();
  for (const item of items) {
    const earlier = items.filter((o) => periodIndex(o) < periodIndex(item));
    if (earlier.length === 0) continue;
    const lastPeriod = Math.max(...earlier.map(periodIndex));
    const candidates = earlier.filter((o) => periodIndex(o) === lastPeriod);
    if (candidates.length === 1) result.set(item.id, candidates[0]);
  }
  return result;
}

/**
 * Vertical según el nombre del flujo (regla del equipo): si el nombre dice CASINO o DEPORTE,
 * esa es la vertical; si no dice ninguna (o dice ambas), el flujo abarca casino y deporte.
 */
export function flowVertical(name) {
  const n = normalize(name);
  const casino = /\bcasino\b/.test(n);
  const sport = /\bdeportes?\b/.test(n);
  if (casino && !sport) return 'Casino';
  if (sport && !casino) return 'Deporte';
  return 'Casino y deporte';
}
