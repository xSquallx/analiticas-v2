import { ArrowLeft, Check, Copy, Edit3, Link2, Printer, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import Comments from '../components/Comments.jsx';
import FlowHistory from '../components/FlowHistory.jsx';
import { QualityPanel } from '../components/Quality.jsx';
import { Empty, ErrorBox, Markdown, MetricTile, SourceBadge, Spinner, StatusBadge } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useApp } from '../lib/app-context.jsx';
import { formatDate, pct, periodLabel } from '../lib/format.js';

/** Pistas de contexto bajo algunas métricas (tasas calculadas). */
function hintFor(key, r) {
  if (key === 'emailsOpened') return r.emailsSent ? `${pct(r.emailsOpened, r.emailsSent)} de enviados` : null;
  if (key === 'emailsClicked') return r.emailsOpened ? `${pct(r.emailsClicked, r.emailsOpened)} de aperturas` : null;
  if (key === 'depositors') return r.targetedCustomers ? `${pct(r.depositors, r.targetedCustomers)} del segmento` : null;
  return null;
}

export default function ReportDetail() {
  const { id } = useParams();
  const { meta, canEdit } = useApp();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setReport(null);
    api.get(`/reports/${id}`).then((d) => setReport(d.report)).catch((e) => setError(e));
  }, [id]);

  if (error?.status === 404) return <Empty title="Reporte no encontrado">Puede que haya sido eliminado o aún no esté publicado.</Empty>;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!report) return <Spinner />;

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const remove = async () => {
    if (!window.confirm(`¿Eliminar definitivamente "${report.flowName}"? Esta acción no se puede deshacer.`)) return;
    await api.del(`/reports/${report.id}`);
    navigate('/reportes');
  };

  const kpis = meta.metrics.filter((m) => m.group === 'kpi');
  const audience = meta.metrics.filter((m) => m.group === 'audience');
  const hasAudience = audience.some((m) => report[m.key] != null);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/reportes" className="flex items-center gap-1 text-sm text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Reportes
        </Link>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={copyLink}>
            {copied ? <Check className="h-4 w-4 text-good" /> : <Link2 className="h-4 w-4" />} {copied ? 'Copiado' : 'Copiar enlace'}
          </button>
          <button className="btn-ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> PDF
          </button>
          {canEdit && (
            <>
              <Link to={`/admin/nuevo?from=${report.id}`} className="btn-ghost" title="Crear el análisis de otro mes con el mismo nombre y moneda">
                <Copy className="h-4 w-4" /> Duplicar
              </Link>
              <Link to={`/admin/reportes/${report.id}`} className="btn-ghost">
                <Edit3 className="h-4 w-4" /> Editar
              </Link>
              <button className="btn-danger" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card p-6 print-dark-text">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-white">{report.flowName}</h1>
          <SourceBadge source={report.source} />
          {canEdit && <StatusBadge status={report.status} />}
        </div>
        <p className="mt-1 text-sm text-muted">
          {periodLabel(meta.months, report.month, report.year)} · <span className="text-indigo-300">{report.currency}</span>
          {report.analyzedAt && <> · analizado el {formatDate(report.analyzedAt)}</>}
          {canEdit && report.createdBy && <> · creado por {report.createdBy.name}</>}
          {canEdit && report.status === 'IN_REVIEW' && <> · revisa: {report.reviewer?.name ?? 'sin asignar'}</>}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
          {kpis.map((m) => (
            <MetricTile
              key={m.key}
              metric={m}
              value={report[m.key]}
              currency={report.currency}
              tone={m.key === 'avgNetRevenue' && report[m.key] != null ? (report[m.key] < 0 ? 'bad' : 'good') : undefined}
            />
          ))}
        </div>

        {hasAudience && (
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            {audience.map((m) => (
              <MetricTile key={m.key} metric={m} value={report[m.key]} hint={hintFor(m.key, report)} />
            ))}
          </div>
        )}
      </div>

      {canEdit && <QualityPanel reportId={report.id} refreshKey={report.updatedAt} />}

      <FlowHistory report={report} />

      <div className="card p-6 sm:p-8">
        <Markdown>{report.analysis}</Markdown>
      </div>

      {canEdit && report.notes && (
        <div className="card no-print p-5">
          <p className="label">Notas internas (solo el equipo)</p>
          <p className="whitespace-pre-wrap text-sm text-slate-300">{report.notes}</p>
        </div>
      )}

      {canEdit && <Comments reportId={report.id} refreshKey={report.updatedAt} />}
    </div>
  );
}
