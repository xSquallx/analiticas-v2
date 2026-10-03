import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useApp } from '../lib/app-context.jsx';
import { Select } from './ui.jsx';

/** Filtros guardados en la URL, así un enlace compartido conserva la vista. */
export function useFilters(defaults = {}) {
  const [params, setParams] = useSearchParams();
  const filters = {
    year: params.get('year') ?? defaults.year ?? '',
    month: params.get('month') ?? defaults.month ?? '',
    currency: params.get('currency') ?? defaults.currency ?? '',
    q: params.get('q') ?? '',
  };
  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };
  return [filters, setFilter];
}

export function applyFilters(reports, f) {
  const q = f.q.trim().toLowerCase();
  return reports.filter(
    (r) =>
      (!f.year || r.year === Number(f.year)) &&
      (!f.month || r.month === Number(f.month)) &&
      (!f.currency || r.currency === f.currency) &&
      (!q || r.flowName.toLowerCase().includes(q)),
  );
}

export function FilterBar({ reports, filters, setFilter, requireCurrency = false, search = false }) {
  const { meta } = useApp();
  const years = useMemo(() => [...new Set(reports.map((r) => r.year))].sort((a, b) => b - a), [reports]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {search && (
        <label className="min-w-48 flex-1">
          <span className="label">Buscar flujo</span>
          <input className="input" placeholder="Nombre del flujo…" value={filters.q} onChange={(e) => setFilter('q', e.target.value)} />
        </label>
      )}
      <Select
        label="Moneda"
        value={filters.currency}
        onChange={(v) => setFilter('currency', v)}
        allLabel={requireCurrency ? undefined : 'Todas'}
        options={meta.currencies.map((c) => ({ value: c, label: c }))}
      />
      <Select label="Año" value={filters.year} onChange={(v) => setFilter('year', v)} allLabel="Todos" options={years.map((y) => ({ value: String(y), label: String(y) }))} />
      <Select label="Mes" value={filters.month} onChange={(v) => setFilter('month', v)} allLabel="Todos" options={meta.months.map((m, i) => ({ value: String(i + 1), label: m }))} />
    </div>
  );
}
