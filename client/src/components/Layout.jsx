import { BarChart3, FileText, LayoutDashboard, LogIn, LogOut, Plus, Settings } from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';
import { useApp } from '../lib/app-context.jsx';

function Tab({ to, icon: Icon, children, end }) {
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
    </NavLink>
  );
}

export default function Layout() {
  const { user, canEdit, isAdmin, logout } = useApp();
  const navigate = useNavigate();

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
