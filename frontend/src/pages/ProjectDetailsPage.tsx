import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  FolderKanban, 
  Building, 
  Users, 
  CheckSquare, 
  Ticket, 
  Sparkles, 
  Flag, 
  Calendar,
  Plus,
  Search,
  ArrowRight,
  X
} from 'lucide-react';
import { api } from '../services/api';
import { format } from 'date-fns';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';

const STATUS_MAP: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string; borderColor: string }> = {
  BACKLOG: { label: 'Backlog', dotColor: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)', textColor: '#94a3b8', borderColor: 'rgba(148, 163, 184, 0.25)' },
  TODO: { label: 'To Do', dotColor: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)', textColor: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.3)' },
  IN_PROGRESS: { label: 'In Progress', dotColor: '#6366f1', bgColor: 'rgba(99, 102, 241, 0.14)', textColor: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.35)' },
  IN_REVIEW: { label: 'In Review', dotColor: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)', textColor: '#fbbf24', borderColor: 'rgba(245, 158, 11, 0.3)' },
  BLOCKED: { label: 'Blocked', dotColor: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.14)', textColor: '#f87171', borderColor: 'rgba(239, 68, 68, 0.35)' },
  DONE: { label: 'Completed', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)', textColor: '#4ade80', borderColor: 'rgba(34, 197, 94, 0.3)' },
  CANCELLED: { label: 'Cancelled', dotColor: '#71717a', bgColor: 'rgba(113, 113, 122, 0.1)', textColor: '#71717a', borderColor: 'rgba(113, 113, 122, 0.25)' },
};

const PRIORITY_MAP: Record<string, { label: string; dotColor: string; bgColor: string; textColor: string; borderColor: string }> = {
  LOW: { label: 'Low', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.1)', textColor: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.25)' },
  MEDIUM: { label: 'Medium', dotColor: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.1)', textColor: '#60a5fa', borderColor: 'rgba(59, 130, 246, 0.25)' },
  HIGH: { label: 'High', dotColor: '#f97316', bgColor: 'rgba(249, 115, 22, 0.1)', textColor: '#fb923c', borderColor: 'rgba(249, 115, 22, 0.25)' },
  URGENT: { label: 'Urgent', dotColor: '#ea580c', bgColor: 'rgba(234, 88, 12, 0.12)', textColor: '#f97316', borderColor: 'rgba(234, 88, 12, 0.3)' },
  CRITICAL: { label: 'Critical', dotColor: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.14)', textColor: '#f87171', borderColor: 'rgba(239, 68, 68, 0.35)' },
};

