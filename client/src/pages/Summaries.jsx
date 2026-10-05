import { FileBarChart, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Empty, ErrorBox, Select, Spinner, StatusBadge } from '../components/ui.jsx';
import { api, toQuery } from '../lib/api.js';
import { useApp } from '../lib/app-context.jsx';
import { formatDate, periodLabel } from '../lib/format.js';

/** Formulario del equipo para generar (o regenerar) el resumen de un mes y una moneda. */
function GenerateForm() {
  const { meta } = useApp();
  const navigate = useNavigate();
  const now = new Date();
  const last = now.getMonth() === 0 ? { m: 12, y: now.getFullYear() - 1 } : { m: now.getMonth(), y: now.getFullYear() };
  const [form, setForm] = useState({ month: String(last.m), year: String(last.y), currency: meta.currencies[0] });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setPreview(null);
    api.get(`/summaries/preview${toQuery(form)}`).then(setPreview).catch(() => {});
  }, [form]);

  const generate = async () => {
    if (preview?.existing && !window.confirm('Ya existe un resumen de ese mes y moneda. Se reemplazará por uno nuevo (quedará en borrador). ¿Continuar?')) return;
    setBusy(true);
    setError('');
    try {
      const { summary } = await api.post('/summaries/generate', { year: Number(form.year), month: Number(form.month), currency: form.currency });
      navigate(`/resumenes/${summary.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const years = Array.from({ length: 3 }, (_, i) => String(now.getFullYear() - i));

  return (
    <section className="card p-5">
      <h2 className="flex items-center gap-2 font-bold text-white">
        <Sparkles className="h-5 w-5 text-indigo-300" /> Generar resumen del mes
      </h2>
      <p className="mb-4 text-sm text-muted">
        Usa los reportes <strong className="text-slate-300">publicados</strong> del mes. Las cifras las calcula el sistema; la IA solo las redacta, sin recomendaciones.
        Queda en borrador para revisarlo antes de publicarlo.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <Select label="Mes" value={form.month} onChange={set('month')} options={meta.months.map((m, i) => ({ value: String(i + 1), label: m }))} />
        <Select label="Año" value={form.year} onChange={set('year')} options={years.map((y) => ({ value: y, label: y }))} />
        <Select label="Moneda" value={form.currency} onChange={set('currency')} options={meta.currencies.map((c) => ({ value: c, label: c }))} />
        <button className="btn-primary" onClick={generate} disabled={busy || !preview?.reportCount}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? 'Generando…' : preview?.existing ? 'Regenerar resumen' : 'Generar resumen'}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        {!preview
          ? 'Calculando…'
          : preview.reportCount === 0
            ? 'No hay reportes publicados en ese mes y moneda.'
            : `${preview.reportCount} reportes publicados${preview.flagged ? ` · ${preview.flagged} pendientes de verificación (no entran en el ranking)` : ''}.`}
      </p>
      <div className="mt-2">
        <ErrorBox>{error}</ErrorBox>
      </div>
    </section>
  );
}

export default function Summaries() {
  const { meta, canEdit } = useApp();
  const [summaries, setSummaries] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/summaries').then((d) => setSummaries(d.summaries)).catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <FileBarChart className="h-6 w-6 text-indigo-300" /> Resúmenes mensuales
        </h1>
        <p className="text-sm text-muted">Una vista de todos los flujos de un mes por moneda.</p>
      </div>

      {canEdit && <GenerateForm />}

      <ErrorBox>{error}</ErrorBox>
      {!summaries ? (
        !error && <Spinner />
      ) : summaries.length === 0 ? (
        <Empty icon={FileBarChart} title="Aún no hay resúmenes publicados" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {summaries.map((s) => (
            <Link key={s.id} to={`/resumenes/${s.id}`} className="card p-4 transition-colors hover:border-brand">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-white">{periodLabel(meta.months, s.month, s.year)}</p>
                {canEdit && <StatusBadge status={s.status} />}
              </div>
              <p className="text-sm text-indigo-300">{s.currency}</p>
              <p className="mt-1 text-xs text-muted">
                {s.reportCount} flujos · generado el {formatDate(s.generatedAt)}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
