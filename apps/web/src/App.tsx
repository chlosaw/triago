import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './features/auth/context';
import { AppLayout } from './components/AppLayout';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { QueuePage } from './pages/QueuePage';
import { SettingsPage } from './pages/SettingsPage';
import { TicketPage } from './pages/TicketPage';
import { TicketsPage } from './pages/TicketsPage';

export function App() {
  const { state } = useAuth();

  if (state.status === 'loading') {
    return <div className="loading">Loading Triago…</div>;
  }

  if (state.status === 'signed-out') {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="/reset-password" element={<AuthPage mode="reset" />} />
        <Route path="/invite" element={<AuthPage mode="invite" />} />
        <Route path="*" element={<Navigate to="/register" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="tickets/mine" element={<TicketsPage mine />} />
        <Route path="tickets/:id" element={<TicketPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      {/* Reset and invitation links opened while signed in still work. */}
      <Route path="/reset-password" element={<AuthPage mode="reset" />} />
      <Route path="/invite" element={<AuthPage mode="invite" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
