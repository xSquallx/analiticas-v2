import { ClipboardCheck, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Empty, ErrorBox, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/app-context.jsx';
import { formatDate, periodLabel } from '../../lib/format.js';

function Group({ title, items, hint }) {
  const { meta } = useApp();
  if (items.length === 0) return null;
  return (
    <section className="card p-5">
      <h2 className="font-bold text-white">
        {title} <span className="text-sm font-normal text-muted">({items.length})</span>
      </h2>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <ul className="mt-3 divide-y divide-line">
        {items.map((r) => (
          <li key={r.id}>
            <Link to={`/admin/reportes/${r.id}`} className="flex flex-wrap items-center gap-3 py-3 hover:text-indigo-300">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-100">{r.flowName}</p>
                <p className="text-xs text-muted">
                  {periodLabel(meta.months, r.month, r.year)} · {r.currency} · preparado por {r.createdBy?.name ?? '—'} · enviado el {formatDate(r.submittedAt)}
                </p>
              </div>
              {r.commentCount > 0 && (
                <span className="flex items-center gap-1 text-xs text-muted">
                  <MessageSquare className="h-3.5 w-3.5" /> {r.commentCount}
                </span>
              )}
              <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">{r.reviewer?.name ?? 'Sin revisor'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bandeja de reportes en revisión. */
export default function ReviewInbox() {
  const { user } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/review/inbox').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!data) return <Spinner />;

  const mine = data.items.filter((r) => r.reviewerId === user.id);
  const unassigned = data.items.filter((r) => !r.reviewerId);
  const others = data.items.filter((r) => r.reviewerId && r.reviewerId !== user.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
          <ClipboardCheck className="h-6 w-6 text-sky-300" /> Revisión
        </h1>
        <p className="text-sm text-muted">Análisis enviados a revisión antes de publicarse. Ábrelos para aprobarlos, comentarlos o devolverlos a borrador.</p>
      </div>
      {data.items.length === 0 ? (
        <Empty icon={ClipboardCheck} title="No hay análisis pendientes de revisión" />
      ) : (
        <>
          <Group title="Asignados a mí" items={mine} />
          <Group title="Sin revisor asignado" items={unassigned} hint="Cualquiera del equipo puede revisarlos." />
          <Group title="Asignados a otras personas" items={others} />
        </>
      )}
    </div>
  );
}
