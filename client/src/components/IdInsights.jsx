import { ArrowDownRight, ArrowUpRight, Fingerprint } from 'lucide-react';
import { formatNumber } from '../lib/format.js';

/**
 * IDs con protagonismo en los KPI (calculado por el sistema a partir de los CSV del reporte).
 * Línea temporal si los CSV traían fechas; si no, perfil atemporal a través de los KPI.
 */
export default function IdInsights({ insights }) {
  if (!insights?.protagonists?.length) return null;

  return (
    <div className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-white">
        <Fingerprint className="h-5 w-5 text-indigo-300" /> IDs destacados en los KPI
      </h2>
      <p className="mb-4 text-xs text-muted">
        {insights.uniqueIds} IDs únicos en los CSV · se muestran los que están entre los 10 primeros (o los 10 más bajos, si hay negativos) de algún KPI ·
        línea {insights.temporal ? 'temporal (los CSV traen fechas)' : 'atemporal (los CSV no traen fechas)'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr>
              <th className="py-2 pr-3">ID</th>
              <th className="py-2 pr-3">Dónde tiene protagonismo</th>
              <th className="py-2">{insights.temporal ? 'Actividad' : 'Perfil en los KPI'}</th>
            </tr>
          </thead>
          <tbody>
            {insights.protagonists.map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap py-2 pr-3 font-mono text-slate-200">{p.id}</td>
                <td className="py-2 pr-3">
                  <ul className="space-y-0.5">
                    {p.highlights.map((h) => (
                      <li key={`${h.kpi}-${h.direction}`} className="flex items-center gap-1 text-slate-300">
                        {h.direction === 'bajo' ? <ArrowDownRight className="h-3.5 w-3.5 text-muted" /> : <ArrowUpRight className="h-3.5 w-3.5 text-muted" />}
                        <span>
                          {h.kpi}: <span className="font-semibold tabular-nums text-white">{formatNumber(h.value)}</span>{' '}
                          <span className="text-xs text-muted">
                            (#{h.rank} {h.direction === 'bajo' ? 'más bajo' : 'más alto'} de {h.of})
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="py-2 text-xs text-muted">
                  {p.timeline ? (
                    <>
                      {p.timeline.firstDate === p.timeline.lastDate ? p.timeline.firstDate : `${p.timeline.firstDate} → ${p.timeline.lastDate}`} · {p.timeline.activeDays}{' '}
                      {p.timeline.activeDays === 1 ? 'día' : 'días'} con registros
                    </>
                  ) : (
                    Object.entries(p.values)
                      .map(([k, v]) => `${k}: ${formatNumber(v)}`)
                      .join(' · ')
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
