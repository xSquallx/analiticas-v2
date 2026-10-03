import { KeyRound, Loader2, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBox, Select, Spinner } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { useApp } from '../../lib/app-context.jsx';
import { formatDate } from '../../lib/format.js';

const ROLE_OPTIONS = [
  { value: 'EDITOR', label: 'Analista — crea, edita y publica análisis' },
  { value: 'ADMIN', label: 'Administrador — además gestiona usuarios y ajustes' },
];
const roleLabel = (r) => (r === 'ADMIN' ? 'Administrador' : 'Analista');

const errorText = (e) => (e.details?.length ? e.details.map((d) => d.message).join(' · ') : e.message);

/** Formulario para crear o editar un usuario. En edición la contraseña es opcional. */
function UserForm({ initial, onSaved, onCancel }) {
  const editing = !!initial;
  const [form, setForm] = useState({ name: initial?.name ?? '', email: initial?.email ?? '', role: initial?.role ?? 'EDITOR', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (editing) {
        const body = { name: form.name, role: form.role };
        if (form.password) body.password = form.password;
        await api.patch(`/users/${initial.id}`, body);
      } else {
        await api.post('/users', form);
      }
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-brand/40 bg-bg/60 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white">{editing ? `Editar a ${initial.name}` : 'Nuevo usuario'}</h3>
        <button type="button" onClick={onCancel} className="text-muted hover:text-white" title="Cancelar">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label>
          <span className="label">Nombre</span>
          <input className="input" value={form.name} onChange={(e) => set('name')(e.target.value)} required />
        </label>
        <label>
          <span className="label">Correo (usuario para entrar)</span>
          <input className="input" type="email" value={form.email} onChange={(e) => set('email')(e.target.value)} required disabled={editing} />
        </label>
        <label>
          <span className="label">{editing ? 'Nueva contraseña (opcional)' : 'Contraseña'}</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={8}
            placeholder={editing ? 'Déjala vacía para no cambiarla' : 'Mínimo 8 caracteres'}
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            required={!editing}
          />
        </label>
        <Select label="Rol" value={form.role} onChange={set('role')} options={ROLE_OPTIONS} />
      </div>
      <ErrorBox>{error}</ErrorBox>
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn-primary" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </div>
    </form>
  );
}

/** Lista del equipo con alta, edición, cambio de contraseña y baja. Solo administradores. */
export function UsersManager() {
  const { user: me } = useApp();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | user
  const [msg, setMsg] = useState('');

  const load = () => api.get('/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const remove = async (u) => {
    if (!window.confirm(`¿Eliminar el usuario de ${u.name}? Sus análisis se conservan.`)) return;
    setError('');
    try {
      await api.del(`/users/${u.id}`);
      setMsg(`Usuario de ${u.name} eliminado.`);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const saved = (text) => {
    setEditing(null);
    setMsg(text);
    load();
  };

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">Usuarios del equipo</h2>
        {editing === null && (
          <button className="btn-primary" onClick={() => { setEditing('new'); setMsg(''); }}>
            <UserPlus className="h-4 w-4" /> Nuevo usuario
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-muted">
        Los <strong className="text-slate-300">analistas</strong> crean, editan y publican análisis. Los{' '}
        <strong className="text-slate-300">administradores</strong> además gestionan usuarios, el prompt y la importación.
      </p>

      {editing !== null && (
        <div className="mb-4">
          <UserForm
            key={editing === 'new' ? 'new' : editing.id}
            initial={editing === 'new' ? null : editing}
            onCancel={() => setEditing(null)}
            onSaved={() => saved(editing === 'new' ? 'Usuario creado. Compártele su correo y contraseña.' : 'Cambios guardados.')}
          />
        </div>
      )}

      <ErrorBox>{error}</ErrorBox>
      {msg && !error && <p className="mb-3 text-sm text-good">{msg}</p>}

      {!users ? (
        <Spinner />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">
                  {u.name} {u.id === me.id && <span className="text-xs font-normal text-muted">(tú)</span>}
                </p>
                <p className="truncate text-muted">{u.email}</p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${u.role === 'ADMIN' ? 'bg-brand/15 text-indigo-300' : 'bg-slate-500/15 text-slate-300'}`}>
                {roleLabel(u.role)}
              </span>
              <span className="hidden w-40 text-xs text-muted md:block">
                {u.reportCount} análisis · desde {formatDate(u.createdAt)}
              </span>
              <div className="flex gap-1">
                <button className="btn-ghost px-2" title="Editar / cambiar contraseña" onClick={() => { setEditing(u); setMsg(''); }}>
                  <Pencil className="h-4 w-4" />
                </button>
                {u.id !== me.id && (
                  <button className="btn-danger px-2" title="Eliminar usuario" onClick={() => remove(u)}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Cambio de contraseña propio, para cualquier usuario con sesión. */
export function ChangePassword() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setMsg('');
    if (form.newPassword !== form.confirm) return setError('Las contraseñas nuevas no coinciden');
    setBusy(true);
    try {
      await api.post('/auth/password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg('Contraseña actualizada. Las sesiones abiertas en otros equipos se cerraron.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-bold text-white">
        <KeyRound className="h-5 w-5" /> Mi contraseña
      </h2>
      <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <label>
          <span className="label">Contraseña actual</span>
          <input className="input" type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} required />
        </label>
        <label>
          <span className="label">Nueva contraseña</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={set('newPassword')} required />
        </label>
        <label>
          <span className="label">Repite la nueva</span>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={form.confirm} onChange={set('confirm')} required />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-3">
          <div className="min-w-0 flex-1">
            <ErrorBox>{error}</ErrorBox>
            {msg && <p className="text-sm text-good">{msg}</p>}
          </div>
          <button className="btn-ghost" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Cambiar contraseña
          </button>
        </div>
      </form>
    </section>
  );
}