export function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tasks' | 'tickets' | 'milestones' | 'members'>('tasks');
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [taskSearch, setTaskSearch] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('ALL');

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get(`/projects/${id}`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="empty-state py-16 text-center">
        <h3 className="text-lg font-bold text-primary">Project not found</h3>
        <button className="btn btn-primary btn-sm mt-3" onClick={() => navigate('/projects')}>
          Back to Projects
        </button>
      </div>
    );
  }

  const tasks = project.tasks || [];
  const tickets = project.tickets || [];
  const milestones = project.milestones || [];
  const members = project.members || [];

  const completedTasks = tasks.filter((t: any) => t.status?.name === 'DONE').length;
  const progress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const blockedTasks = tasks.filter((t: any) => t.status?.name === 'BLOCKED').length;

  const filteredTasks = tasks.filter((t: any) => {
    const matchesSearch = 
      !taskSearch || 
      t.taskId?.toLowerCase().includes(taskSearch.toLowerCase()) ||
      t.title?.toLowerCase().includes(taskSearch.toLowerCase()) ||
      t.assignee?.name?.toLowerCase().includes(taskSearch.toLowerCase());

    const matchesStatus = 
      taskStatusFilter === 'ALL' || 
      t.status?.name === taskStatusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button 
          className="btn btn-ghost btn-sm flex items-center gap-1.5 text-secondary hover:text-primary"
          onClick={() => navigate('/projects')}
        >
          <ArrowLeft size={14} /> Back to Projects
        </button>

        <div className="flex items-center gap-2">
          <span className={`badge text-xs font-semibold ${
            project.health === 'CRITICAL' ? 'bg-red-subtle text-red border border-red/30' :
            project.health === 'AT_RISK' ? 'bg-amber-subtle text-amber border border-amber/30' :
            'bg-green-subtle text-green'
          }`}>
            {project.health || 'HEALTHY'} HEALTH
          </span>
          <span className="badge bg-elevated text-xs">{project.status}</span>
        </div>
      </div>

      {/* Main Overview Card */}
      <div className="card p-6 bg-surface border-subtle space-y-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderKanban size={20} className="text-accent" />
            <h1 className="text-2xl font-bold text-primary">{project.name}</h1>
          </div>
          <p className="text-xs text-secondary mt-1 max-w-3xl leading-relaxed">
            {project.description || 'No detailed description provided for this project.'}
          </p>
        </div>

        {/* Customer & Dept links */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted pt-2 border-t border-subtle">
          {project.customer && (
            <div 
              className="flex items-center gap-1.5 hover:text-primary cursor-pointer transition"
              onClick={() => navigate(`/customers/${project.customer.id}`)}
            >
              <Building size={14} className="text-green" />
              <span>Customer: <strong className="text-primary">{project.customer.name}</strong></span>
            </div>
          )}
          {project.department && (
            <div className="flex items-center gap-1.5">
              <span>Department: <strong className="text-primary">{project.department.name}</strong></span>
            </div>
          )}
          {project.dueDate && (
            <div className="flex items-center gap-1.5">
              <Calendar size={14} className="text-muted" />
              <span>Target Delivery: <strong className="text-primary">{format(new Date(project.dueDate), 'MMM d, yyyy')}</strong></span>
            </div>
          )}
        </div>

        {/* AI Health & Risk Summary Banner */}
        <div className="p-4 rounded-xl bg-purple-subtle/20 border border-purple/30 flex items-start gap-3">
          <Sparkles size={18} className="text-purple mt-0.5 shrink-0" />
          <div className="text-xs space-y-1">
            <div className="font-semibold text-primary">AI Project Intelligence Summary</div>
            <div className="text-secondary leading-relaxed">
              {blockedTasks > 0 ? (
                <span>
                  Project currently contains <strong className="text-red font-medium">{blockedTasks} blocked deliverable(s)</strong> impacting milestone schedule. Cross-department handoff review recommended.
                </span>
              ) : (
                <span>
                  All milestones are tracking according to target velocity. {completedTasks} of {tasks.length} deliverables completed ({progress}% progress).
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
            <span>Overall Task Completion ({completedTasks}/{tasks.length})</span>
            <span className="font-mono text-primary font-bold">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-elevated rounded-full overflow-hidden">
            <div 
              className="h-full transition-all duration-500 rounded-full"
              style={{
                width: `${progress}%`,
                background: progress === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6 0%, #22c55e 100%)'
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-subtle pb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              className={`btn btn-sm text-xs flex items-center gap-1.5 ${
                activeTab === 'tasks' ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={() => setActiveTab('tasks')}
            >
              <CheckSquare size={14} />
              <span>Tasks ({tasks.length})</span>
            </button>

            <button
              className={`btn btn-sm text-xs flex items-center gap-1.5 ${
                activeTab === 'tickets' ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={() => setActiveTab('tickets')}
            >
              <Ticket size={14} />
              <span>Tickets ({tickets.length})</span>
            </button>

            <button
              className={`btn btn-sm text-xs flex items-center gap-1.5 ${
                activeTab === 'milestones' ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={() => setActiveTab('milestones')}
            >
              <Flag size={14} />
              <span>Milestones ({milestones.length})</span>
            </button>

            <button
              className={`btn btn-sm text-xs flex items-center gap-1.5 ${
                activeTab === 'members' ? 'btn-primary' : 'btn-ghost'
              }`}
              onClick={() => setActiveTab('members')}
            >
              <Users size={14} />
              <span>Members ({members.length})</span>
            </button>
          </div>

          {activeTab === 'tasks' && (
            <button 
              className="btn btn-primary btn-sm text-xs flex items-center gap-1.5 font-medium shadow-sm"
              onClick={() => setIsCreateTaskModalOpen(true)}
            >
              <Plus size={14} /> Add Task to Project
            </button>
          )}
        </div>

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle space-y-0">
            {/* Search and Filters Strip */}
            <div className="p-3.5 border-b border-subtle bg-elevated/30 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input 
                  type="text"
                  placeholder="Filter tasks by ID, title, assignee..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  style={{ paddingLeft: '34px', paddingRight: taskSearch ? '30px' : '12px' }}
                  className="input text-xs py-1.5 w-full bg-surface"
                />
                {taskSearch && (
                  <button 
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                    onClick={() => setTaskSearch('')}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
                {[
                  { key: 'ALL', label: `All (${tasks.length})` },
                  { key: 'IN_PROGRESS', label: 'In Progress' },
                  { key: 'BLOCKED', label: 'Blocked' },
                  { key: 'IN_REVIEW', label: 'In Review' },
                  { key: 'TODO', label: 'To Do' },
                  { key: 'DONE', label: 'Done' },
                ].map((f) => {
                  const isActive = taskStatusFilter === f.key;
                  return (
                    <button
                      key={f.key}
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
                      onClick={() => setTaskStatusFilter(f.key)}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            </div>

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
                  {tasks.length === 0 ? 'No tasks mapped to this project yet.' : 'No tasks match current filter.'}
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
                  {tasks.length === 0 ? 'Create a task to track deliverables under this project.' : 'Try adjusting the search query or status filter.'}
                </p>
                {tasks.length === 0 && (
                  <button 
                    className="btn btn-primary btn-sm text-xs font-bold"
                    style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => setIsCreateTaskModalOpen(true)}
                  >
                    <Plus size={14} /> Create First Task
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Task ID</th>
                      <th className="p-3.5">Title & Description</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5">Priority</th>
                      <th className="p-3.5">Assignee</th>
                      <th className="p-3.5">Due Date</th>
                      <th className="p-3.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {filteredTasks.map((task: any) => {
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
                          className="hover:bg-elevated/40 transition cursor-pointer group"
                          onClick={() => navigate(`/tasks/${task.id}`)}
                        >
                          <td className="p-3.5 font-mono font-bold text-accent">
                            <span className="px-2 py-0.5 rounded bg-elevated border border-subtle group-hover:border-accent/30 transition">
                              {task.taskId}
                            </span>
                          </td>
                          <td className="p-3.5 max-w-sm">
                            <div className="font-semibold text-primary group-hover:text-blue-400 transition-colors">
                              {task.title}
                            </div>
                            {task.description && (
                              <div className="text-[11px] text-muted line-clamp-1 mt-0.5">
                                {task.description}
                              </div>
                            )}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span 
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide"
                              style={{
                                backgroundColor: statusCfg.bgColor,
                                color: statusCfg.textColor,
                                border: `1px solid ${statusCfg.borderColor}`
                              }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusCfg.dotColor }} />
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span 
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold"
                              style={{
                                backgroundColor: priorityCfg.bgColor,
                                color: priorityCfg.textColor,
                                border: `1px solid ${priorityCfg.borderColor}`
                              }}
                            >
                              <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: priorityCfg.dotColor }} />
                              {priorityCfg.label}
                            </span>
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white shrink-0"
                                style={{
                                  background: task.assignee 
                                    ? 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)' 
                                    : '#27272a'
                                }}
                              >
                                {task.assignee?.avatar ? (
                                  <img src={task.assignee.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                                ) : (
                                  task.assignee?.name?.charAt(0) || '?'
                                )}
                              </div>
                              <div className="text-xs">
                                <div className="font-medium text-primary">
                                  {task.assignee?.name || 'Unassigned'}
                                </div>
                                {task.assignee?.email && (
                                  <div className="text-[10px] text-muted truncate max-w-[120px]">
                                    {task.assignee.email}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="p-3.5 whitespace-nowrap text-secondary">
                            <div className="flex items-center gap-1.5">
                              <Calendar size={12} className="text-muted shrink-0" />
                              <span className={isOverdue ? 'text-red font-medium' : ''}>
                                {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '—'}
                              </span>
                              {isOverdue && (
                                <span className="text-[10px] text-red font-semibold ml-1">Overdue</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-right whitespace-nowrap">
                            <span className="text-xs text-secondary group-hover:text-primary transition flex items-center justify-end gap-1 font-medium">
                              Open <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tickets Tab */}
        {activeTab === 'tickets' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {tickets.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">No tickets linked to this project.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Ticket ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {tickets.map((t: any) => (
                      <tr 
                        key={t.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/tickets/${t.id}`)}
                      >
                        <td className="p-3 font-mono font-bold text-amber">{t.ticketId}</td>
                        <td className="p-3 font-medium text-primary">{t.title}</td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{t.priority}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-amber-subtle text-amber text-[10px]">{t.status}</span>
                        </td>
                        <td className="p-3 text-secondary">{t.assignee?.name || 'Unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Milestones Tab */}
        {activeTab === 'milestones' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {milestones.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs col-span-2 card bg-surface border-subtle">
                No milestones defined for this project yet.
              </div>
            ) : (
              milestones.map((m: any) => (
                <div key={m.id} className="card p-4 bg-surface border-subtle space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="badge bg-elevated text-xs font-mono">Milestone #{m.order || 1}</span>
                    <span className="badge bg-green-subtle text-green text-[10px]">{m.status}</span>
                  </div>
                  <h4 className="font-semibold text-primary text-sm">{m.name}</h4>
                  <p className="text-xs text-muted">{m.description || 'No description.'}</p>
                  {m.dueDate && (
                    <div className="text-[11px] text-secondary flex items-center gap-1 pt-2 border-t border-subtle">
                      <Calendar size={12} /> Target: {format(new Date(m.dueDate), 'MMM d, yyyy')}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div className="card p-4 bg-surface border-subtle">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {members.map((m: any) => (
                <div key={m.id} className="p-3 rounded-lg bg-elevated border border-subtle flex items-center gap-3">
                  <div className="avatar avatar-md bg-accent">
                    {m.user?.name?.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-primary">{m.user?.name}</div>
                    <div className="text-[11px] text-muted">{m.role} • {m.user?.role?.name || 'Member'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Task Modal pre-mapped to this project */}
      <CreateTaskModal 
        isOpen={isCreateTaskModalOpen} 
        onClose={() => setIsCreateTaskModalOpen(false)} 
        defaultProjectId={project.id}
        defaultDepartmentId={project.departmentId || undefined}
      />
    </div>
  );
}
