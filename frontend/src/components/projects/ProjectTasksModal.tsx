import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { 
  FolderKanban, 
  X, 
  Search, 
  CheckSquare, 
  ArrowRight, 
  Plus, 
  Building, 
  Calendar,
  ExternalLink,
  Layers
} from 'lucide-react';
import { format } from 'date-fns';

interface TaskItem {
  id: string;
  taskId: string;
  title: string;
  description?: string;
  dueDate?: string;
  status?: {
    id: string;
    name: string;
    color?: string;
  };
  priority?: {
    id: string;
    name: string;
    color?: string;
    level?: number;
  };
  assignee?: {
    id: string;
    name: string;
    avatar?: string | null;
    email?: string;
  };
}

interface ProjectTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    name: string;
    description?: string;
    status: string;
    health?: string;
    dueDate?: string;
    customer?: {
      id: string;
      name: string;
      code?: string;
    };
    department?: {
      name: string;
    };
    tasks?: TaskItem[];
    stats?: {
      total: number;
      done: number;
      blocked: number;
      inProgress?: number;
      progress: number;
    };
  } | null;
  onAddTask?: (projectId: string) => void;
}

const STATUS_MAP: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string; borderColor: string }> = {
  BACKLOG: { label: 'Backlog', dotColor: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)', textColor: '#94a3b8', borderColor: 'rgba(148, 163, 184, 0.25)' },
  TODO: { label: 'To Do', dotColor: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)', textColor: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.3)' },
  IN_PROGRESS: { label: 'In Progress', dotColor: '#6366f1', bgColor: 'rgba(99, 102, 241, 0.15)', textColor: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.35)' },
  IN_REVIEW: { label: 'In Review', dotColor: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.15)', textColor: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.35)' },
  BLOCKED: { label: 'Blocked', dotColor: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', textColor: '#f87171', borderColor: 'rgba(239, 68, 68, 0.35)' },
  DONE: { label: 'Completed', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.15)', textColor: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.35)' },
  CANCELLED: { label: 'Cancelled', dotColor: '#71717a', bgColor: 'rgba(113, 113, 122, 0.1)', textColor: '#a1a1aa', borderColor: 'rgba(113, 113, 122, 0.25)' },
};

const PRIORITY_MAP: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string; borderColor: string }> = {
  LOW: { label: 'Low', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', textColor: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.25)' },
  MEDIUM: { label: 'Medium', dotColor: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)', textColor: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.25)' },
  HIGH: { label: 'High', dotColor: '#f97316', bgColor: 'rgba(249, 115, 22, 0.12)', textColor: '#fb923c', borderColor: 'rgba(249, 115, 22, 0.3)' },
  URGENT: { label: 'Urgent', dotColor: '#ea580c', bgColor: 'rgba(234, 88, 12, 0.14)', textColor: '#fdba74', borderColor: 'rgba(234, 88, 12, 0.35)' },
  CRITICAL: { label: 'Critical', dotColor: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.16)', textColor: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.4)' },
};

