import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

/** Carga la lista liviana de reportes (sin texto de análisis). Los filtros se aplican en el cliente. */
export function useReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    return api
      .get('/reports')
      .then((d) => setReports(d.reports))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { reports, loading, error, reload };
}
