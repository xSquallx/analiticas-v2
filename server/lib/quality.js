// Control de calidad de datos: detecta valores fuera del rango habitual y datos faltantes.
// Solo marca para verificar; nunca modifica datos. Los avisos los ve únicamente el equipo.
//
// Regla (calibrada con los 444 reportes de V1, marca ~6%):
//  - Si el flujo tiene historial (≥2 meses anteriores u otros meses), se compara con la mediana
//    de su propio historial: se marca si la diferencia supera HISTORY_FACTOR veces la escala.
//    La escala es el mayor entre |mediana del historial| y |mediana del mes|, para que un
//    net revenue cercano a cero no dispare avisos por cualquier variación.
//  - Si no tiene historial, se compara con la mediana de todos los flujos del mes y moneda:
//    se marca si supera MONTH_FACTOR veces (umbral alto porque VIP y Bronze difieren por naturaleza).

import { METRICS, UPLOAD_SLOTS } from './catalog.js';
import { familyKey } from './flowKey.js';

export const HISTORY_FACTOR = 5;
export const MONTH_FACTOR = 30;
const MIN_HISTORY = 2;
const MIN_MONTH_GROUP = 5;

/** Archivos sin los cuales el análisis suele quedar incompleto. */
export const KEY_SLOTS = ['avg_deposits', 'avg_deposit_amount', 'avg_activity_days', 'avg_net_revenue'];
/** Métricas que conviene tener antes de publicar. */
export const KEY_METRICS = ['avgDeposits', 'avgDepositAmount', 'avgActivityDays', 'avgNetRevenue'];

const KPI_KEYS = METRICS.filter((m) => m.group === 'kpi').map((m) => m.key);
const metricLabel = (key) => METRICS.find((m) => m.key === key)?.label ?? key;
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('es-ES');

export function median(values) {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const monthKey = (r) => `${r.year}-${r.month}|${r.currency}`;

/**
 * Calcula los avisos de valores atípicos de cada reporte de `reports`.
 * `reports` debe incluir el conjunto de comparación (idealmente todos los de esas monedas).
 * Devuelve Map(reportId → [{ metric, label, value, baseline, basis, message }]).
 */
export function computeOutliers(reports) {
  const byMonth = new Map();
  const byFamily = new Map();
  for (const r of reports) {
    const mk = monthKey(r);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(r);
    const fk = familyKey(r.flowName, r.currency);
    if (!byFamily.has(fk)) byFamily.set(fk, []);
    byFamily.get(fk).push(r);
  }

  const monthMedians = new Map();
  for (const [mk, list] of byMonth) {
    monthMedians.set(mk, { size: list.length, medians: Object.fromEntries(KPI_KEYS.map((k) => [k, median(list.map((r) => r[k]))])) });
  }

  const result = new Map();
  for (const r of reports) {
    const month = monthMedians.get(monthKey(r));
    // Historial: el mismo flujo en otros meses
    const history = byFamily.get(familyKey(r.flowName, r.currency)).filter((o) => o.id !== r.id && !(o.year === r.year && o.month === r.month));
    const flags = [];

    for (const key of KPI_KEYS) {
      const value = r[key];
      if (value == null) continue;
      const monthMed = month.medians[key];
      const histValues = history.map((o) => o[key]).filter((v) => v != null);

      if (histValues.length >= MIN_HISTORY) {
        const histMed = median(histValues);
        const scale = Math.max(Math.abs(histMed), Math.abs(monthMed ?? 0));
        if (scale > 0 && Math.abs(value - histMed) / scale > HISTORY_FACTOR) {
          flags.push({
            metric: key, label: metricLabel(key), value, baseline: histMed, basis: 'history',
            message: `${metricLabel(key)}: ${fmt(value)} se aleja mucho del historial de este flujo (mediana ${fmt(histMed)} en ${histValues.length} meses). Verificar el dato.`,
          });
        }
      } else if (month.size >= MIN_MONTH_GROUP && monthMed) {
        const ratio = Math.abs(value) / Math.abs(monthMed);
        if (ratio > MONTH_FACTOR) {
          flags.push({
            metric: key, label: metricLabel(key), value, baseline: monthMed, basis: 'month',
            message: `${metricLabel(key)}: ${fmt(value)} es ${fmt(ratio)} veces la mediana de los flujos del mes en ${r.currency} (${fmt(monthMed)}). Verificar el dato.`,
          });
        }
      }
    }
    if (flags.length) result.set(r.id, flags);
  }
  return result;
}

/** Datos faltantes de un reporte (archivos clave y métricas principales). */
export function missingData(report, files) {
  return {
    missingFiles: UPLOAD_SLOTS.filter((s) => KEY_SLOTS.includes(s.key) && !files.some((f) => f.slot === s.key)).map((s) => s.label),
    missingMetrics: KEY_METRICS.filter((k) => report[k] == null).map(metricLabel),
  };
}