export function ProjectTasksModal({ isOpen, onClose, project, onAddTask }: ProjectTasksModalProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const tasks = useMemo(() => project?.tasks || [], [project]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesSearch = 
        !search || 
        t.taskId?.toLowerCase().includes(search.toLowerCase()) ||
        t.title?.toLowerCase().includes(search.toLowerCase()) ||
        t.assignee?.name?.toLowerCase().includes(search.toLowerCase()) ||
        t.assignee?.email?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = 
        statusFilter === 'ALL' || 
        t.status?.name === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [tasks, search, statusFilter]);

  if (!isOpen || !project) return null;

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status?.name === 'DONE').length;
  const inProgressTasks = tasks.filter(t => t.status?.name === 'IN_PROGRESS').length;
  const blockedTasks = tasks.filter(t => t.status?.name === 'BLOCKED').length;
  const inReviewTasks = tasks.filter(t => t.status?.name === 'IN_REVIEW').length;
  const todoTasks = tasks.filter(t => t.status?.name === 'TODO').length;
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return createPortal(
    <div 
      className="modal-overlay animate-in fade-in duration-200"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px 20px',
        overflow: 'hidden'
      }}
      onClick={onClose}
    >
      <div 
        className="card w-full max-w-6xl bg-surface border border-subtle shadow-2xl rounded-2xl flex flex-col overflow-hidden"
        style={{
          height: 'min(90vh, 880px)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.08)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── HEADER: All Actions & Project Identity Consolidated at Top ─── */}
        <div className="border-b border-subtle bg-elevated/40 flex-shrink-0">
          {/* Header Row 1: Title, Health, Status & Right-Pinned Actions */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              width: '100%', 
              padding: '18px 24px 12px 24px',
              gap: '16px' 
            }}
          >
            {/* Left: Project Identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flex: '1 1 auto' }}>
              <div 
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.25) 0%, rgba(79, 70, 229, 0.2) 100%)',
                  border: '1px solid rgba(96, 165, 250, 0.4)',
                  boxShadow: '0 2px 10px rgba(37, 99, 235, 0.2)'
                }}
              >
                <FolderKanban size={20} style={{ color: '#60a5fa' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate max-w-xl">
                  {project.name}
                </h2>
                <span className={`badge text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 ${
                  project.health === 'CRITICAL' ? 'bg-red-subtle text-red border border-red/30' :
                  project.health === 'AT_RISK' ? 'bg-amber-subtle text-amber border border-amber/30' :
                  'bg-green-subtle text-green'
                }`}>
                  {project.health || 'HEALTHY'}
                </span>
                <span className="badge bg-elevated text-[10px] font-semibold text-secondary px-2 py-0.5">
                  {project.status}
                </span>
              </div>
            </div>

            {/* Right: Actions firmly pinned to the right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: 'auto' }}>
              {onAddTask && (
                <button 
                  className="btn btn-primary btn-sm flex items-center gap-1.5 font-bold shadow-sm whitespace-nowrap cursor-pointer hover:opacity-90 transition"
                  style={{
                    padding: '6px 14px',
                    minHeight: '34px',
                    fontSize: '12px',
                    borderRadius: '8px'
                  }}
                  onClick={() => {
                    onClose();
                    onAddTask(project.id);
                  }}
                  title="Create and assign a new task to this project"
                >
                  <Plus size={15} />
                  <span>Add Task to Project</span>
                </button>
              )}

              <button
                className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-subtle hover:text-blue-400 font-medium whitespace-nowrap cursor-pointer transition"
                style={{
                  padding: '6px 14px',
                  minHeight: '34px',
                  fontSize: '12px',
                  borderRadius: '8px'
                }}
                onClick={() => {
                  onClose();
                  navigate(`/projects/${project.id}`);
                }}
                title="Open comprehensive project management overview"
              >
                <span>Full Project Page</span>
                <ExternalLink size={13} />
              </button>

              <button 
                className="btn btn-secondary btn-sm flex items-center gap-1.5 border border-subtle text-secondary hover:text-primary hover:bg-hover font-medium whitespace-nowrap cursor-pointer transition"
                style={{
                  padding: '6px 14px',
                  minHeight: '34px',
                  fontSize: '12px',
                  borderRadius: '8px'
                }}
                onClick={onClose}
                title="Close modal"
              >
                <span>Close</span>
                <X size={14} className="opacity-70" />
              </button>
            </div>
          </div>

          {/* Header Row 2: Description & Metadata Breadcrumbs */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              flexWrap: 'wrap', 
              padding: '0 24px 14px 24px',
              gap: '12px' 
            }}
          >
            {/* Description */}
            <div className="text-xs text-muted truncate max-w-xl">
              {project.description || 'Manage deliverables, timelines, and milestones for this project.'}
            </div>

            {/* Context Chips (Department, Customer, Delivery, Deliverables) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-muted)' }}>
              {project.customer && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--text-secondary)' }}>
                  <Building size={13} className="text-green" />
                  <span>Customer: <strong className="text-primary font-semibold">{project.customer.name}</strong></span>
                </span>
              )}

              {project.department && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Layers size={13} className="text-muted" />
                  <span>Department: <strong className="text-secondary font-medium">{project.department.name}</strong></span>
                </span>
              )}

              {project.dueDate && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <Calendar size={13} className="text-muted" />
                  <span>Delivery: <strong className="text-secondary font-medium">{format(new Date(project.dueDate), 'MMM d, yyyy')}</strong></span>
                </span>
              )}

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontWeight: 600, color: '#93c5fd' }}>
                <CheckSquare size={13} style={{ color: '#60a5fa' }} />
                <span>{totalTasks} Total {totalTasks === 1 ? 'Deliverable' : 'Deliverables'}</span>
              </span>
            </div>
          </div>

          {/* Header Row 3: Progress Bar & Real-Time Status Counters */}
          <div 
            style={{ 
              padding: '12px 24px', 
              borderTop: '1px solid var(--border-subtle)', 
              background: 'rgba(255, 255, 255, 0.015)' 
            }}
            className="space-y-2.5"
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">Status Breakdown:</span>
                
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(99, 102, 241, 0.14)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  <span>In Progress: <strong>{inProgressTasks}</strong></span>
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <span>In Review: <strong>{inReviewTasks}</strong></span>
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(239, 68, 68, 0.14)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  <span>Blocked: <strong>{blockedTasks}</strong></span>
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'rgba(34, 197, 94, 0.14)', color: '#4ade80', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span>Completed: <strong>{doneTasks}</strong></span>
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold text-secondary bg-elevated border border-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted" />
                  <span>To Do: <strong>{todoTasks}</strong></span>
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontFamily: 'var(--font-mono)', marginLeft: 'auto' }}>
                <span className="text-muted">Completion:</span>
                <span className="font-bold text-accent">{progressPct}%</span>
                <span className="text-[11px] text-muted">({doneTasks}/{totalTasks})</span>
              </div>
            </div>

            {/* Gradient Progress Bar */}
            <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
              <div 
                className="h-full transition-all duration-500 rounded-full"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6 0%, #22c55e 100%)'
                }}
              />
            </div>
          </div>

          {/* Header Row 4: Search & Status Filter Controls */}
          <div 
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between', 
              padding: '10px 24px', 
              borderTop: '1px solid var(--border-subtle)', 
              background: 'rgba(24, 24, 27, 0.3)',
              gap: '12px',
              flexWrap: 'wrap'
            }}
          >
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input 
                type="text"
                placeholder="Search by ID, title, or assignee..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '34px', paddingRight: search ? '30px' : '12px' }}
                className="input text-xs py-1.5 w-full bg-surface"
              />
              {search && (
                <button 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                  onClick={() => setSearch('')}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Status Filter Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto' }}>
              {[
                { key: 'ALL', label: `All (${totalTasks})` },
                { key: 'IN_PROGRESS', label: `In Progress (${inProgressTasks})` },
                { key: 'IN_REVIEW', label: `In Review (${inReviewTasks})` },
                { key: 'BLOCKED', label: `Blocked (${blockedTasks})` },
                { key: 'TODO', label: `To Do (${todoTasks})` },
                { key: 'DONE', label: `Done (${doneTasks})` },
              ].map((tab) => {
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    style={isActive ? {
                      background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.28) 0%, rgba(79, 70, 229, 0.24) 100%)',
                      color: '#93c5fd',
                      border: '1px solid rgba(96, 165, 250, 0.5)',
                      boxShadow: '0 2px 8px rgba(37, 99, 235, 0.2)',
                      fontWeight: 700
                    } : {
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      fontWeight: 500
                    }}
                    className="px-3 py-1 rounded-lg text-xs transition whitespace-nowrap cursor-pointer hover:text-primary"
                    onClick={() => setStatusFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── DATA GRID: Pixel-Perfect Structured Table Layout ─── */}
        <div className="flex-1 overflow-y-auto overflow-x-auto bg-surface">
          {filteredTasks.length === 0 ? (
            <div 
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '64px 24px',
                minHeight: '260px',
                width: '100%',
              }}
            >
              <div 
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px',
                  color: 'var(--text-muted)'
                }}
              >
                <CheckSquare size={28} />
              </div>
              <div 
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  marginBottom: '6px'
                }}
              >
                {totalTasks === 0 
                  ? 'No tasks created under this project yet.' 
                  : 'No tasks match the active filters.'}
              </div>
              <p 
                style={{
                  fontSize: '12px',
                  color: 'var(--text-muted)',
                  maxWidth: '380px',
                  lineHeight: '1.5',
                  margin: '0 auto'
                }}
              >
                {totalTasks === 0 
                  ? 'Get started by creating deliverables and assigning team members to track progress.'
                  : 'Try changing your search keywords or switch to the "All" status filter.'}
              </p>
              {totalTasks === 0 && onAddTask && (
                <button 
                  className="btn btn-primary btn-sm text-xs font-bold"
                  style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  onClick={() => {
                    onClose();
                    onAddTask(project.id);
                  }}
                >
                  <Plus size={14} /> Add First Task
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse table-fixed">
              {/* Sticky Table Header with Fixed Width Columns */}
              <thead 
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 10,
                  background: '#0d0d10',
                  boxShadow: '0 1px 0 rgba(255, 255, 255, 0.08)'
                }}
              >
                <tr className="text-muted text-[11px] font-bold uppercase tracking-wider border-b border-subtle">
                  <th className="py-3 px-4 pl-6 w-[120px]">Task ID</th>
                  <th className="py-3 px-4 w-[340px]">Deliverable & Title</th>
                  <th className="py-3 px-4 w-[145px]">Status</th>
                  <th className="py-3 px-4 w-[115px]">Priority</th>
                  <th className="py-3 px-4 w-[220px]">Assignee</th>
                  <th className="py-3 px-4 w-[140px]">Due Date</th>
                  <th className="py-3 px-4 pr-6 w-[90px] text-right">Action</th>
                </tr>
              </thead>

              {/* Table Rows with Rigorous Column Alignment */}
              <tbody className="divide-y divide-subtle">
                {filteredTasks.map((task) => {
                  const statusKey = task.status?.name || 'TODO';
                  const statusCfg = STATUS_MAP[statusKey] || {
                    label: statusKey.replace('_', ' '),
                    dotColor: '#94a3b8',
                    bgColor: 'rgba(148, 163, 184, 0.1)',
                    textColor: '#94a3b8',
                    borderColor: 'rgba(148, 163, 184, 0.25)'
                  };

                  const priorityKey = task.priority?.name || 'MEDIUM';
                  const priorityCfg = PRIORITY_MAP[priorityKey] || {
                    label: priorityKey,
                    dotColor: '#3b82f6',
                    bgColor: 'rgba(59, 130, 246, 0.1)',
                    textColor: '#60a5fa',
                    borderColor: 'rgba(59, 130, 246, 0.25)'
                  };

                  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && statusKey !== 'DONE';

                  return (
                    <tr 
                      key={task.id}
                      className="hover:bg-elevated/50 transition cursor-pointer group"
                      onClick={() => {
                        onClose();
                        navigate(`/tasks/${task.id}`);
                      }}
                    >
                      {/* Column 1: Task ID */}
                      <td className="py-3.5 px-4 pl-6 whitespace-nowrap">
                        <span 
                          className="font-mono font-bold text-xs px-2.5 py-1 rounded text-accent transition"
                          style={{
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#93c5fd',
                            border: '1px solid rgba(96, 165, 250, 0.3)'
                          }}
                        >
                          {task.taskId}
                        </span>
                      </td>

                      {/* Column 2: Deliverable & Title */}
                      <td className="py-3.5 px-4 min-w-[280px]">
                        <div className="font-semibold text-sm text-primary group-hover:text-blue-400 transition-colors line-clamp-1">
                          {task.title}
                        </div>
                        {task.description && (
                          <div className="text-[11px] text-muted line-clamp-1 mt-0.5">
                            {task.description}
                          </div>
                        )}
                      </td>

                      {/* Column 3: Status Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold tracking-wide"
                          style={{
                            backgroundColor: statusCfg.bgColor,
                            color: statusCfg.textColor,
                            border: `1px solid ${statusCfg.borderColor}`,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span 
                            className="w-1.5 h-1.5 rounded-full shrink-0" 
                            style={{ backgroundColor: statusCfg.dotColor, boxShadow: `0 0 6px ${statusCfg.dotColor}` }} 
                          />
                          <span>{statusCfg.label}</span>
                        </span>
                      </td>

                      {/* Column 4: Priority Badge */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span 
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold"
                          style={{
                            backgroundColor: priorityCfg.bgColor,
                            color: priorityCfg.textColor,
                            border: `1px solid ${priorityCfg.borderColor}`,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: priorityCfg.dotColor }} />
                          <span>{priorityCfg.label}</span>
                        </span>
                      </td>

                      {/* Column 5: Assignee with Avatar, Name, Email */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div 
                            className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] text-white shrink-0 shadow-xs"
                            style={{
                              background: task.assignee 
                                ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' 
                                : '#27272a',
                              border: '1px solid rgba(255, 255, 255, 0.12)'
                            }}
                          >
                            {task.assignee?.avatar ? (
                              <img src={task.assignee.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              task.assignee?.name?.charAt(0) || '?'
                            )}
                          </div>
                          <div className="text-xs leading-tight min-w-0">
                            <div className="font-semibold text-primary truncate max-w-[150px]">
                              {task.assignee?.name || 'Unassigned'}
                            </div>
                            <div className="text-[10px] text-muted truncate max-w-[150px]">
                              {task.assignee?.email || 'No email'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Column 6: Due Date & Overdue Indicator */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-secondary">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-muted shrink-0" />
                          <span className={isOverdue ? 'text-red font-semibold' : 'text-secondary'}>
                            {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '—'}
                          </span>
                          {isOverdue && (
                            <span 
                              className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase"
                              style={{
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#f87171',
                                border: '1px solid rgba(239, 68, 68, 0.3)'
                              }}
                            >
                              Overdue
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Column 7: Action Open Link */}
                      <td className="py-3.5 px-4 pr-6 text-right whitespace-nowrap">
                        <span className="text-xs text-secondary group-hover:text-blue-400 font-semibold transition flex items-center justify-end gap-1">
                          <span>Open</span>
                          <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
