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
  Calendar
} from 'lucide-react';
import { api } from '../services/api';
import { format } from 'date-fns';

export function ProjectDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tasks' | 'tickets' | 'milestones' | 'members'>('tasks');

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
            <span>Overall Task Completion</span>
            <span className="font-mono text-primary font-bold">{progress}%</span>
          </div>
          <div className="w-full h-2 bg-elevated rounded-full overflow-hidden">
            <div 
              className="h-full bg-accent transition-all duration-500 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-subtle pb-2">
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

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">No tasks in this project yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Task ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Assignee</th>
                      <th className="p-3">Due Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {tasks.map((task: any) => (
                      <tr 
                        key={task.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                      >
                        <td className="p-3 font-mono font-bold text-accent">{task.taskId}</td>
                        <td className="p-3 font-medium text-primary">{task.title}</td>
                        <td className="p-3">
                          <span className="badge text-[10px] bg-elevated">{task.status?.name}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{task.priority?.name}</span>
                        </td>
                        <td className="p-3 text-secondary">{task.assignee?.name || 'Unassigned'}</td>
                        <td className="p-3 text-secondary">
                          {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : '—'}
                        </td>
                      </tr>
                    ))}
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
    </div>
  );
}
