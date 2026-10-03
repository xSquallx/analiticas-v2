import { ArrowDownRight, ArrowUpRight, History } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api.js';
import { metricByKey, useApp } from '../lib/app-context.jsx';
import { formatMetric, formatNumber } from '../lib/format.js';
import { Select } from './ui.jsx';

const TABLE_METRICS = ['avgDeposits', 'avgDepositAmount', 'avgActivityDays', 'avgBetAmount', 'avgNetRevenue'];
const CURRENT_COLOR = '#818cf8';
const OTHER_COLOR = '#475569';

const SHORT_MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const dateInName = (name) => name.match(/\d{1,2}\s*[/.-]\s*\d{1,2}|\b\d{4}\b/)?.[0]?.replace(/\s/g, '');

/** Variación porcentual frente al reporte anterior comparable. */
function Delta({ value, prev }) {
  if (value == null || prev == null || prev === 0) return null;
  const pct = ((value - prev) / Math.abs(prev)) * 100;
  if (!Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${up ? 'text-good' : 'text-bad'}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {formatNumber(Math.round(pct * 10) / 10)}%
    </span>
  );
}

function ChartTooltip({ active, payload, metric, currency }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white">{d.name}</p>
      <p className="text-muted">{d.period}</p>
      <p className="mt-1 text-slate-300">
        {metric.label}: <span className="font-semibold text-white">{formatMetric(d.value, metric, currency)}</span>
      </p>
    </div>
  );
}

/** Evolución del mismo flujo (todas sus versiones) en los distintos meses. */
export default function FlowHistory({ report }) {
  const { meta } = useApp();
  const [items, setItems] = useState(null);
  const [metricKey, setMetricKey] = useState('avgNetRevenue');

  useEffect(() => {
    setItems(null);
    api.get(`/reports/${report.id}/history`).then((d) => setItems(d.items)).catch(() => setItems([]));
  }, [report.id, report.updatedAt]);

  const byId = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items]);

  const chartData = useMemo(() => {
    if (!items) return [];
    const perPeriod = new Map();
    for (const i of items) perPeriod.set(`${i.year}-${i.month}`, (perPeriod.get(`${i.year}-${i.month}`) ?? 0) + 1);
    return items.map((i) => {
      const base = `${SHORT_MONTHS[i.month - 1]} ${String(i.year).slice(2)}`;
      const several = perPeriod.get(`${i.year}-${i.month}`) > 1;
      return {
        id: i.id,
        name: i.flowName,
        period: `${meta.months[i.month - 1]} ${i.year}`,
        label: several ? `${base} · ${dateInName(i.flowName) ?? '?'}` : base,
        value: i[metricKey],
        current: i.id === report.id,
      };
    });
  }, [items, metricKey, meta.months, report.id]);

  if (!items) return null;

  if (items.length <= 1) {
    return (
      <div className="card no-print flex items-center gap-3 p-4 text-sm text-muted">
        <History className="h-4 w-4 shrink-0" />
        Primer mes registrado de este flujo en {report.currency}. Cuando se analice el mes siguiente aparecerá aquí su evolución.
      </div>
    );
  }

  const metric = metricByKey(meta, metricKey);
  const available = meta.metrics.filter((m) => m.group === 'kpi' && items.some((i) => i[m.key] != null));
  const periods = new Set(items.map((i) => `${i.year}-${i.month}`)).size;

  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <History className="h-5 w-5 text-indigo-300" /> Historial del flujo
          </h2>
          <p className="text-xs text-muted">
            {items.length} reportes en {periods} {periods === 1 ? 'mes' : 'meses'} · {report.currency} · las variaciones comparan con la misma versión del mes anterior
          </p>
        </div>
        <div className="no-print">
          <Select value={metricKey} onChange={setMetricKey} options={available.map((m) => ({ value: m.key, label: m.label }))} />
        </div>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#24304a" />
            <XAxis dataKey="label" tick={{ fill: '#8a97b2', fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis tick={{ fill: '#8a97b2', fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
            <ReferenceLine y={0} stroke="#8a97b2" />
            <Tooltip cursor={{ fill: 'rgba(129,140,248,0.08)' }} content={<ChartTooltip metric={metric} currency={report.currency} />} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {chartData.map((d) => (
                <Cell key={d.id} fill={d.current ? CURRENT_COLOR : OTHER_COLOR} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex items-center gap-2 text-xs text-muted">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CURRENT_COLOR }} /> este reporte
        <span className="ml-2 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OTHER_COLOR }} /> otros meses / versiones
      </p>

      <div className="mt-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-2 pr-3">Periodo</th>
              <th className="py-2 pr-3">Versión</th>
              {TABLE_METRICS.map((k) => (
                <th key={k} className="py-2 pl-3 text-right">{metricByKey(meta, k).label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...items].reverse().map((i) => {
              const prev = i.previousId ? byId.get(i.previousId) : null;
              const current = i.id === report.id;
              return (
                <tr key={i.id} className={`border-t border-line ${current ? 'bg-brand/10' : ''}`}>
                  <td className="whitespace-nowrap py-2 pr-3 text-muted">{meta.months[i.month - 1]} {i.year}</td>
                  <td className="py-2 pr-3">
                    {current ? (
                      <span className="font-semibold text-white">{i.flowName} <span className="text-xs font-normal text-indigo-300">(este)</span></span>
                    ) : (
                      <Link to={`/reportes/${i.id}`} className="text-slate-200 hover:text-indigo-300">{i.flowName}</Link>
                    )}
                  </td>
                  {TABLE_METRICS.map((k) => (
                    <td key={k} className="py-2 pl-3 text-right align-top tabular-nums">
                      <div className={i[k] == null ? 'text-slate-600' : 'text-slate-200'}>{formatMetric(i[k], metricByKey(meta, k))}</div>
                      <Delta value={i[k]} prev={prev?.[k]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
