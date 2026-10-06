import { FileText } from 'lucide-react';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { FilterBar, applyFilters, useFilters } from '../components/Filters.jsx';
import { QualityMark, useQualityFlags } from '../components/Quality.jsx';
import { Empty, ErrorBox, SourceBadge, Spinner, StatusBadge } from '../components/ui.jsx';
import { metricByKey, useApp } from '../lib/app-context.jsx';
import { formatMetric, periodLabel } from '../lib/format.js';
import { useReports } from '../lib/useReports.js';

const COLUMNS = ['avgDeposits', 'avgDepositAmount', 'avgActivityDays', 'avgNetRevenue'];

export default function Reports() {
  const { meta, canEdit } = useApp();
  const navigate = useNavigate();
  const { reports, loading, error } = useReports();
  const qualityFlags = useQualityFlags();
  const [filters, setFilter] = useFilters();
  const filtered = useMemo(() => applyFilters(reports, filters), [reports, filters]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox>{error}</ErrorBox>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Reportes de flujos</h1>
          <p className="text-sm text-muted">{filtered.length} de {reports.length} reportes</p>
        </div>
      </div>
      <div className="card p-4">
        <FilterBar reports={reports} filters={filters} setFilter={setFilter} search />
      </div>

      {filtered.length === 0 ? (
        <Empty icon={FileText} title="No hay reportes con estos filtros" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Flujo</th>
                <th className="px-4 py-3">Periodo</th>
                <th className="px-4 py-3">Mercado</th>
                {COLUMNS.map((k) => (
                  <th key={k} className="px-4 py-3 text-right">{metricByKey(meta, k).label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/reportes/${r.id}`)}
                  className="cursor-pointer border-t border-line transition-colors hover:bg-panel-2"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-100">{r.flowName}</span>
                      <SourceBadge source={r.source} />
                      {canEdit && r.status !== 'PUBLISHED' && <StatusBadge status={r.status} />}
                      <QualityMark flags={qualityFlags[r.id]} />
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{periodLabel(meta.months, r.month, r.year)}</td>
                  <td className="px-4 py-3 text-muted">{r.currency}</td>
                  {COLUMNS.map((k) => {
                    const m = metricByKey(meta, k);
                    const v = r[k];
                    const tone = k === 'avgNetRevenue' && v != null ? (v < 0 ? 'text-bad' : 'text-good') : 'text-slate-200';
                    return (
                      <td key={k} className={`px-4 py-3 text-right tabular-nums ${v == null ? 'text-slate-600' : tone}`}>
                        {formatMetric(v, m)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
