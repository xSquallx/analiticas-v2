import { CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

const ACCEPT = 'image/png,image/jpeg,image/webp,.csv,text/csv';

/** Casilla de carga para uno de los archivos del flujo (captura o CSV). */
export default function FileSlot({ index, total, slot, file, reportId, onUpload, onRemove }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handle = async (f) => {
    if (!f) return;
    setBusy(true);
    try {
      await onUpload(slot.key, f);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await onRemove(slot.key);
    } finally {
      setBusy(false);
    }
  };

  const isImage = file?.mimeType?.startsWith('image/');
  const src = file && isImage ? `/api/reports/${reportId}/files/${slot.key}?v=${encodeURIComponent(file.createdAt)}` : null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handle(e.dataTransfer.files?.[0]);
      }}
      className={`flex flex-col gap-3 rounded-2xl border-2 p-3 transition-colors ${
        dragOver ? 'border-brand bg-brand/10' : file ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-line bg-panel'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[11px] font-bold text-muted">{index}/{total}</span>
          <p className="text-sm font-semibold leading-snug text-slate-200">{slot.label}</p>
        </div>
        {file && <CheckCircle2 className="h-5 w-5 shrink-0 text-good" />}
      </div>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="relative flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-dashed border-line bg-bg text-xs text-muted hover:border-brand hover:text-indigo-300"
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : src ? (
          <img src={src} alt={slot.label} className="h-full w-full object-cover" />
        ) : file ? (
          <span className="flex flex-col items-center gap-1 px-2 text-center">
            <FileSpreadsheet className="h-7 w-7" /> <span className="line-clamp-2 break-all">{file.filename}</span>
          </span>
        ) : (
          <span className="flex flex-col items-center gap-1">
            <Upload className="h-6 w-6" /> Subir o arrastrar
            <span className="text-[10px] text-slate-600">PNG, JPG o CSV</span>
          </span>
        )}
      </button>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => handle(e.target.files?.[0])} />

      {file && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-muted" title={file.filename}>{file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`}</span>
          <button type="button" onClick={remove} disabled={busy} className="flex items-center gap-1 text-slate-500 hover:text-red-300">
            <Trash2 className="h-3.5 w-3.5" /> Quitar
          </button>
        </div>
      )}
    </div>
  );
}
