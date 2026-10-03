// Agrupa reportes del "mismo flujo" a lo largo de los meses.
// Los nombres de Optimove suelen llevar fechas que cambian entre versiones
// ("MEJORES MAQUINITAS BRONZE - JLV 08-07" → "… 20/08"), así que hay dos claves:
//   - exactKey:  nombre normalizado (misma versión del flujo)
//   - familyKey: nombre sin fechas (todas las versiones del flujo)
// Ambas incluyen la moneda: los montos solo son comparables dentro de una moneda.

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

export const exactKey = (name, currency) => `${clean(normalize(name))}|${currency}`;

export const familyKey = (name, currency) => `${clean(stripDates(normalize(name)))}|${currency}`;

export const periodIndex = (r) => r.year * 12 + (r.month - 1);

/**
 * Para cada reporte (ordenados por periodo) busca con cuál compararlo:
 * la misma versión (exactKey) en el periodo anterior más reciente; si no hay,
 * el único reporte de la familia en el periodo anterior. Si es ambiguo, null.
 */
export function previousMatches(items) {
  const result = new Map();
  for (const item of items) {
    const earlier = items.filter((o) => periodIndex(o) < periodIndex(item));
    if (earlier.length === 0) continue;
    const sameVersion = earlier.filter((o) => exactKey(o.flowName, o.currency) === exactKey(item.flowName, item.currency));
    if (sameVersion.length) {
      result.set(item.id, sameVersion.reduce((a, b) => (periodIndex(b) >= periodIndex(a) ? b : a)));
      continue;
    }
    const lastPeriod = Math.max(...earlier.map(periodIndex));
    const candidates = earlier.filter((o) => periodIndex(o) === lastPeriod);
    if (candidates.length === 1) result.set(item.id, candidates[0]);
  }
  return result;
}
