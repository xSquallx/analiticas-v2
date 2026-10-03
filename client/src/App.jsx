import { Navigate, Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import { Empty, ErrorBox, Spinner } from './components/ui.jsx';
import { useApp } from './lib/app-context.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import ReportDetail from './pages/ReportDetail.jsx';
import Reports from './pages/Reports.jsx';
import ReportEditor from './pages/admin/ReportEditor.jsx';
import Settings from './pages/admin/Settings.jsx';

function AdminOnly({ children }) {
  const { isAdmin } = useApp();
  return isAdmin ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { ready, meta, error } = useApp();
  if (!ready) return <Spinner />;
  if (!meta) return <div className="p-6"><ErrorBox>No se pudo conectar con el servidor. {error}</ErrorBox></div>;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="reportes" element={<Reports />} />
        <Route path="reportes/:id" element={<ReportDetail />} />
        <Route path="login" element={<Login />} />
        <Route path="admin/nuevo" element={<AdminOnly><ReportEditor /></AdminOnly>} />
        <Route path="admin/reportes/:id" element={<AdminOnly><ReportEditor /></AdminOnly>} />
        <Route path="admin/ajustes" element={<AdminOnly><Settings /></AdminOnly>} />
        <Route path="*" element={<Empty title="Página no encontrada" />} />
      </Route>
    </Routes>
  );
}
