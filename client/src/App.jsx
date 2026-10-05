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
import ReviewInbox from './pages/admin/ReviewInbox.jsx';
import Usage from './pages/admin/Usage.jsx';

function AdminsOnly({ children }) {
  const { isAdmin } = useApp();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function MembersOnly({ children }) {
  const { canEdit } = useApp();
  return canEdit ? children : <Navigate to="/login" replace />;
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
        <Route path="admin/nuevo" element={<MembersOnly><ReportEditor /></MembersOnly>} />
        <Route path="admin/reportes/:id" element={<MembersOnly><ReportEditor /></MembersOnly>} />
        <Route path="admin/revision" element={<MembersOnly><ReviewInbox /></MembersOnly>} />
        <Route path="admin/consumo" element={<AdminsOnly><Usage /></AdminsOnly>} />
        <Route path="admin/ajustes" element={<MembersOnly><Settings /></MembersOnly>} />
        <Route path="*" element={<Empty title="Página no encontrada" />} />
      </Route>
    </Routes>
  );
}
