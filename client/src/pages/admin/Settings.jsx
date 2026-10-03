import { CheckCircle2, DatabaseZap, History, Loader2, Save, Sparkles, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBox, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { formatDate } from '../../lib/format.js';

function PromptEditor() {
  const [data, setData] = useState(null);
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () =>
    api.get('/admin/prompts').then((d) => {
      setData(d);
      setContent(d.versions.find((v) => v.isActive)?.content ?? '');
    });

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  if (!data) return error ? <ErrorBox>{error}</ErrorBox> : <Spinner />;
  const active = data.versions.find((v) => v.isActive);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const { version } = await api.post('/admin/prompts', { content });
      await load();
      setMsg(`Guardado como versión ${version.version} (activa).`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const activate = async (v) => {
    if (!window.confirm(`¿Usar la versión ${v.version} del prompt para los próximos análisis?`)) return;
    await api.post(`/admin/prompts/${v.id}/activate`);
    await load();
    setMsg(`Versión ${v.version} activada.`);
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">Prompt de análisis</h2>
        <span className="text-xs text-muted">Modelo: {data.model} · activa: v{active?.version}</span>
      </div>
      <p className="mb-4 text-sm text-muted">
        Variables disponibles: {data.variables.map((v) => <code key={v} className="mx-0.5 rounded bg-bg px-1 text-indigo-300">{`{{${v}}}`}</code>)}.
        Las reglas de extracción de métricas y el formato de respuesta los añade el sistema automáticamente, así que aquí solo defines el estilo y la estructura del reporte.
      </p>
      <textarea className="input h-[28rem] resize-y font-mono text-sm leading-relaxed" value={content} onChange={(e) => setContent(e.target.value)} />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <ErrorBox>{error}</ErrorBox>
          {msg && !error && <p className="text-sm text-good">{msg}</p>}
        </div>
        <button className="btn-primary" onClick={save} disabled={busy || content === active?.content}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar nueva versión
        </button>
      </div>

      <h3 className="mb-2 mt-6 flex items-center gap-2 text-sm font-semibold text-slate-300">
        <History className="h-4 w-4" /> Historial de versiones
      </h3>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {data.versions.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>
              <span className="font-semibold text-white">v{v.version}</span> <span className="text-muted">· {formatDate(v.createdAt)}</span>
            </span>
            {v.isActive ? (
              <span className="text-xs font-semibold text-good">Activa</span>
            ) : (
              <span className="flex gap-3">
                <button className="text-xs text-muted hover:text-white" onClick={() => setContent(v.content)}>Cargar en editor</button>
                <button className="text-xs text-indigo-300 hover:text-indigo-200" onClick={() => activate(v)}>Activar</button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LegacyImport() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await api.post('/admin/import-v1'));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Importar historial del sistema anterior (V1)</h2>
      <p className="mb-4 mt-1 text-sm text-muted">
        Copia los reportes de la V1 a este sistema (solo lectura: la V1 no se modifica). Puedes repetirlo cuando quieras: solo agrega los nuevos y
        nunca sobrescribe los que ya importaste o corregiste aquí.
      </p>
      <button className="btn-ghost" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseZap className="h-4 w-4" />} Importar desde V1
      </button>
      <div className="mt-3">
        <ErrorBox>{error}</ErrorBox>
        {result && (
          <p className="text-sm text-good">
            {result.total} reportes en V1 · {result.created} nuevos importados · {result.alreadyImported} ya existían
            {result.skipped.length > 0 && <span className="text-amber-300"> · {result.skipped.length} omitidos por datos incompletos</span>}
          </p>
        )}
      </div>
    </section>
  );
}

function GeminiTest() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setResult(await api.post('/admin/gemini-test'));
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">Conexión con Gemini</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Verifica que la API key y el modelo configurados en el servidor funcionan (consume una consulta mínima).</p>
      <button className="btn-ghost" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Probar conexión
      </button>
      {result && (
        <p className={`mt-3 flex items-start gap-2 text-sm ${result.ok ? 'text-good' : 'text-red-300'}`}>
          {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>
            {result.model && <strong>{result.model}: </strong>}
            {result.message}
          </span>
        </p>
      )}
    </section>
  );
}

export default function Settings() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Ajustes</h1>
      <GeminiTest />
      <PromptEditor />
      <LegacyImport />
    </div>
  );
}
