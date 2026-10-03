import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AppContext = createContext(null);

/** Sesión del usuario + catálogo del dominio (monedas, meses, métricas, archivos). */
export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/meta'), api.get('/auth/me')])
      .then(([m, me]) => {
        setMeta(m);
        setUser(me.user);
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const { user } = await api.post('/auth/login', { email, password });
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout');
    setUser(null);
  }, []);

  // canEdit: cualquier miembro del equipo con sesión. isAdmin: además gestiona usuarios, prompt e importación.
  const value = useMemo(
    () => ({ user, canEdit: !!user, isAdmin: user?.role === 'ADMIN', meta, ready, error, login, logout }),
    [user, meta, ready, error, login, logout],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

export function metricByKey(meta, key) {
  return meta?.metrics.find((m) => m.key === key);
}
