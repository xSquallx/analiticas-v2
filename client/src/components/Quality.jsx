import { FileWarning, SearchCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useApp } from '../lib/app-context.jsx';

/**
 * Avisos de valores fuera del rango habitual de todos los reportes ({ id: [avisos] }).
 * Solo para el equipo: los visitantes del enlace público nunca los ven.
 */
export function useQualityFlags() {
  const { canEdit } = useApp();
  const [flags, setFlags] = useState({});
  useEffect(() => {
    if (!canEdit) {
      setFlags({});
      return;
    }
    api.get('/reports/quality').then((d) => setFlags(d.flags)).catch(() => {});
  }, [canEdit]);
  return flags;
}

/** Marca pequeña junto al nombre de un flujo; el detalle aparece al pasar el ratón. */
export function QualityMark({ flags }) {
  if (!flags?.length) return null;
  return (
    <span
      title={flags.map((f) => f.message).join('\n')}
      className="no-print inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300"
    >
      <SearchCheck className="h-3 w-3" /> Verificar
    </span>
  );
}

/**
 * Panel con la revisión de un reporte: valores atípicos y datos clave faltantes.
 * `refreshKey` vuelve a consultar cuando cambian las métricas o los archivos.
 */
export function QualityPanel({ reportId, refreshKey, showMissing = true }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get(`/reports/${reportId}/quality`).then(setData).catch(() => setData(null));
  }, [reportId, refreshKey]);

  if (!data) return null;
  const missingFiles = showMissing ? data.missingFiles : [];
  const missingMetrics = showMissing ? data.missingMetrics : [];
  if (!data.outliers.length && !missingFiles.length && !missingMetrics.length) return null;

  return (
    <div className="no-print rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-sm">
      <p className="mb-2 flex items-center gap-2 font-semibold text-amber-200">
        <SearchCheck className="h-4 w-4" /> Control de calidad · solo visible para el equipo
      </p>
      {data.outliers.length > 0 && (
        <ul className="mb-2 list-disc space-y-1 pl-6 text-amber-100/90">
          {data.outliers.map((f) => (
            <li key={f.metric}>{f.message}</li>
          ))}
        </ul>
      )}
      {(missingFiles.length > 0 || missingMetrics.length > 0) && (
        <div className="flex items-start gap-2 text-amber-100/80">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            {missingFiles.length > 0 && <p>Archivos clave sin subir: {missingFiles.join(', ')}.</p>}
            {missingMetrics.length > 0 && <p>Métricas principales sin dato: {missingMetrics.join(', ')}.</p>}
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-amber-100/60">
        Es solo un aviso para revisar: compara con el historial del mismo flujo o, si no lo tiene, con los demás flujos del mes. No bloquea la publicación.
      </p>
    </div>
  );
}
