const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const intf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });

/** Formatea un valor de métrica. null/undefined se muestra como "—" (dato no disponible). */
export function formatMetric(value, metric, currency) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  // Todos los mercados reportan en dólares; el mercado (VES/USD, CLP…) no es la moneda del monto.
  if (metric?.format === 'money') return `${nf.format(value)} USD`;
  if (metric?.type === 'int') return intf.format(value);
  return nf.format(value);
}

export const formatNumber = (v) => (v === null || v === undefined ? '—' : nf.format(v));

export const pct = (part, total) => (part != null && total ? `${nf.format((part / total) * 100)}%` : '—');

export function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const periodLabel = (months, month, year) => `${months[month - 1] ?? month} ${year}`;

export const average = (values) => {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Mediana: más representativa que el promedio cuando hay flujos atípicos. */
export const median = (values) => {
  const v = values.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};
