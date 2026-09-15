import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { 
  Activity, 
  LayoutDashboard, 
  Briefcase,
  CheckSquare, 
  Ticket,
  FolderKanban, 
  Users, 
  Building,
  BarChart3, 
  Sliders,
  CheckCircle2,
  Settings,
  LogOut,
  MessageSquare,
  Clock,
} from 'lucide-react';

import { X } from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout, hasPermission } = useAuthStore();

  // Fetch real-time unread messages count for Team Chat
  const { data: chatUnreadData } = useQuery<{ totalUnread: number; channelUnread: Record<string, number> }>({
    queryKey: ['chat-unread-count'],
    queryFn: async () => {
      const res = await api.get('/chat/unread-count');
      return res.data;
    },
    enabled: Boolean(user),
    refetchInterval: 6000,
  });

  // Fetch real-time unread badges for Tasks, Tickets, Projects
  const { data: sidebarBadges = { tasks: 0, tickets: 0, projects: 0 } } = useQuery<{
    tasks: number;
    tickets: number;
    projects: number;
  }>({
    queryKey: ['sidebar-badges'],
    queryFn: async () => {
      const res = await api.get('/notifications/sidebar-badges');
      return res.data;
    },
    enabled: Boolean(user),
    refetchInterval: 6000,
  });

  const totalChatUnread = chatUnreadData?.totalUnread || 0;

  const badgePillStyle: React.CSSProperties = {
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    borderRadius: '10px',
    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.5)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    marginLeft: 'auto'
  };

  if (!user) return null;

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isAdmin = user.role === 'ADMIN' || isSuperAdmin;

  const handleNavClick = () => {
    if (onClose) onClose();
  };

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-logo justify-between">
          <div className="flex items-center gap-2.5">
            <div className="sidebar-logo-mark">
              <Activity size={18} strokeWidth={3} />
            </div>
            <span className="font-bold text-lg tracking-tight">SnapServe</span>
          </div>
          {isOpen && (
            <button 
              className="btn-icon btn-ghost text-muted hover:text-primary lg:hidden"
              onClick={onClose}
              title="Close Navigation"
            >
              <X size={18} />
            </button>
          )}
        </div>

      <nav className="sidebar-nav" onClick={handleNavClick}>
        {/* ─── MAIN ─── */}
        <div className="nav-section">
          <div className="nav-section-label">Main</div>
          <NavLink to="/" end className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <LayoutDashboard className="nav-icon" />
            Dashboard
          </NavLink>
          <NavLink to="/my-work" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Briefcase className="nav-icon" />
            My Work
          </NavLink>
          <NavLink to="/tasks" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <CheckSquare className="nav-icon" />
            <span className="flex-1">Tasks</span>
            {sidebarBadges.tasks > 0 && (
              <span 
                style={badgePillStyle}
                className="animate-pulse"
                title={`${sidebarBadges.tasks} new tasks`}
              >
                {sidebarBadges.tasks > 99 ? '99+' : sidebarBadges.tasks}
              </span>
            )}
          </NavLink>
          <NavLink to="/tickets" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Ticket className="nav-icon" />
            <span className="flex-1">Tickets</span>
            {sidebarBadges.tickets > 0 && (
              <span 
                style={badgePillStyle}
                className="animate-pulse"
                title={`${sidebarBadges.tickets} new tickets`}
              >
                {sidebarBadges.tickets > 99 ? '99+' : sidebarBadges.tickets}
              </span>
            )}
          </NavLink>
          <NavLink to="/projects" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <FolderKanban className="nav-icon" />
            <span className="flex-1">Projects</span>
            {sidebarBadges.projects > 0 && (
              <span 
                style={badgePillStyle}
                className="animate-pulse"
                title={`${sidebarBadges.projects} new projects`}
              >
                {sidebarBadges.projects > 99 ? '99+' : sidebarBadges.projects}
              </span>
            )}
          </NavLink>
          <NavLink to="/chat" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <MessageSquare className="nav-icon" />
            <span className="flex-1">Team Chat</span>
            {totalChatUnread > 0 && (
              <span 
                style={badgePillStyle}
                className="animate-pulse"
                title={`${totalChatUnread} unread messages`}
              >
                {totalChatUnread > 99 ? '99+' : totalChatUnread}
              </span>
            )}
          </NavLink>
        </div>

        {/* ─── ORGANIZATION ─── */}
        <div className="nav-section">
          <div className="nav-section-label">Organization</div>
          <NavLink to="/team" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Users className="nav-icon" />
            Team Directory
          </NavLink>
          <NavLink to="/customers" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Building className="nav-icon" />
            Customers
          </NavLink>
          <NavLink to="/attendance" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Clock className="nav-icon" />
            Attendance & Hours
          </NavLink>
        </div>

        {/* ─── MANAGEMENT ─── */}
        <div className="nav-section">
          <div className="nav-section-label">Management</div>
          {isAdmin && (
            <NavLink to="/workload" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <Sliders className="nav-icon" />
              Workload
            </NavLink>
          )}
          <NavLink to="/approvals" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <CheckCircle2 className="nav-icon" />
            Approvals
          </NavLink>
          {(hasPermission('reports:view') || isAdmin) && (
            <NavLink to="/reports" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <BarChart3 className="nav-icon" />
              Reports
            </NavLink>
          )}
        </div>


        {/* ─── SYSTEM ─── */}
        <div className="nav-section mt-auto">
          {(hasPermission('settings:manage') || isAdmin) && (
            <NavLink to="/settings" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <Settings className="nav-icon" />
              Settings
            </NavLink>
          )}
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" onClick={() => logout()} title="Click to Logout">
          <div className="avatar avatar-md bg-accent">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
              user.name.charAt(0)
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold truncate">{user.name}</div>
            <div className="text-xs text-muted truncate">
              {user.role?.replace('_', ' ')} {user.department ? `• ${user.department.code}` : ''}
            </div>
          </div>
          <LogOut size={14} className="text-muted" />
        </div>
      </div>
    </aside>
    </>
  );
}
