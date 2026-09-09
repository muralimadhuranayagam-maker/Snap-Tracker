import { NavLink } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
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
  Bot,
  Sparkles,
  Settings,
  LogOut,
} from 'lucide-react';

import { X } from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { user, logout, hasPermission } = useAuthStore();

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
            Tasks
          </NavLink>
          <NavLink to="/tickets" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Ticket className="nav-icon" />
            Tickets
          </NavLink>
          <NavLink to="/projects" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <FolderKanban className="nav-icon" />
            Projects
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

        {/* ─── INTELLIGENCE ─── */}
        <div className="nav-section">
          <div className="nav-section-label flex items-center gap-1">
            <Sparkles size={11} className="text-purple" /> Intelligence
          </div>
          <NavLink to="/ai-assistant" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Bot className="nav-icon text-accent" />
            AI Assistant
          </NavLink>
          <NavLink to="/ai-insights" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Sparkles className="nav-icon text-purple" />
            AI Insights
          </NavLink>
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
