import { AlertTriangle, ArrowRight, Eye, Loader2, Save, Send, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import FileSlot from '../../components/FileSlot.jsx';
import { ErrorBox, Markdown, Select, Spinner, StatusBadge } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/app-context.jsx';

const now = new Date();
const EMPTY_META = { flowName: '', month: String(now.getMonth() + 1), year: String(now.getFullYear()), currency: '' };

function Section({ step, title, children, aside }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm">{step}</span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function MetaFields({ value, onChange }) {
  const { meta } = useApp();
  const years = Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - 3 + i));
  const set = (k) => (v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <label className="md:col-span-1">
        <span className="label">Nombre del flujo</span>
        <input className="input" value={value.flowName} placeholder="Ej. Birthday PD JLC" onChange={(e) => set('flowName')(e.target.value)} />
      </label>
      <Select label="Mes" value={value.month} onChange={set('month')} options={meta.months.map((m, i) => ({ value: String(i + 1), label: m }))} />
      <Select label="Año" value={value.year} onChange={set('year')} options={years.map((y) => ({ value: y, label: y }))} />
      <Select label="Moneda" value={value.currency || meta.currencies[0]} onChange={set('currency')} options={meta.currencies.map((c) => ({ value: c, label: c }))} />
    </div>
  );
}

const metaPayload = (m, currencies) => ({
  flowName: m.flowName.trim(),
  month: Number(m.month),
  year: Number(m.year),
  currency: m.currency || currencies[0],
});

