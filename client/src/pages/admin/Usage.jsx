import { CheckCircle2, Gauge, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Empty, ErrorBox, Select, Spinner } from '../../components/ui.jsx';
import { api, toQuery } from '../../lib/api.js';
import { useApp } from '../../lib/app-context.jsx';
import { formatNumber } from '../../lib/format.js';

const BAR_COLOR = '#818cf8';
const usd = (v) =>
  v == null ? '—' : `$${v.toLocaleString('en-US', { minimumFractionDigits: v > 0 && v < 1 ? 4 : 2, maximumFractionDigits: v > 0 && v < 1 ? 4 : 2 })}`;
const tokens = (v) => (v >= 1_000_000 ? `${formatNumber(Math.round(v / 10_000) / 100)} M` : v >= 1000 ? `${formatNumber(Math.round(v / 100) / 10)} k` : String(v ?? 0));
const dateTime = (iso) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

function Stat({ label, value, sub }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function DayTooltip({ active, payload, monthName }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-white">{d.day} de {monthName}</p>
      <p className="text-slate-300">{d.analyses} análisis · {usd(d.costUsd)}</p>
    </div>
  );
}

export default function Usage() {
  const { meta } = useApp();
  const now = new Date();
  const [period, setPeriod] = useState({ year: String(now.getFullYear()), month: String(now.getMonth() + 1) });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/admin/usage${toQuery(period)}`).then(setData).catch((e) => setError(e.message));
  }, [period]);

  const years = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - i));
  const monthName = meta.months[Number(period.month) - 1];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Gauge className="h-6 w-6 text-indigo-300" /> Consumo de IA
          </h1>
          <p className="text-sm text-muted">Cada clic en “Analizar con IA” queda registrado. Ver reportes no consume.</p>
        </div>
        <div className="flex gap-3">
          <Select label="Mes" value={period.month} onChange={(v) => setPeriod((p) => ({ ...p, month: v }))} options={meta.months.map((m, i) => ({ value: String(i + 1), label: m }))} />
          <Select label="Año" value={period.year} onChange={(v) => setPeriod((p) => ({ ...p, year: v }))} options={years.map((y) => ({ value: y, label: y }))} />
        </div>
      </div>

      <ErrorBox>{error}</ErrorBox>
      {!data && !error && <Spinner />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Análisis realizados" value={data.totals.analyses} sub={data.totals.failed ? `${data.totals.failed} fallidos · ${data.totals.tests} pruebas` : `${data.totals.tests} pruebas de conexión`} />
            <Stat label="Costo estimado" value={usd(data.totals.costUsd)} sub={`${monthName} ${data.year} · USD`} />
            <Stat label="Costo por análisis" value={usd(data.totals.avgCostPerAnalysis)} sub={data.totals.avgSeconds ? `promedio · ${formatNumber(Math.round(data.totals.avgSeconds))} s por análisis` : 'promedio'} />
            <Stat label="Tokens usados" value={tokens(data.totals.totalTokens)} sub={`${tokens(data.totals.inputTokens)} entrada · ${tokens(data.totals.outputTokens)} salida`} />
          </div>

          <p className="text-xs text-muted">
            Modelo actual: <span className="text-slate-300">{data.model}</span>
            {data.price ? (
              <> · precio: {usd(data.price.input)} por 1M tokens de entrada y {usd(data.price.output)} por 1M de salida (incluye “pensamiento”).</>
            ) : (
              <> · sin precio configurado para este modelo (el costo se muestra en $0).</>
            )}{' '}
            Es una estimación con los precios públicos de Google; la factura exacta está en AI Studio → Billing.
          </p>

          {data.recent.length === 0 ? (
            <Empty icon={Gauge} title={`Sin consultas a la IA en ${monthName} ${data.year}`} />
          ) : (
            <>
              <div className="card p-5">
                <h2 className="mb-4 font-bold text-white">Análisis por día</h2>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.byDay} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke="#24304a" />
                      <XAxis dataKey="day" tick={{ fill: '#8a97b2', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fill: '#8a97b2', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip cursor={{ fill: 'rgba(129,140,248,0.08)' }} content={<DayTooltip monthName={monthName} />} />
                      <Bar dataKey="analyses" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card overflow-x-auto p-5">
                <h2 className="mb-3 font-bold text-white">Por persona</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-3">Usuario</th>
                      <th className="py-2 pr-3 text-right">Análisis</th>
                      <th className="py-2 pr-3 text-right">Fallidos</th>
                      <th className="py-2 pr-3 text-right">Tokens</th>
                      <th className="py-2 text-right">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((u) => (
                      <tr key={u.name} className="border-t border-line">
                        <td className="py-2 pr-3 text-slate-200">{u.name}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{u.analyses}</td>
                        <td className={`py-2 pr-3 text-right tabular-nums ${u.failed ? 'text-bad' : 'text-muted'}`}>{u.failed}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted">{tokens(u.tokens)}</td>
                        <td className="py-2 text-right font-semibold tabular-nums text-white">{usd(u.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="card overflow-x-auto p-5">
                <h2 className="mb-3 font-bold text-white">Detalle de consultas</h2>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted">
                    <tr>
                      <th className="py-2 pr-3">Fecha</th>
                      <th className="py-2 pr-3">Usuario</th>
                      <th className="py-2 pr-3">Reporte</th>
                      <th className="py-2 pr-3 text-right">Entrada</th>
                      <th className="py-2 pr-3 text-right">Salida</th>
                      <th className="py-2 pr-3 text-right">Costo</th>
                      <th className="py-2 pr-3 text-right">Tiempo</th>
                      <th className="py-2">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((r) => (
                      <tr key={r.id} className="border-t border-line align-top">
                        <td className="whitespace-nowrap py-2 pr-3 text-muted">{dateTime(r.createdAt)}</td>
                        <td className="py-2 pr-3 text-slate-200">{r.user ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {r.kind === 'TEST' ? (
                            <span className="text-muted">Prueba de conexión</span>
                          ) : r.reportId ? (
                            <Link to={`/admin/reportes/${r.reportId}`} className="text-slate-200 hover:text-indigo-300">{r.reportLabel}</Link>
                          ) : (
                            <span className="text-muted">{r.reportLabel ?? '—'} (eliminado)</span>
                          )}
                          {r.attempts > 1 && <span className="ml-1 text-xs text-amber-300">· {r.attempts} intentos</span>}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted">{tokens(r.inputTokens)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted">{tokens(r.outputTokens)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-white">{usd(r.costUsd)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted">{formatNumber(Math.round(r.durationMs / 100) / 10)} s</td>
                        <td className="py-2">
                          {r.success ? (
                            <span className="inline-flex items-center gap-1 text-xs text-good"><CheckCircle2 className="h-3.5 w-3.5" /> OK</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-bad" title={r.error ?? ''}><XCircle className="h-3.5 w-3.5" /> Error</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.recent.length === 100 && <p className="mt-2 text-xs text-muted">Se muestran las últimas 100 consultas del mes.</p>}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
