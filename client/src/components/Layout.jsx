import { BarChart3, ClipboardCheck, FileText, Gauge, LayoutDashboard, LogIn, LogOut, Plus, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { api } from '../lib/api.js';
import { useApp } from '../lib/app-context.jsx';

function Tab({ to, icon: Icon, children, end, badge }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
          isActive ? 'bg-brand text-white' : 'text-muted hover:bg-panel-2 hover:text-white'
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {children}
      {badge > 0 && <span className="rounded-full bg-sky-500 px-1.5 text-[11px] font-bold leading-4 text-white">{badge}</span>}
    </NavLink>
  );
}

export default function Layout() {
  const { user, canEdit, isAdmin, logout } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [pending, setPending] = useState(0);

  // Pendientes de revisión para mí (asignados a mí + sin revisor). Se actualiza al cambiar de página.
  useEffect(() => {
    if (!user) {
      setPending(0);
      return;
    }
    api.get('/reports/review/inbox').then((d) => setPending(d.mine + d.unassigned)).catch(() => {});
  }, [user, location.pathname]);

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-20 border-b border-line bg-panel/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/" className="mr-2 flex items-center gap-2">
            <span className="rounded-lg bg-brand p-1.5">
              <BarChart3 className="h-5 w-5 text-white" />
            </span>
            <span className="text-lg font-bold text-white">
              Analíticas <span className="text-indigo-400">CRM</span>
            </span>
          </Link>

          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            <Tab to="/" icon={LayoutDashboard} end>Dashboard</Tab>
            <Tab to="/reportes" icon={FileText}>Reportes</Tab>
            {canEdit && <Tab to="/admin/nuevo" icon={Plus}>Nuevo análisis</Tab>}
            {canEdit && <Tab to="/admin/revision" icon={ClipboardCheck} badge={pending}>Revisión</Tab>}
            {isAdmin && <Tab to="/admin/consumo" icon={Gauge}>Consumo IA</Tab>}
            {canEdit && <Tab to="/admin/ajustes" icon={Settings}>Ajustes</Tab>}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-muted md:inline">
                  {user.name}
                  <span className="ml-1 text-xs text-slate-500">· {isAdmin ? 'Administrador' : 'Analista'}</span>
                </span>
                <button className="btn-ghost" onClick={() => logout().then(() => navigate('/'))}>
                  <LogOut className="h-4 w-4" /> Salir
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-ghost">
                <LogIn className="h-4 w-4" /> Iniciar sesión
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
