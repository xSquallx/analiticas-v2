import { ArrowDownRight, ArrowLeft, ArrowUpRight, Check, CheckCheck, Edit3, Link2, Loader2, Printer, RefreshCw, Save, SearchCheck, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Empty, ErrorBox, Markdown, Spinner, StatusBadge } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { metricByKey, useApp } from '../lib/app-context.jsx';
import { formatDate, formatMetric, formatNumber, periodLabel } from '../lib/format.js';

const KPI_KEYS = ['avgNetRevenue', 'avgDeposits', 'avgDepositAmount', 'avgActivityDays'];

function Change({ value }) {
  if (value == null) return <span className="text-xs text-muted">sin mes anterior</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? 'text-good' : 'text-bad'}`}>
      <Icon className="h-3 w-3" />
      {up ? '+' : ''}
      {formatNumber(value)}% vs mes anterior
    </span>
  );
}

function FlowTable({ title, rows, currency }) {
  const { meta } = useApp();
  if (!rows?.length) return null;
  return (
    <div className="card overflow-x-auto p-5">
      <h2 className="mb-3 font-bold text-white">{title}</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-muted">
          <tr>
            <th className="py-2 pr-3">Flujo</th>
            {KPI_KEYS.map((k) => (
              <th key={k} className="py-2 pl-3 text-right">{metricByKey(meta, k).label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-2 pr-3">
                <Link to={`/reportes/${r.id}`} className="text-slate-200 hover:text-indigo-300">{r.flowName}</Link>
              </td>
              {KPI_KEYS.map((k) => (
                <td key={k} className="py-2 pl-3 text-right tabular-nums text-slate-200">{formatMetric(r[k], metricByKey(meta, k), k === 'avgNetRevenue' ? currency : undefined)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SummaryDetail() {
  const { id } = useParams();
  const { meta, canEdit } = useApp();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get(`/summaries/${id}`).then((d) => setSummary(d.summary)).catch(setError);
  }, [id]);

  if (error?.status === 404) return <Empty title="Resumen no encontrado">Puede que aún no esté publicado.</Empty>;
  if (error) return <ErrorBox>{error.message}</ErrorBox>;
  if (!summary) return <Spinner />;

  const s = summary.stats ?? {};
  const cur = summary.currency;

  const act = async (kind, fn) => {
    setBusy(kind);
    setActionError('');
    try {
      await fn();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const patch = (body) => act('save', async () => setSummary({ ...summary, ...(await api.patch(`/summaries/${id}`, body)).summary }));
  const regenerate = () =>
    act('regen', async () => {
      if (!window.confirm('Se generará de nuevo con los reportes publicados actuales y reemplazará el texto (quedará en borrador). ¿Continuar?')) return;
      const { summary: fresh } = await api.post('/summaries/generate', { year: summary.year, month: summary.month, currency: cur });
      setSummary({ ...summary, ...fresh });
      setEditing(false);
    });
  const remove = () =>
    act('delete', async () => {
      if (!window.confirm('¿Eliminar este resumen?')) return;
      await api.del(`/summaries/${id}`);
      navigate('/resumenes');
    });
  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link to="/resumenes" className="flex items-center gap-1 text-sm text-muted hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Resúmenes
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
              <button className="btn-ghost" onClick={regenerate} disabled={!!busy}>
                {busy === 'regen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regenerar
              </button>
              {summary.status === 'PUBLISHED' ? (
                <button className="btn-ghost" onClick={() => patch({ status: 'DRAFT' })} disabled={!!busy}>
                  <Undo2 className="h-4 w-4" /> Pasar a borrador
                </button>
              ) : (
                <button className="btn-primary" onClick={() => patch({ status: 'PUBLISHED' })} disabled={!!busy}>
                  <CheckCheck className="h-4 w-4" /> Publicar
                </button>
              )}
              <button className="btn-danger" onClick={remove} disabled={!!busy}>
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
      <ErrorBox>{actionError}</ErrorBox>

      <div className="card p-6 print-dark-text">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-white">Resumen · {periodLabel(meta.months, summary.month, summary.year)}</h1>
          {canEdit && <StatusBadge status={summary.status} />}
        </div>
        <p className="mt-1 text-sm text-muted">
          <span className="text-indigo-300">Mercado {cur}</span> · montos en USD · {summary.reportCount} flujos publicados · generado el {formatDate(summary.generatedAt)}
          {canEdit && summary.createdBy && <> · por {summary.createdBy.name}</>}
        </p>

        {s.metrics && (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {KPI_KEYS.map((k) => {
              const m = metricByKey(meta, k);
              return (
                <div key={k} className="rounded-xl border border-line bg-bg/60 p-4">
                  <p className="text-xs font-medium text-muted">{m.label} · mediana</p>
                  <p className="mt-1 text-xl font-bold tabular-nums text-white">{formatMetric(s.metrics[k]?.median, m, m.format === 'money' ? cur : undefined)}</p>
                  <Change value={s.changes?.[k]} />
                </div>
              );
            })}
          </div>
        )}
        {s.netRevenue && (
          <p className="mt-3 text-sm text-muted">
            Net revenue positivo en <strong className="text-slate-200">{s.netRevenue.positive}</strong> de {s.netRevenue.withData} flujos con dato
            {s.previousReportCount ? <> · {s.previousPeriod}: {s.previousReportCount} flujos</> : null}.
          </p>
        )}
      </div>

      <div className="card p-6 sm:p-8">
        {canEdit && (
          <div className="no-print mb-4 flex justify-end gap-2">
            {editing ? (
              <>
                <button className="btn-ghost" onClick={() => setEditing(false)}>Cancelar</button>
                <button className="btn-primary" onClick={() => patch({ content: text }).then(() => setEditing(false))} disabled={!!busy}>
                  <Save className="h-4 w-4" /> Guardar texto
                </button>
              </>
            ) : (
              <button className="btn-ghost" onClick={() => { setText(summary.content); setEditing(true); }}>
                <Edit3 className="h-4 w-4" /> Editar texto
              </button>
            )}
          </div>
        )}
        {editing ? (
          <textarea className="input h-[32rem] resize-y font-mono text-sm leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
        ) : (
          <Markdown>{summary.content}</Markdown>
        )}
      </div>

      <FlowTable title="Mayor net revenue" rows={s.top} currency={cur} />
      <FlowTable title="Menor net revenue" rows={s.bottom} currency={cur} />

      {canEdit && s.flagged?.length > 0 && (
        <div className="no-print rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold text-amber-200">
            <SearchCheck className="h-4 w-4" /> Pendientes de verificación · solo visible para el equipo (no entran en el ranking)
          </p>
          <ul className="list-disc space-y-1 pl-6 text-amber-100/90">
            {s.flagged.map((f) => (
              <li key={f.id}>
                <Link to={`/admin/reportes/${f.id}`} className="font-semibold hover:underline">{f.flowName}</Link>: {f.issues.join(' ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