/** Paso 1 para un análisis nuevo: crea el borrador y redirige al editor completo. */
function NewReport() {
  const { meta } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_META);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const { report } = await api.post('/reports', metaPayload(form, meta.currencies));
      navigate(`/admin/reportes/${report.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Nuevo análisis</h1>
      <Section step={1} title="Información del flujo">
        <MetaFields value={form} onChange={setForm} />
        <div className="mt-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
        <div className="mt-6 flex justify-end">
          <button className="btn-primary" onClick={create} disabled={busy || !form.flowName.trim()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Continuar a la carga de archivos
          </button>
        </div>
      </Section>
    </div>
  );
}

const toInput = (v) => (v === null || v === undefined ? '' : String(v));

function formFromReport(r, metrics) {
  return {
    meta: { flowName: r.flowName, month: String(r.month), year: String(r.year), currency: r.currency },
    metrics: Object.fromEntries(metrics.map((m) => [m.key, toInput(r[m.key])])),
    analysis: r.analysis ?? '',
    notes: r.notes ?? '',
  };
}

function EditReport({ id }) {
  const { meta } = useApp();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [files, setFiles] = useState([]);
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null); // 'save' | 'analyze' | 'publish'
  const [tab, setTab] = useState('preview');

  const load = (r) => {
    setReport(r);
    if (r.files) setFiles(r.files);
    const f = formFromReport(r, meta.metrics);
    setForm(f);
    setSaved(JSON.stringify(f));
  };

  useEffect(() => {
    api.get(`/reports/${id}`).then((d) => load(d.report)).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dirty = useMemo(() => form && JSON.stringify(form) !== saved, [form, saved]);

  if (error && !report) return <ErrorBox>{error}</ErrorBox>;
  if (!report || !form) return <Spinner />;

  const run = async (kind, fn) => {
    setBusy(kind);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e.details?.length ? `${e.message}: ${e.details.map((d) => `${d.path} ${d.message}`).join('; ')}` : e.message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const buildPayload = () => {
    const metrics = {};
    for (const m of meta.metrics) {
      const raw = form.metrics[m.key].trim().replace(',', '.');
      metrics[m.key] = raw === '' ? null : m.type === 'int' ? Math.round(Number(raw)) : Number(raw);
      if (metrics[m.key] !== null && !Number.isFinite(metrics[m.key])) throw new Error(`"${m.label}" no es un número válido`);
    }
    return { ...metaPayload(form.meta, meta.currencies), metrics, analysis: form.analysis, notes: form.notes || null };
  };

  const save = (extra = {}) =>
    run(extra.status ? 'publish' : 'save', async () => {
      const { report: r } = await api.patch(`/reports/${id}`, { ...buildPayload(), ...extra });
      load({ ...r, files });
    });

  const analyze = () =>
    run('analyze', async () => {
      if (form.analysis.trim() && !window.confirm('El análisis y las métricas actuales se reemplazarán por los nuevos resultados de la IA. ¿Continuar?')) return;
      if (dirty) await api.patch(`/reports/${id}`, buildPayload());
      const { report: r } = await api.post(`/reports/${id}/analyze`);
      load({ ...r, files });
      setTab('preview');
    });

  const upload = async (slot, file) => {
    setError('');
    const body = new FormData();
    body.append('file', file);
    try {
      const { file: saved } = await api.put(`/reports/${id}/files/${slot}`, body);
      setFiles((prev) => [...prev.filter((f) => f.slot !== slot), saved]);
    } catch (e) {
      setError(e.message);
    }
  };

  const removeFile = async (slot) => {
    await api.del(`/reports/${id}/files/${slot}`);
    setFiles((prev) => prev.filter((f) => f.slot !== slot));
  };

  const setMetric = (key, v) => setForm((f) => ({ ...f, metrics: { ...f.metrics, [key]: v } }));
  const warnings = Array.isArray(report.aiWarnings) ? report.aiWarnings : [];
  const published = report.status === 'PUBLISHED';

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">{report.flowName}</h1>
        <StatusBadge status={report.status} />
        {report.source === 'V1' && <span className="text-xs text-muted">Importado de V1</span>}
      </div>

      <Section step={1} title="Información del flujo">
        <MetaFields value={form.meta} onChange={(m) => setForm((f) => ({ ...f, meta: m }))} />
      </Section>

      <Section
        step={2}
        title="Archivos de Optimove"
        aside={<span className="text-sm text-muted">{files.length}/{meta.uploadSlots.length} cargados</span>}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {meta.uploadSlots.map((slot, i) => (
            <FileSlot
              key={slot.key}
              index={i + 1}
              total={meta.uploadSlots.length}
              slot={slot}
              reportId={id}
              file={files.find((f) => f.slot === slot.key)}
              onUpload={upload}
              onRemove={removeFile}
            />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-bg/50 p-4">
          <p className="text-sm text-muted">
            La IA lee las capturas y los CSV, extrae las métricas y redacta el análisis. Tarda entre 20 y 90 segundos.
            {report.aiModel && (
              <span className="block text-xs">
                Último análisis: {report.aiModel} · prompt v{report.promptVersion}
              </span>
            )}
          </p>
          <button className="btn-primary" onClick={analyze} disabled={!!busy || files.length === 0}>
            {busy === 'analyze' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy === 'analyze' ? 'Analizando…' : report.analyzedAt ? 'Volver a analizar' : 'Analizar con IA'}
          </button>
        </div>
      </Section>

      {warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Revisa estos puntos antes de publicar
          </p>
          <ul className="list-disc space-y-1 pl-6">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Section step={3} title="Métricas" aside={<span className="text-xs text-muted">Vacío = dato no disponible</span>}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
          {meta.metrics.map((m) => (
            <label key={m.key} className="block">
              <span className="label truncate" title={m.description}>{m.label}</span>
              <input
                className="input tabular-nums"
                inputMode="decimal"
                placeholder="—"
                value={form.metrics[m.key]}
                onChange={(e) => setMetric(m.key, e.target.value)}
              />
            </label>
          ))}
        </div>
      </Section>

      <Section
        step={4}
        title="Análisis"
        aside={
          <div className="flex rounded-lg border border-line p-0.5 text-sm">
            {['preview', 'edit'].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 ${tab === t ? 'bg-panel-2 text-white' : 'text-muted'}`}>
                {t === 'preview' ? 'Vista previa' : 'Editar texto'}
              </button>
            ))}
          </div>
        }
      >
        {tab === 'edit' ? (
          <textarea
            className="input h-[32rem] resize-y font-mono text-sm leading-relaxed"
            value={form.analysis}
            onChange={(e) => setForm((f) => ({ ...f, analysis: e.target.value }))}
          />
        ) : (
          <Markdown>{form.analysis}</Markdown>
        )}
        <label className="mt-5 block">
          <span className="label">Notas internas (no se muestran en el enlace público)</span>
          <textarea className="input h-20 resize-y" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </label>
      </Section>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            {error ? <ErrorBox>{error}</ErrorBox> : <span className="text-sm text-muted">{dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}</span>}
          </div>
          <Link to={`/reportes/${id}`} className="btn-ghost">
            <Eye className="h-4 w-4" /> Ver
          </Link>
          <button className="btn-ghost" onClick={() => save()} disabled={!!busy || !dirty}>
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </button>
          {published ? (
            <button className="btn-ghost" onClick={() => save({ status: 'DRAFT' })} disabled={!!busy}>
              <Undo2 className="h-4 w-4" /> Pasar a borrador
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => save({ status: 'PUBLISHED' }).then((ok) => ok && navigate(`/reportes/${id}`))}
              disabled={!!busy || !form.analysis.trim()}
              title={!form.analysis.trim() ? 'Genera o escribe el análisis antes de publicar' : ''}
            >
              {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Guardar y publicar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReportEditor() {
  const { id } = useParams();
  return id ? <EditReport key={id} id={id} /> : <NewReport />;
}
