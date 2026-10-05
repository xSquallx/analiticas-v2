import { FileSpreadsheet, Files, Loader2, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/app-context.jsx';
import { ErrorBox } from './ui.jsx';

const ACCEPT = 'image/png,image/jpeg,image/webp,.csv,text/csv';
const MAX_FILES = 12;

/**
 * Subida en bloque: el usuario suelta varios archivos, la IA propone la casilla de cada uno
 * y el usuario confirma (o corrige) antes de que se guarde nada.
 */
export default function BulkUpload({ files: existing, onUpload }) {
  const { meta } = useApp();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [rows, setRows] = useState(null); // [{ file, preview, slot, reason }]
  const [busy, setBusy] = useState(null); // 'classify' | 'upload'
  const [error, setError] = useState('');

  const previews = useRef([]);
  const releasePreviews = () => {
    previews.current.forEach((u) => URL.revokeObjectURL(u));
    previews.current = [];
  };
  const makePreview = (file) => {
    if (!file.type.startsWith('image/')) return null;
    const url = URL.createObjectURL(file);
    previews.current.push(url);
    return url;
  };
  useEffect(() => releasePreviews, []);
  const close = () => {
    releasePreviews();
    setRows(null);
  };

  const classify = async (list) => {
    const picked = [...list].slice(0, MAX_FILES);
    if (picked.length === 0) return;
    setError('');
    setBusy('classify');
    try {
      const body = new FormData();
      picked.forEach((f) => body.append('files', f));
      const { suggestions } = await api.post('/reports/classify', body);
      setRows(
        picked.map((file, i) => ({
          file,
          preview: makePreview(file),
          slot: suggestions[i]?.slot ?? '',
          reason: suggestions[i]?.reason ?? '',
        })),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const setSlot = (i, slot) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, slot } : r)));
  const chosen = rows?.filter((r) => r.slot) ?? [];
  const duplicated = new Set(chosen.map((r) => r.slot).filter((s, i, a) => a.indexOf(s) !== i));

  const confirm = async () => {
    setBusy('upload');
    setError('');
    try {
      for (const r of chosen) {
        // onUpload devuelve false si falló (el editor ya muestra el motivo)
        if ((await onUpload(r.slot, r.file)) === false) throw new Error(`No se pudo subir "${r.file.name}"`);
      }
      close();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  if (rows) {
    return (
      <div className="rounded-2xl border-2 border-brand/50 bg-brand/5 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-semibold text-white">
            <Sparkles className="h-4 w-4 text-indigo-300" /> Revisa dónde va cada archivo
          </h3>
          <button onClick={close} className="text-muted hover:text-white" title="Cancelar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const occupied = r.slot && existing.some((f) => f.slot === r.slot);
            return (
              <li key={i} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bg/60 p-2">
                <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-panel">
                  {r.preview ? <img src={r.preview} alt="" className="h-full w-full object-cover" /> : <FileSpreadsheet className="h-6 w-6 text-muted" />}
                </div>
                <div className="min-w-40 flex-1">
                  <p className="truncate text-sm text-slate-200" title={r.file.name}>{r.file.name}</p>
                  <p className="text-xs text-muted">{r.reason}</p>
                </div>
                <div className="w-full sm:w-72">
                  <select className="input" value={r.slot} onChange={(e) => setSlot(i, e.target.value)}>
                    <option value="">— No subir —</option>
                    {meta.uploadSlots.map((s, k) => (
                      <option key={s.key} value={s.key}>{k + 1}. {s.label}</option>
                    ))}
                  </select>
                  {duplicated.has(r.slot) && <p className="mt-1 text-xs text-bad">Dos archivos en la misma casilla</p>}
                  {!duplicated.has(r.slot) && occupied && <p className="mt-1 text-xs text-amber-300">Reemplazará el archivo actual</p>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3">
          <ErrorBox>{error}</ErrorBox>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn-ghost" onClick={close}>Cancelar</button>
          <button className="btn-primary" onClick={confirm} disabled={!!busy || chosen.length === 0 || duplicated.size > 0}>
            {busy === 'upload' && <Loader2 className="h-4 w-4 animate-spin" />} Subir {chosen.length} {chosen.length === 1 ? 'archivo' : 'archivos'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          classify(e.dataTransfer.files);
        }}
        disabled={!!busy}
        className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-5 text-sm transition-colors ${
          dragOver ? 'border-brand bg-brand/10 text-indigo-200' : 'border-line text-muted hover:border-brand hover:text-indigo-200'
        }`}
      >
        {busy === 'classify' ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin" /> La IA está ordenando los archivos…
          </>
        ) : (
          <>
            <Files className="h-6 w-6" />
            <span className="font-semibold">Subir varios archivos a la vez</span>
            <span className="text-xs">Arrastra aquí hasta {MAX_FILES} capturas o CSV y la IA propone en qué casilla va cada uno</span>
          </>
        )}
      </button>
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => classify(e.target.files)} />
      <div className="mt-2">
        <ErrorBox>{error}</ErrorBox>
      </div>
    </div>
  );
}
