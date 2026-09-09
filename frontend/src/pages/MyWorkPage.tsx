import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  CheckSquare, 
  Ticket, 
  Sparkles, 
  Clock, 
  AlertTriangle, 
  Calendar, 
  CheckCircle2, 
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  Hourglass
} from 'lucide-react';
import { api } from '../services/api';
import { format } from 'date-fns';

export function MyWorkPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'tasks' | 'today' | 'upcoming' | 'overdue' | 'blocked' | 'tickets' | 'reviews' | 'approvals' | 'completed'>('tasks');

  const { data, isLoading } = useQuery({
    queryKey: ['mywork'],
    queryFn: () => api.get('/mywork').then(r => r.data),
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  const metrics = data?.metrics || {
    activeTasks: 0,
    tickets: 0,
    reviews: 0,
    approvals: 0,
    blocked: 0,
    overdue: 0,
    dueToday: 0,
    completed: 0,
  };

  const tasks = data?.tasks || [];
  const completedTasks = data?.completedTasks || [];
  const tickets = data?.tickets || [];
  const approvals = data?.approvals || [];
  const reviews = data?.reviews || [];
  const aiDailyPlan = data?.aiDailyPlan || [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  let displayedTasks = tasks;
  if (activeTab === 'today') {
    displayedTasks = tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) >= todayStart && new Date(t.dueDate) <= todayEnd);
  } else if (activeTab === 'upcoming') {
    displayedTasks = tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) > todayEnd);
  } else if (activeTab === 'overdue') {
    displayedTasks = tasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < now);
  } else if (activeTab === 'blocked') {
    displayedTasks = tasks.filter((t: any) => t.status?.name === 'BLOCKED' || (t.blockedByDeps && t.blockedByDeps.length > 0));
  } else if (activeTab === 'completed') {
    displayedTasks = completedTasks;
  }

  const isTaskTab = ['tasks', 'today', 'upcoming', 'overdue', 'blocked', 'completed'].includes(activeTab);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary">My Work</h1>
          <p className="text-xs text-muted mt-0.5">
            Unified workspace for your active deliverables, tickets, approvals, and AI priorities.
          </p>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-accent/40 ${activeTab === 'tasks' ? 'border-accent bg-accent/5' : ''}`}
          onClick={() => setActiveTab('tasks')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <CheckSquare size={13} className="text-accent" /> Active Tasks
          </div>
          <div className="text-xl font-bold text-primary mt-1 font-mono">{metrics.activeTasks}</div>
        </div>

        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-amber/40 ${activeTab === 'tickets' ? 'border-amber bg-amber/5' : ''}`}
          onClick={() => setActiveTab('tickets')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <Ticket size={13} className="text-amber" /> Tickets
          </div>
          <div className="text-xl font-bold text-primary mt-1 font-mono">{metrics.tickets}</div>
        </div>

        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-blue/40 ${activeTab === 'reviews' ? 'border-blue bg-blue/5' : ''}`}
          onClick={() => setActiveTab('reviews')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <CheckCircle2 size={13} className="text-blue" /> Reviews
          </div>
          <div className="text-xl font-bold text-primary mt-1 font-mono">{metrics.reviews}</div>
        </div>

        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-purple/40 ${activeTab === 'approvals' ? 'border-purple bg-purple/5' : ''}`}
          onClick={() => setActiveTab('approvals')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <Hourglass size={13} className="text-purple" /> Approvals
          </div>
          <div className="text-xl font-bold text-primary mt-1 font-mono">{metrics.approvals}</div>
        </div>

        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-green/40 ${activeTab === 'today' ? 'border-green bg-green/5' : ''}`}
          onClick={() => setActiveTab('today')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <Calendar size={13} className="text-green" /> Due Today
          </div>
          <div className="text-xl font-bold text-green mt-1 font-mono">{metrics.dueToday}</div>
        </div>

        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-red/40 ${activeTab === 'overdue' ? 'border-red bg-red/5' : ''}`}
          onClick={() => setActiveTab('overdue')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <Clock size={13} className="text-red" /> Overdue
          </div>
          <div className={`text-xl font-bold mt-1 font-mono ${metrics.overdue > 0 ? 'text-red' : 'text-muted'}`}>
            {metrics.overdue}
          </div>
        </div>

        <div 
          className={`card p-3 bg-surface border-subtle flex flex-col cursor-pointer transition hover:border-amber/40 ${activeTab === 'blocked' ? 'border-amber bg-amber/5' : ''}`}
          onClick={() => setActiveTab('blocked')}
        >
          <div className="text-[11px] text-muted flex items-center gap-1 font-medium">
            <ShieldAlert size={13} className="text-amber" /> Blocked
          </div>
          <div className={`text-xl font-bold mt-1 font-mono ${metrics.blocked > 0 ? 'text-amber' : 'text-muted'}`}>
            {metrics.blocked}
          </div>
        </div>
      </div>

      {/* AI Daily Plan Section */}
      {aiDailyPlan.length > 0 && (
        <div className="card p-4 bg-purple-subtle/20 border border-purple/30 rounded-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple text-white">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary">AI Daily Work Plan</h3>
                <p className="text-[11px] text-muted">
                  Dynamically prioritized according to deadlines, critical milestones, and dependency status.
                </p>
              </div>
            </div>
            <span className="badge bg-purple/20 text-purple border border-purple/30 text-[10px] font-mono">
              REAL-TIME PLAN
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {aiDailyPlan.map((planItem: any) => (
              <div 
                key={planItem.order}
                className="p-3 bg-surface/90 border border-subtle rounded-lg flex flex-col justify-between hover:border-purple/50 transition cursor-pointer"
                onClick={() => {
                  const targetTask = tasks.find((t: any) => t.taskId === planItem.taskId);
                  if (targetTask) navigate(`/tasks/${targetTask.id}`);
                }}
              >
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-mono text-purple font-semibold">#{planItem.order} {planItem.taskId}</span>
                    <span className="badge bg-elevated text-[10px] font-medium">{planItem.priority}</span>
                  </div>
                  <div className="text-xs font-medium text-primary line-clamp-1">{planItem.title}</div>
                  <p className="text-[11px] text-secondary mt-1.5 leading-relaxed">{planItem.reason}</p>
                </div>
                <div className="mt-2.5 pt-2 border-t border-subtle flex items-center justify-between text-[10px] text-muted">
                  <span>Est: {planItem.estimatedHours}h</span>
                  <span className="text-purple flex items-center gap-0.5">Open <ArrowRight size={10} /></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Tabbed Area */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 border-b border-subtle pb-2 overflow-x-auto">
          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'tasks' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('tasks')}
          >
            <CheckSquare size={14} />
            <span>Active Tasks ({tasks.length})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'today' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('today')}
          >
            <Calendar size={14} />
            <span>Today ({metrics.dueToday})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'upcoming' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('upcoming')}
          >
            <Clock size={14} />
            <span>Upcoming</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'overdue' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('overdue')}
          >
            <AlertTriangle size={14} />
            <span>Overdue ({metrics.overdue})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'blocked' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('blocked')}
          >
            <ShieldAlert size={14} />
            <span>Blocked ({metrics.blocked})</span>
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
              activeTab === 'reviews' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('reviews')}
          >
            <CheckCircle2 size={14} />
            <span>Reviews ({reviews.length})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'approvals' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('approvals')}
          >
            <Hourglass size={14} />
            <span>Approvals ({approvals.length})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'completed' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('completed')}
          >
            <CheckCircle2 size={14} />
            <span>Completed ({completedTasks.length})</span>
          </button>
        </div>

        {/* Tasks View (for tasks, today, upcoming, overdue, blocked, completed) */}
        {isTaskTab && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {displayedTasks.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">
                {activeTab === 'today' && "You don't have any deliverables due today."}
                {activeTab === 'upcoming' && "No upcoming deliverables scheduled."}
                {activeTab === 'overdue' && "No overdue tasks. You are right on schedule!"}
                {activeTab === 'blocked' && "No blocked tasks. Work is moving forward smoothly."}
                {activeTab === 'completed' && "No completed tasks yet in this period."}
                {activeTab === 'tasks' && "No active tasks assigned. Great job!"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Task ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Project / Customer</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Due Date</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {displayedTasks.map((task: any) => {
                      const isBlocked = task.status?.name === 'BLOCKED' || (task.blockedByDeps && task.blockedByDeps.length > 0);
                      return (
                        <tr 
                          key={task.id}
                          className="hover:bg-elevated/40 transition cursor-pointer"
                          onClick={() => navigate(`/tasks/${task.id}`)}
                        >
                          <td className="p-3 font-mono font-semibold text-accent">{task.taskId}</td>
                          <td className="p-3 font-medium text-primary">
                            <div className="flex items-center gap-1.5">
                              {isBlocked && <AlertTriangle size={13} className="text-amber shrink-0" />}
                              <span className="truncate max-w-xs">{task.title}</span>
                            </div>
                          </td>
                          <td className="p-3 text-secondary">
                            {task.project?.name || task.customer?.name || '—'}
                          </td>
                          <td className="p-3">
                            <span 
                              className="badge text-[11px]" 
                              style={{ 
                                backgroundColor: task.status?.color ? `${task.status.color}20` : '#334155',
                                color: task.status?.color || '#f1f5f9'
                              }}
                            >
                              {task.status?.name}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="badge bg-elevated text-[11px]">{task.priority?.name}</span>
                          </td>
                          <td className="p-3 text-secondary">
                            {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date'}
                          </td>
                          <td className="p-3 text-right">
                            <button className="btn btn-ghost btn-xs text-accent">
                              <ExternalLink size={12} />
                            </button>
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

        {/* Tab 2: Tickets */}
        {activeTab === 'tickets' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {tickets.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">
                No tickets currently reported by or assigned to you.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Ticket ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {tickets.map((t: any) => (
                      <tr 
                        key={t.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/tickets/${t.id}`)}
                      >
                        <td className="p-3 font-mono font-semibold text-amber">{t.ticketId}</td>
                        <td className="p-3 font-medium text-primary">{t.title}</td>
                        <td className="p-3 text-secondary">{t.customer?.name || '—'}</td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{t.department?.code || 'GEN'}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{t.priority}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-amber-subtle text-amber text-[10px]">{t.status}</span>
                        </td>
                        <td className="p-3 text-right">
                          <button className="btn btn-ghost btn-xs text-accent">
                            <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Reviews */}
        {activeTab === 'reviews' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {reviews.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">
                No tasks awaiting your review at this time.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Task</th>
                      <th className="p-3">Assignee</th>
                      <th className="p-3">Project</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {reviews.map((r: any) => (
                      <tr 
                        key={r.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/tasks/${r.id}`)}
                      >
                        <td className="p-3">
                          <span className="font-mono text-accent font-semibold mr-2">{r.taskId}</span>
                          <span className="text-primary font-medium">{r.title}</span>
                        </td>
                        <td className="p-3 text-secondary">{r.assignee?.name || 'Unassigned'}</td>
                        <td className="p-3 text-secondary">{r.project?.name || '—'}</td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{r.priority?.name}</span>
                        </td>
                        <td className="p-3 text-right">
                          <button className="btn btn-sm btn-primary text-xs">Review Task</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Approvals */}
        {activeTab === 'approvals' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {approvals.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">
                No active approvals linked to your account.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Title</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Requester</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {approvals.map((appr: any) => (
                      <tr 
                        key={appr.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate('/approvals')}
                      >
                        <td className="p-3 font-medium text-primary">{appr.title}</td>
                        <td className="p-3 text-secondary">{appr.type.replace('_', ' ')}</td>
                        <td className="p-3 text-secondary">{appr.requester?.name}</td>
                        <td className="p-3">
                          <span className={`badge text-[10px] ${
                            appr.status === 'APPROVED' ? 'bg-green-subtle text-green' :
                            appr.status === 'REJECTED' ? 'bg-red-subtle text-red' :
                            'bg-amber-subtle text-amber'
                          }`}>
                            {appr.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button className="btn btn-ghost btn-xs text-accent">View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
