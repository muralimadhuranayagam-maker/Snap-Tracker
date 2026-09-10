import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Bell, Plus, Command, Shield, Building2, Ticket, CheckSquare, ChevronDown, CheckCircle2, FolderPlus, Menu, Sun, Moon, Camera, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { CreateTaskModal } from '../tasks/CreateTaskModal';
import { RaiseTicketModal } from '../tickets/RaiseTicketModal';
import { CommandPaletteModal } from './CommandPaletteModal';
import { NotificationDrawer } from './NotificationDrawer';
import { AttendanceCheckInModal } from '../attendance/AttendanceCheckInModal';
import { EndDayLogoffModal } from '../attendance/EndDayLogoffModal';
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
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false);
  const [isCreateDropdownOpen, setIsCreateDropdownOpen] = useState(false);
  const [isAttendanceCheckInModalOpen, setIsAttendanceCheckInModalOpen] = useState(false);
  const [isEndDayLogoffModalOpen, setIsEndDayLogoffModalOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // White / Black Theme Toggle
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('snapserve-theme') as 'dark' | 'light') || 'dark';
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

  // Fetch today's attendance status
  const { data: attendanceData } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => api.get('/attendance/today').then(r => r.data),
    refetchInterval: 30_000,
  });

  // Keyboard shortcut Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

        {/* Search trigger opens Command Palette */}
        <div 
          className="search-bar flex-1 max-w-md cursor-pointer hover:border-subtle transition"
          onClick={() => setIsCommandPaletteOpen(true)}
        >
          <Search size={16} className="text-muted" />
          <input 
            type="text" 
            placeholder="Search tasks, tickets, projects, or people..." 
            readOnly
            className="cursor-pointer pointer-events-none"
          />
          <div className="flex items-center gap-1 text-muted opacity-60 px-2 py-0.5 rounded bg-surface border border-subtle text-xs font-mono">
            <Command size={12} /> K
          </div>
        </div>

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

          {/* Daily Attendance Morning Check-In & Evening Shift Logoff Pill */}
          {attendanceData?.isCheckedIn ? (
            <button
              onClick={() => setIsEndDayLogoffModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition shadow-sm"
              title="Currently In Shift - Click to End Day & Transmit Full Daily Activity Report"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>In Shift ({attendanceData?.liveHours || 0}h)</span>
              <LogOut size={12} className="ml-0.5 opacity-80" />
            </button>
          ) : attendanceData?.attendance?.status === 'CHECKED_OUT' ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
              title="Shift Concluded - Full Daily Activity Transmitted to Admins"
            >
              <CheckCircle2 size={13} className="text-blue-500" />
              <span>Shift Done ({attendanceData?.attendance?.workHours || 0}h)</span>
            </div>
          ) : (
            <button
              onClick={() => setIsAttendanceCheckInModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/40 hover:bg-amber-500/20 transition shadow-sm"
              title="Attendance Check-In Required: Camera Verification"
            >
              <Camera size={13} />
              <span>Check In</span>
            </button>
          )}

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
                {isAdmin ? (
                  <>
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
                  </>
                ) : (
                  <>
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
                    <button
                      className="w-full text-left px-3 py-2 text-xs text-secondary hover:text-primary hover:bg-elevated flex items-center gap-2"
                      onClick={() => {
                        setIsCreateDropdownOpen(false);
                        setIsCreateTaskModalOpen(true);
                      }}
                    >
                      <CheckSquare size={14} className="text-accent" />
                      <span>Create Personal Task</span>
                    </button>
                  </>
                )}
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

          <div className="divider" style={{ width: '1px', height: '24px', margin: '0 4px' }} />

          {/* Interactive Bell triggering Notification Drawer */}
          <button 
            className="btn-icon btn-ghost relative hover:bg-elevated transition"
            onClick={() => setIsNotificationDrawerOpen(true)}
            title="Notifications"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-accent text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <div className="avatar avatar-sm bg-accent cursor-pointer ml-1 hover:opacity-80 transition">
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

      {/* Command Palette Modal (Ctrl+K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenCreateTask={() => setIsCreateTaskModalOpen(true)}
        onOpenRaiseTicket={() => setIsRaiseTicketModalOpen(true)}
      />

      {/* Notification Drawer */}
      <NotificationDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
      />

      {/* Morning Camera Attendance Check-In Modal */}
      <AttendanceCheckInModal
        isOpen={isAttendanceCheckInModalOpen}
        onClose={() => setIsAttendanceCheckInModalOpen(false)}
      />

      {/* Evening Logoff & Daily Activity Submission Modal */}
      <EndDayLogoffModal
        isOpen={isEndDayLogoffModalOpen}
        onClose={() => setIsEndDayLogoffModalOpen(false)}
      />
    </>
  );
}
