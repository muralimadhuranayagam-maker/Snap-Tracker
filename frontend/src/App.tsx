import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailsPage } from './pages/TaskDetailsPage';
import { TicketsPage } from './pages/TicketsPage';
import { TicketDetailsPage } from './pages/TicketDetailsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailsPage } from './pages/ProjectDetailsPage';
import { CustomersPage } from './pages/CustomersPage';
import { CustomerDetailsPage } from './pages/CustomerDetailsPage';
import { WorkloadPage } from './pages/WorkloadPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { AIInsightsPage } from './pages/AIInsightsPage';
import { ReportsPage } from './pages/ReportsPage';
import { TeamDirectoryPage } from './pages/TeamDirectoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { WebSocketProvider } from './context/WebSocketContext';

function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg"></div>
        <div className="text-muted font-medium">Initializing SnapServe...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-shell">
      <Sidebar isOpen={isMobileNavOpen} onClose={() => setIsMobileNavOpen(false)} />
      <div className="main-content">
        <Header onToggleMobileNav={() => setIsMobileNavOpen(prev => !prev)} />
        <div className="page-container">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <WebSocketProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedLayout />}>
        {/* Main Routes */}
        <Route path="/" element={<DashboardPage />} />
        <Route path="/my-work" element={<MyWorkPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/tasks/:id" element={<TaskDetailsPage />} />
        <Route path="/tickets" element={<TicketsPage />} />
        <Route path="/tickets/:id" element={<TicketDetailsPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<ProjectDetailsPage />} />

        {/* Organization Routes */}
        <Route path="/team" element={<TeamDirectoryPage />} />
        <Route path="/customers" element={<CustomersPage />} />
        <Route path="/customers/:id" element={<CustomerDetailsPage />} />

        {/* Management Routes */}
        <Route path="/workload" element={<WorkloadPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/reports" element={<ReportsPage />} />

        {/* Intelligence Routes */}
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/ai-insights" element={<AIInsightsPage />} />

        {/* System */}
        <Route path="/settings" element={<SettingsPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </WebSocketProvider>
  );
}
