import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './services/api';
import { useAuthStore } from './store/authStore';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MyWorkPage } from './pages/MyWorkPage';
import { TasksPage } from './pages/TasksPage';
import { TaskLogsPage } from './pages/TaskLogsPage';
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
import TeamChatPage from './pages/TeamChatPage';
import { AttendancePage } from './pages/AttendancePage';
import { LeavePage } from './pages/LeavePage';
import { WebSocketProvider } from './context/WebSocketContext';
import { AttendanceSessionProvider } from './context/AttendanceSessionContext';
import { SetPermanentPasswordModal } from './components/auth/SetPermanentPasswordModal';

function ProtectedLayout() {
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const location = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;
    const path = location.pathname;
    let entity: 'tasks' | 'tickets' | 'projects' | null = null;
    if (path.startsWith('/tasks')) entity = 'tasks';
    else if (path.startsWith('/tickets')) entity = 'tickets';
    else if (path.startsWith('/projects')) entity = 'projects';

    if (entity) {
      // Optimistically clear the badge count immediately
      queryClient.setQueryData(['sidebar-badges'], (old: any) => {
        if (!old) return { tasks: 0, tickets: 0, projects: 0, [entity!]: 0 };
        return { ...old, [entity!]: 0 };
      });

      api.post('/notifications/viewed', { entity })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['sidebar-badges'] });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
          queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
        })
        .catch(err => {
          console.error(`[NOTIFICATIONS] Failed to mark ${entity} as viewed:`, err);
        });
    }
  }, [location.pathname, isAuthenticated, queryClient]);

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
      {user?.mustChangePassword && <SetPermanentPasswordModal />}
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
      <AttendanceSessionProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedLayout />}>
          {/* Main Routes */}
          <Route path="/" element={<DashboardPage />} />
          <Route path="/my-work" element={<MyWorkPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/logs" element={<TaskLogsPage />} />
          <Route path="/tasks/:id" element={<TaskDetailsPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/tickets/:id" element={<TicketDetailsPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailsPage />} />
          <Route path="/chat" element={<TeamChatPage />} />

          {/* Organization Routes */}
          <Route path="/team" element={<TeamDirectoryPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/customers/:id" element={<CustomerDetailsPage />} />
          <Route path="/attendance" element={<AttendancePage />} />
          <Route path="/leaves" element={<LeavePage />} />

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
    </AttendanceSessionProvider>
  </WebSocketProvider>
  );
}
