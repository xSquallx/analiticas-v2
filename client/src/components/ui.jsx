import { AlertCircle, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatMetric } from '../lib/format.js';

export function Spinner({ label = 'Cargando…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-muted">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ children }) {
  if (!children) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 border-dashed px-6 py-14 text-center">
      {Icon && <Icon className="h-10 w-10 text-slate-600" />}
      <p className="font-semibold text-slate-300">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
    </div>
  );
}

const STATUS_STYLE = {
  DRAFT: ['Borrador', 'bg-amber-500/10 text-amber-300'],
  IN_REVIEW: ['En revisión', 'bg-sky-500/10 text-sky-300'],
  PUBLISHED: ['Publicado', 'bg-emerald-500/10 text-emerald-300'],
};

export function StatusBadge({ status }) {
  const [label, cls] = STATUS_STYLE[status] ?? STATUS_STYLE.DRAFT;
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{label}</span>;
}

export function SourceBadge({ source }) {
  if (source !== 'V1') return null;
  return (
    <span title="Importado del sistema anterior" className="rounded-full bg-slate-500/15 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
      V1
    </span>
  );
}

export function MetricTile({ metric, value, currency, hint, tone }) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-white';
  return (
    <div className="rounded-xl border border-line bg-bg/60 p-4">
      <p className="text-xs font-medium text-muted">{metric.label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${value == null ? 'text-slate-600' : color}`}>{formatMetric(value, metric, currency)}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Markdown({ children }) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:text-white prose-h2:mt-8 prose-h2:border-b prose-h2:border-line prose-h2:pb-2 prose-h2:text-xl prose-strong:text-white prose-p:text-slate-300 prose-li:text-slate-300 print-dark-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children || '_Sin análisis._'}</ReactMarkdown>
    </div>
  );
}

export function Select({ label, value, onChange, options, allLabel, className = '' }) {
  return (
    <label className={className}>
      {label && <span className="label">{label}</span>}
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        {allLabel && <option value="">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
