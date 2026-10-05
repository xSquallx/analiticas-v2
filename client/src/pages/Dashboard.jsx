import { ArrowDownWideNarrow, ArrowUpWideNarrow, BarChart3, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilterBar, applyFilters, useFilters } from '../components/Filters.jsx';
import { QualityMark, useQualityFlags } from '../components/Quality.jsx';
import { Empty, ErrorBox, Select, SourceBadge, Spinner } from '../components/ui.jsx';
import { metricByKey, useApp } from '../lib/app-context.jsx';
import { average, formatMetric, formatNumber, median, periodLabel } from '../lib/format.js';
import { useReports } from '../lib/useReports.js';

const RANKABLE = ['avgNetRevenue', 'avgDepositAmount', 'avgDeposits', 'avgActivityDays', 'avgBetAmount', 'depositors'];
const BAR_COLOR = '#818cf8';

function Stat({ label, value, sub }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ChartTooltip({ active, payload, currency }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white">{d.label}</p>
      <p className="text-slate-300">
        Mediana: <span className="font-semibold text-white">{formatNumber(d.value)} {currency}</span>
      </p>
      <p className="text-muted">Promedio: {formatNumber(d.mean)} · {d.count} flujos</p>
    </div>
  );
}

export default function Dashboard() {
  const { meta } = useApp();
  const { reports, loading, error } = useReports();
  const qualityFlags = useQualityFlags();
  const [filters, setFilter] = useFilters({ currency: meta.currencies[0] });
  const [rankKey, setRankKey] = useState('avgNetRevenue');
  const [best, setBest] = useState(true);

  const filtered = useMemo(() => applyFilters(reports, filters), [reports, filters]);

  // Evolución mensual de la moneda elegida (ignora el filtro de mes para mostrar la tendencia)
  const monthly = useMemo(() => {
    const scope = applyFilters(reports, { ...filters, month: '', q: '' });
    const groups = new Map();
    for (const r of scope) {
      const key = r.year * 100 + r.month;
      if (!groups.has(key)) groups.set(key, { key, label: periodLabel(meta.months, r.month, r.year), items: [] });
      groups.get(key).items.push(r);
    }
    return [...groups.values()]
      .sort((a, b) => a.key - b.key)
      .map((g) => {
        const values = g.items.map((r) => r.avgNetRevenue);
        return { label: g.label, value: median(values), mean: average(values), count: g.items.length };
      });
  }, [reports, filters, meta.months]);

  const ranking = useMemo(() => {
    const withValue = filtered.filter((r) => r[rankKey] != null);
    withValue.sort((a, b) => (best ? b[rankKey] - a[rankKey] : a[rankKey] - b[rankKey]));
    return withValue.slice(0, 10);
  }, [filtered, rankKey, best]);

  const byCurrency = useMemo(
    () => meta.currencies.map((c) => ({ c, n: applyFilters(reports, { ...filters, currency: c, q: '' }).length })),
    [reports, filters, meta.currencies],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox>{error}</ErrorBox>;

  const nr = filtered.map((r) => r.avgNetRevenue).filter((v) => v != null);
  const positive = nr.filter((v) => v > 0).length;
  const rankMetric = metricByKey(meta, rankKey);
  const cur = filters.currency;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-muted">Los montos solo se comparan dentro de una misma moneda.</p>
        </div>
        <FilterBar reports={reports} filters={filters} setFilter={setFilter} requireCurrency />
      </div>

      {filtered.length === 0 ? (
        <Empty icon={BarChart3} title="No hay flujos con estos filtros">Prueba con otra moneda o periodo.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Flujos analizados" value={filtered.length} sub={cur} />
            <Stat label="Net revenue mediano" value={formatNumber(median(nr))} sub={`${cur} · promedio: ${formatNumber(average(nr))}`} />
            <Stat label="Flujos con NR positivo" value={nr.length ? `${Math.round((positive / nr.length) * 100)}%` : '—'} sub={`${positive} de ${nr.length}`} />
            <Stat label="Días de actividad prom." value={formatNumber(average(filtered.map((r) => r.avgActivityDays)))} sub={`Depósitos prom.: ${formatNumber(average(filtered.map((r) => r.avgDeposits)))}`} />
          </div>

          <div className="card p-5">
            <h2 className="font-bold text-white">Net revenue mediano por mes · {cur}</h2>
            <p className="mb-4 text-xs text-muted">Mediana del net revenue promedio de los flujos de cada mes (no la distorsionan los flujos atípicos).</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#24304a" />
                  <XAxis dataKey="label" tick={{ fill: '#8a97b2', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8a97b2', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                  <ReferenceLine y={0} stroke="#8a97b2" />
                  <Tooltip cursor={{ fill: 'rgba(129,140,248,0.08)' }} content={<ChartTooltip currency={cur} />} />
                  <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold text-white">
                <Trophy className="h-5 w-5 text-amber-400" /> {best ? 'Mejores' : 'Peores'} 10 flujos
              </h2>
              <div className="flex items-end gap-2">
                <Select value={rankKey} onChange={setRankKey} options={RANKABLE.map((k) => ({ value: k, label: metricByKey(meta, k).label }))} />
                <button className="btn-ghost" onClick={() => setBest((b) => !b)} title="Invertir orden">
                  {best ? <ArrowDownWideNarrow className="h-4 w-4" /> : <ArrowUpWideNarrow className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {ranking.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">Ningún flujo tiene “{rankMetric.label}” en este periodo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-3">#</th>
                      <th className="py-2 pr-3">Flujo</th>
                      <th className="py-2 pr-3">Periodo</th>
                      <th className="py-2 text-right">{rankMetric.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr key={r.id} className="border-t border-line">
                        <td className="py-2 pr-3 text-muted">{i + 1}</td>
                        <td className="py-2 pr-3">
                          <Link to={`/reportes/${r.id}`} className="font-medium text-slate-200 hover:text-indigo-300">
                            {r.flowName}
                          </Link>{' '}
                          <SourceBadge source={r.source} /> <QualityMark flags={qualityFlags[r.id]} />
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 text-muted">{periodLabel(meta.months, r.month, r.year)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums text-white">{formatMetric(r[rankKey], rankMetric, cur)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {byCurrency.map(({ c, n }) => (
          <button
            key={c}
            onClick={() => setFilter('currency', c)}
            className={`card p-4 text-left transition-colors hover:border-brand ${c === cur ? 'border-brand' : ''}`}
          >
            <p className="text-sm text-muted">{c}</p>
            <p className="text-2xl font-black text-white">{n}</p>
            <p className="text-xs text-muted">flujos en el periodo</p>
          </button>
        ))}
      </div>
    </div>
  );
}
