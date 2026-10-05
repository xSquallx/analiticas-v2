import { Loader2, MessageSquare, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/app-context.jsx';
import { ErrorBox } from './ui.jsx';

const when = (iso) => new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Comentarios internos del equipo + eventos de estado. Nunca se muestran en el enlace público.
 * `refreshKey` permite recargar cuando cambia el estado del reporte (nuevos eventos).
 */
export default function Comments({ reportId, refreshKey }) {
  const { user, isAdmin } = useApp();
  const [comments, setComments] = useState(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/reports/${reportId}/comments`).then((d) => setComments(d.comments)).catch((e) => setError(e.message));
  }, [reportId, refreshKey]);

  const send = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { comment } = await api.post(`/reports/${reportId}/comments`, { body });
      setComments((c) => [...(c ?? []), comment]);
      setBody('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    if (!window.confirm('¿Borrar este comentario?')) return;
    await api.del(`/reports/${reportId}/comments/${c.id}`);
    setComments((list) => list.filter((x) => x.id !== c.id));
  };

  const count = comments?.filter((c) => c.kind === 'COMMENT').length ?? 0;

  return (
    <section className="card no-print p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-white">
        <MessageSquare className="h-5 w-5 text-indigo-300" /> Comentarios del equipo
        {count > 0 && <span className="rounded-full bg-panel-2 px-2 text-xs text-muted">{count}</span>}
      </h2>
      <p className="mb-4 text-xs text-muted">Solo los ve el equipo con sesión iniciada; no aparecen en el enlace público.</p>

      {!comments ? (
        <p className="text-sm text-muted">Cargando…</p>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted">Aún no hay comentarios.</p>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) =>
            c.kind === 'EVENT' ? (
              <li key={c.id} className="flex items-center gap-2 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                <span>
                  {c.body} · {when(c.createdAt)}
                </span>
                <span className="h-px flex-1 bg-line" />
              </li>
            ) : (
              <li key={c.id} className="group rounded-xl border border-line bg-bg/50 px-4 py-3">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                  <span>
                    <span className="font-semibold text-slate-200">{c.author}</span> <span className="text-muted">· {when(c.createdAt)}</span>
                  </span>
                  {(c.userId === user?.id || isAdmin) && (
                    <button onClick={() => remove(c)} className="text-slate-600 opacity-0 transition-opacity hover:text-red-300 group-hover:opacity-100" title="Borrar comentario">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-slate-300">{c.body}</p>
              </li>
            ),
          )}
        </ul>
      )}

      <form onSubmit={send} className="mt-4 flex items-end gap-2">
        <textarea
          className="input min-h-[2.75rem] flex-1 resize-y"
          rows={2}
          placeholder="Escribe un comentario… (Ctrl+Enter para enviar)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e);
          }}
        />
        <button className="btn-primary" disabled={busy || !body.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
      <div className="mt-2">
        <ErrorBox>{error}</ErrorBox>
      </div>
    </section>
  );
}
