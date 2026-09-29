import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Plus, Shield, Building2, Ticket, CheckSquare, ChevronDown, CheckCircle2, FolderPlus, Menu, Sun, Moon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { CreateTaskModal } from '../tasks/CreateTaskModal';
import { RaiseTicketModal } from '../tickets/RaiseTicketModal';
import { HeaderSearchBar } from './HeaderSearchBar';
import { NotificationDrawer } from './NotificationDrawer';
import { api } from '../../services/api';
import { useWebSocket } from '../../context/WebSocketContext';

interface HeaderProps {
  onToggleMobileNav?: () => void;
}

export function Header({ onToggleMobileNav }: HeaderProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { isConnected } = useWebSocket();
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [isRaiseTicketModalOpen, setIsRaiseTicketModalOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);


  // White / Black Theme Toggle
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('snapserve-theme') as 'dark' | 'light') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('snapserve-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN' || isSuperAdmin;
  const deptCode = user?.department?.code?.toUpperCase();

  // Fetch unread notification count
  const { data: notifData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: () => api.get('/notifications/unread-count').then(r => r.data),
    refetchInterval: 15_000,
  });
  const unreadCount = notifData?.unreadCount || 0;

  // Fetch Attendance Check-in State
  const { data: attendanceData } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get('/attendance/today').then(r => r.data),
    refetchInterval: 60000,
  });



  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCreateDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadge = () => {
    if (user?.role === 'SUPER_ADMIN') {
      return (
        <span className="badge bg-amber-subtle text-amber border border-amber/30 flex items-center gap-1 font-semibold text-xs py-1 px-2.5">
          <Shield size={12} /> Super Admin
        </span>
      );
    }
    if (user?.role === 'ADMIN') {
      return (
        <span className="badge bg-blue-subtle text-blue border border-blue/30 flex items-center gap-1 font-semibold text-xs py-1 px-2.5">
          <Shield size={12} /> Admin
        </span>
      );
    }
    // Employees by department
    if (deptCode === 'FDE') {
      return (
        <span className="badge bg-purple-subtle text-purple border border-purple/30 flex items-center gap-1 font-semibold text-xs py-1 px-2.5">
          <Building2 size={12} /> FDE • Engineering
        </span>
      );
    }
    if (deptCode === 'SAL' || user?.department?.name?.toLowerCase().includes('sales')) {
      return (
        <span className="badge bg-green-subtle text-green border border-green/30 flex items-center gap-1 font-semibold text-xs py-1 px-2.5">
          <Building2 size={12} /> Sales • Accounts
        </span>
      );
    }
    if (deptCode === 'MKT' || user?.department?.name?.toLowerCase().includes('marketing')) {
      return (
        <span className="badge bg-amber-subtle text-amber border border-amber/30 flex items-center gap-1 font-semibold text-xs py-1 px-2.5">
          <Building2 size={12} /> Marketing • Growth
        </span>
      );
    }
    return (
      <span className="badge bg-surface border border-subtle flex items-center gap-1 font-medium text-xs py-1 px-2.5">
        <Building2 size={12} /> {user?.department?.name || 'General'}
      </span>
    );
  };

  return (
    <>
      <header className="topbar">
        {/* Mobile Hamburger Toggle */}
        <button
          className="btn-icon btn-ghost text-muted hover:text-primary lg:hidden mr-1"
          onClick={onToggleMobileNav}
          title="Toggle Navigation"
        >
          <Menu size={20} />
        </button>

        {/* Dynamic Inline Search Bar & Attached Dropdown */}
        <HeaderSearchBar 
          onOpenCreateTask={() => setIsCreateTaskModalOpen(true)}
          onOpenRaiseTicket={() => setIsRaiseTicketModalOpen(true)}
        />

        <div className="flex items-center gap-3 ml-auto">
          {/* Real-time WebSocket Live Status */}
          <div 
            className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border bg-surface border-subtle"
            title={isConnected ? "Real-time WebSocket engine connected" : "Connecting to real-time WebSocket engine..."}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-muted text-[11px] font-medium">{isConnected ? 'Live' : 'Syncing'}</span>
          </div>

          {/* Active Persona Badge */}
          {getRoleBadge()}

          {/* Daily Attendance Shift Status Indicator */}
          {(() => {
            if (!attendanceData?.hasRecord) return null;
            const currentState = attendanceData.currentState;
            const workedHours = ((attendanceData.computed?.verifiedWorkingSeconds || 0) / 3600).toFixed(1);

            if (['WORKING', 'ON_BREAK', 'ON_LUNCH', 'IN_MEETING', 'FACE_NOT_DETECTED'].includes(currentState)) {
              const label = currentState === 'ON_BREAK' ? 'On Break' : currentState === 'ON_LUNCH' ? 'On Lunch' : currentState === 'IN_MEETING' ? 'In Meeting' : `In Shift (${workedHours}h)`;
              return (
                <button
                  onClick={() => navigate('/attendance')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition shadow-sm"
                  title="Active Shift - Click to open Attendance and live controls"
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>{label}</span>
                </button>
              );
            }

            if (currentState === 'WORKDAY_COMPLETED') {
              return (
                <button
                  onClick={() => navigate('/attendance')}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30 hover:bg-blue-500/20 transition"
                  title="Shift Concluded - Click to view daily attendance summary"
                >
                  <CheckCircle2 size={13} className="text-blue-500" />
                  <span>Shift Done ({workedHours}h)</span>
                </button>
              );
            }

            return null;
          })()}

          {/* Role-Aware Multi-Action + Create Button */}
          <div className="relative" ref={dropdownRef}>
            <button 
              className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
              onClick={() => setIsCreateDropdownOpen(prev => !prev)}
            >
              <Plus size={14} />
              <span>Create</span>
              <ChevronDown size={12} className="opacity-70" />
            </button>

            {isCreateDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-surface border border-subtle rounded-lg shadow-xl py-1 z-30 animate-in fade-in zoom-in-95">
                <button
                  className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-elevated flex items-center gap-2"
                  onClick={() => {
                    setIsCreateDropdownOpen(false);
                    setIsCreateTaskModalOpen(true);
                  }}
                >
                  <CheckSquare size={14} className="text-accent" />
                  <span>New Task</span>
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-elevated flex items-center gap-2"
                  onClick={() => {
                    setIsCreateDropdownOpen(false);
                    setIsRaiseTicketModalOpen(true);
                  }}
                >
                  <Ticket size={14} className="text-amber" />
                  <span>Raise Ticket</span>
                </button>
                {isAdmin && (
                  <button
                    className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-elevated flex items-center gap-2"
                    onClick={() => {
                      setIsCreateDropdownOpen(false);
                      navigate('/projects');
                    }}
                  >
                    <FolderPlus size={14} className="text-blue" />
                    <span>New Project</span>
                  </button>
                )}
                <button
                  className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-elevated flex items-center gap-2"
                  onClick={() => {
                    setIsCreateDropdownOpen(false);
                    navigate('/approvals');
                  }}
                >
                  <CheckCircle2 size={14} className="text-green" />
                  <span>Request Approval</span>
                </button>
              </div>
            )}
          </div>

          {/* Theme Switcher: White / Black Palette */}
          <button 
            className="btn-icon btn-ghost hover:bg-elevated transition text-secondary hover:text-primary"
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to White (Light) Palette' : 'Switch to Black (Dark) Palette'}
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>


          <div className="w-[1px] h-5 bg-border-subtle shrink-0" style={{ width: '1px', height: '20px', background: 'var(--border-subtle)' }} />

          {/* Interactive Bell triggering Notification Drawer */}
          <button 
            className="btn-icon btn-ghost relative hover:bg-elevated transition"
            onClick={() => setIsNotificationDrawerOpen(true)}
            title="Notifications"
          >
            <Bell size={17} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-[10px] font-bold min-w-4 h-4 px-1 rounded-full flex items-center justify-center shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <div 
            className="avatar avatar-md bg-accent cursor-pointer hover:opacity-90 transition shrink-0"
            title={`${user?.name} (${user?.role?.replace('_', ' ')})`}
            onClick={() => navigate('/settings')}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0)
            )}
          </div>
        </div>
      </header>

      {/* Create Task Modal */}
      <CreateTaskModal 
        isOpen={isCreateTaskModalOpen} 
        onClose={() => setIsCreateTaskModalOpen(false)} 
      />

      {/* Raise Ticket Modal */}
      <RaiseTicketModal
        isOpen={isRaiseTicketModalOpen}
        onClose={() => setIsRaiseTicketModalOpen(false)}
      />

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
      />
    </>
  );
}
