import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import { 
  CheckSquare, 
  FolderKanban, 
  TrendingUp, 
  AlertTriangle,
  Clock, 
  Sparkles, 
  ArrowRight, 
  Users,
  Shield,
  Building2,
  Bug,
  Briefcase,
  Megaphone,
  UserCheck,
  PlusCircle,
  Activity,
  Calendar,
  ExternalLink,
  Search,
  Gauge,
  Timer,
  CornerDownRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';
import { TeamAttendanceOverviewWidget } from '../components/attendance/TeamAttendanceOverviewWidget';

export function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // For Admin Quick Allocation
  const [allocatingTaskId, setAllocatingTaskId] = useState<string | null>(null);
  const [selectedAssignee, setSelectedAssignee] = useState<string>('');

  // Super Admin & Admin Active Tasks Velocity & Time-to-Finish tracking
  const [activeTaskSearch, setActiveTaskSearch] = useState('');
  const [activeDeptFilter, setActiveDeptFilter] = useState('ALL');
  const [activePacingFilter, setActivePacingFilter] = useState('ALL');

  const isAdminOrSuper = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'ADMIN';
  const isEmployee = user?.role === 'EMPLOYEE';

  const deptCode = user?.department?.code?.toUpperCase() || '';
  const isFDE = isEmployee && deptCode === 'FDE';
  const isSales = isEmployee && (deptCode === 'SAL' || user?.department?.name?.toLowerCase().includes('sales'));
  const isMarketing = isEmployee && (deptCode === 'MKT' || user?.department?.name?.toLowerCase().includes('marketing'));

  // Main Dashboard Data
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const res = await api.get('/dashboard');
      return res.data;
    }
  });

  // Admin & Super Admin: Fetch unassigned tasks for the Triage Queue
  const { data: unassignedTasks, isLoading: loadingUnassigned } = useQuery({
    queryKey: ['unassigned-tasks'],
    queryFn: async () => {
      const res = await api.get('/tasks', { params: { limit: 100 } });
      const allTasks = res.data?.tasks || res.data?.data || [];
      return allTasks.filter((t: any) => !t.assigneeId && t.status?.name !== 'DONE' && t.status?.name !== 'CANCELLED');
    },
    enabled: isAdminOrSuper,
  });

  // Fetch users for admin allocation dropdown
  const { data: assignees } = useQuery({
    queryKey: ['users-assignees'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    enabled: isAdminOrSuper,
  });

  // Super Admin & Admin: Real-time Active Tasks & Velocity Tracking
  const { data: activeTasksData, isLoading: loadingActiveTasks } = useQuery({
    queryKey: ['active-tasks-velocity'],
    queryFn: async () => {
      const res = await api.get('/tasks', { params: { limit: 100 } });
      const tasks = res.data?.tasks || res.data?.data || [];
      return tasks.filter((t: any) => t.status?.name !== 'DONE' && t.status?.name !== 'CANCELLED');
    },
    enabled: isAdminOrSuper,
    refetchInterval: 15000,
  });

  // Mutation to allocate task to an employee
  const allocateMutation = useMutation({
    mutationFn: ({ taskId, assigneeId }: { taskId: string; assigneeId: string }) => 
      api.patch(`/tasks/${taskId}`, { assigneeId, statusId: undefined }),
    onSuccess: () => {
      toast.success('Task allocated successfully!');
      queryClient.invalidateQueries({ queryKey: ['unassigned-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setAllocatingTaskId(null);
      setSelectedAssignee('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to allocate task');
    }
  });

  const handleAllocate = (taskId: string) => {
    if (!selectedAssignee) {
      toast.error('Please select an employee to allocate this task');
      return;
    }
    allocateMutation.mutate({ taskId, assigneeId: selectedAssignee });
  };

  // Compute Active Tasks & Velocity Metrics
  const activeTasksList = (activeTasksData || []).map((t: any) => {
    const est = t.estimatedHours && Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 4;
    const act = Number(t.actualHours || 0);
    const remaining = Math.max(0, Number((est - act).toFixed(1)));
    const pct = Math.min(100, Math.round((act / est) * 100));

    const isPastDue = t.dueDate && new Date(t.dueDate).getTime() < Date.now();
    const isDueSoon = t.dueDate && !isPastDue && (new Date(t.dueDate).getTime() - Date.now()) < 24 * 60 * 60 * 1000;
    const isOverHours = act > est;
    const isBlocked = t.status?.name === 'BLOCKED';

    let pacing: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'BLOCKED' = 'ON_TRACK';
    if (isBlocked) {
      pacing = 'BLOCKED';
    } else if (isPastDue) {
      pacing = 'OVERDUE';
    } else if (isOverHours || isDueSoon || pct >= 85) {
      pacing = 'AT_RISK';
    } else {
      pacing = 'ON_TRACK';
    }

    return {
      ...t,
      computedEst: est,
      computedAct: act,
      computedRemaining: remaining,
      computedPct: pct,
      pacing,
      isPastDue,
      isDueSoon,
    };
  });

  const totalEstimatedHours = activeTasksList.reduce((acc: number, t: any) => acc + t.computedEst, 0);
  const totalActualHours = activeTasksList.reduce((acc: number, t: any) => acc + t.computedAct, 0);
  const totalRemainingHours = activeTasksList.reduce((acc: number, t: any) => acc + t.computedRemaining, 0);
  const atRiskCount = activeTasksList.filter((t: any) => t.pacing === 'AT_RISK').length;
  const overdueCount = activeTasksList.filter((t: any) => t.pacing === 'OVERDUE').length;
  const onTrackCount = activeTasksList.filter((t: any) => t.pacing === 'ON_TRACK').length;

  const filteredActiveTasks = activeTasksList.filter((t: any) => {
    if (activeDeptFilter !== 'ALL' && t.department?.code !== activeDeptFilter) return false;
    if (activePacingFilter !== 'ALL' && t.pacing !== activePacingFilter) return false;
    if (activeTaskSearch.trim()) {
      const q = activeTaskSearch.toLowerCase();
      const matchKey = t.taskId?.toLowerCase().includes(q);
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchAssignee = t.assignee?.name?.toLowerCase().includes(q);
      const matchTicket = t.ticket?.ticketId?.toLowerCase().includes(q) || t.ticket?.title?.toLowerCase().includes(q);
      if (!matchKey && !matchTitle && !matchAssignee && !matchTicket) return false;
    }
    return true;
  });

  const uniqueDepts: string[] = Array.from(new Set(activeTasksList.map((t: any) => t.department?.code).filter(Boolean))) as string[];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="skeleton h-10 w-48 mb-4"></div>
        <div className="stats-grid">
          <div className="skeleton h-32 rounded-lg"></div>
          <div className="skeleton h-32 rounded-lg"></div>
          <div className="skeleton h-32 rounded-lg"></div>
          <div className="skeleton h-32 rounded-lg"></div>
        </div>
        <div className="dashboard-grid mt-6">
          <div className="skeleton h-96 rounded-lg"></div>
          <div className="skeleton h-96 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="empty-state">
        <AlertTriangle size={32} className="mx-auto text-red mb-4" />
        <p>Failed to load dashboard data.</p>
        <p className="text-sm text-muted mt-2">{(error as any)?.message || 'Unknown error'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      
      {/* ── Role & Department Persona Banner ────────────────────────────── */}
      <div className="card p-6 bg-gradient-to-r from-surface to-surface-hover border-subtle relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {isSuperAdmin && (
                <span className="badge bg-amber-subtle text-amber border border-amber/30 flex items-center gap-1 font-semibold text-xs py-0.5 px-2">
                  <Shield size={12} /> Super Admin Cockpit
                </span>
              )}
              {isAdmin && (
                <span className="badge bg-blue-subtle text-blue border border-blue/30 flex items-center gap-1 font-semibold text-xs py-0.5 px-2">
                  <Shield size={12} /> Admin Operations & Allocation
                </span>
              )}
              {isFDE && (
                <span className="badge bg-purple-subtle text-purple border border-purple/30 flex items-center gap-1 font-semibold text-xs py-0.5 px-2">
                  <Bug size={12} /> FDE • Engineering Workspace
                </span>
              )}
              {isSales && (
                <span className="badge bg-green-subtle text-green border border-green/30 flex items-center gap-1 font-semibold text-xs py-0.5 px-2">
                  <Briefcase size={12} /> Sales • Client Advocacy
                </span>
              )}
              {isMarketing && (
                <span className="badge bg-amber-subtle text-amber border border-amber/30 flex items-center gap-1 font-semibold text-xs py-0.5 px-2">
                  <Megaphone size={12} /> Marketing • Campaign Studio
                </span>
              )}
              <span className="text-xs text-muted">•</span>
              <span className="text-xs text-muted">{user?.email}</span>
            </div>

            <h1 className="text-2xl font-bold text-primary">
              Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'}, {user?.name.split(' ')[0]}
            </h1>
            <p className="text-sm text-muted mt-1">
              {isSuperAdmin && "System oversight across all departments, governance, and organizational metrics."}
              {isAdmin && "Triage unassigned issues raised by FDE, Sales & Marketing, allocate owners, and track SLA delivery."}
              {isFDE && "Monitor deployment health, report engineering incidents, and resolve technical blockers."}
              {isSales && "Raise customer issues, monitor deal blockers, and track turnaround time for key accounts."}
              {isMarketing && "Manage campaign deliverables, coordinate brand assets, and track launch deadlines."}
              {!isFDE && !isSales && !isMarketing && !isAdminOrSuper && "Here's what's happening in your workspace today."}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button 
              className="btn btn-primary shadow-sm flex items-center gap-2"
              onClick={() => setIsCreateModalOpen(true)}
            >
              <PlusCircle size={16} />
              {isEmployee ? 'Raise an Issue' : 'Create & Allocate'}
            </button>
            {isAdminOrSuper && (
              <a href="/reports" className="btn btn-secondary flex items-center gap-1.5">
                <Activity size={14} /> Analytics
              </a>
            )}
          </div>
        </div>
      </div>

      {/* ── SUPER ADMIN VIEW ───────────────────────────────────────────── */}
      {isSuperAdmin && (
        <>
          {/* Key Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-blue-subtle text-blue"><CheckSquare size={18} /></div>
                <span className="text-xs text-muted">Tasks</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.openTasks || 0}</div>
                <div className="stat-label mt-1">Open Tasks</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-purple-subtle text-purple"><Briefcase size={18} /></div>
                <span className="text-xs text-muted">Tickets</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.openTickets || 0}</div>
                <div className="stat-label mt-1">Open Tickets</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
                <span className="text-xs text-muted">SLA</span>
              </div>
              <div>
                <div className={`stat-value ${(data.stats?.slaBreaches || 0) > 0 ? 'text-red' : ''}`}>{data.stats?.slaBreaches || 0}</div>
                <div className="stat-label mt-1">SLA Breaches</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-green-subtle text-green"><FolderKanban size={18} /></div>
                <span className="text-xs text-muted">Active</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.activeProjects || 0}</div>
                <div className="stat-label mt-1">Active Projects</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-amber-subtle text-amber"><AlertTriangle size={18} /></div>
                <span className="text-xs text-muted">Health</span>
              </div>
              <div>
                <div className="stat-value text-amber">{data.stats?.atRiskProjects || 0}</div>
                <div className="stat-label mt-1">At-Risk Projects</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><Clock size={18} /></div>
                <span className="text-xs text-muted">Overdue</span>
              </div>
              <div>
                <div className="stat-value text-red">{data.stats?.overdueTasks || 0}</div>
                <div className="stat-label mt-1">Overdue Tasks</div>
              </div>
            </div>
          </div>

          {/* Department Breakdown & Triage Queue */}
          <div className="dashboard-grid">
            {/* Department Breakdown Card */}
            <div className="card">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Building2 size={16} className="text-blue" /> Departmental Load
                </h3>
              </div>
              <div className="card-body p-0 flex flex-col gap-3">
                {data.charts?.tasksByDepartment?.map((dept: any) => (
                  <div key={dept.code} className="p-3 bg-surface border border-subtle rounded-lg flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dept.color }}></div>
                      <div>
                        <span className="font-medium text-sm text-primary">{dept.name}</span>
                        <span className="text-xs text-muted ml-2 font-mono">[{dept.code}]</span>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-semibold">{dept.count} tasks</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Administrative Shortcuts */}
            <div className="card">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Shield size={16} className="text-amber" /> System Governance
                </h3>
              </div>
              <div className="card-body p-0 flex flex-col gap-2">
                <a href="/settings" className="p-3 bg-surface hover:bg-surface-hover border border-subtle rounded-lg flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Users size={16} className="text-muted" />
                    <div>
                      <div className="text-sm font-medium text-primary">User & Role Provisioning</div>
                      <div className="text-xs text-muted">Create employees, assign roles and departments</div>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-muted" />
                </a>

                <a href="/ai-insights" className="p-3 bg-surface hover:bg-surface-hover border border-subtle rounded-lg flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Sparkles size={16} className="text-purple" />
                    <div>
                      <div className="text-sm font-medium text-primary">AI Intelligence Center</div>
                      <div className="text-xs text-muted">Workload bottlenecks & meeting notes parser</div>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-muted" />
                </a>

                <a href="/reports" className="p-3 bg-surface hover:bg-surface-hover border border-subtle rounded-lg flex items-center justify-between transition-colors">
                  <div className="flex items-center gap-2.5">
                    <Activity size={16} className="text-green" />
                    <div>
                      <div className="text-sm font-medium text-primary">Executive Performance Reports</div>
                      <div className="text-xs text-muted">Resolution times and SLA metrics by team</div>
                    </div>
                  </div>
                  <ArrowRight size={14} className="text-muted" />
                </a>
              </div>
            </div>
          </div>

          {/* ── Team Attendance & Daily Activity Roster (Camera Verification & Evening Logoff) ── */}
          <div className="mb-6">
            <TeamAttendanceOverviewWidget />
          </div>

          {/* ── Active Tasks & Delivery Velocity Cockpit ────────────────── */}
          <div className="card">
            <div className="card-header border-b border-subtle pb-4 mb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-blue-subtle text-blue">
                    <Gauge size={18} />
                  </div>
                  <h3 className="font-semibold text-lg text-primary">Active Tasks & Delivery Velocity</h3>
                  <span className="badge bg-blue-subtle text-blue font-mono text-xs">
                    {filteredActiveTasks.length} active
                  </span>
                </div>
                <p className="text-xs text-muted mt-1">
                  Executive oversight into live task execution, estimated time remaining to finish, and delivery pacing across all departments.
                </p>
              </div>

              {/* Summary Metrics Pills */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="px-3 py-1.5 rounded-lg bg-surface border border-subtle flex items-center gap-1.5">
                  <Clock size={13} className="text-muted" />
                  <span className="text-muted">Effort Logged:</span>
                  <span className="font-semibold font-mono text-primary">{totalActualHours.toFixed(1)}h</span>
                  <span className="text-muted">/ {totalEstimatedHours.toFixed(1)}h</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-surface border border-subtle flex items-center gap-1.5">
                  <Timer size={13} className="text-blue" />
                  <span className="text-muted">Time to Finish:</span>
                  <span className="font-semibold font-mono text-blue">{totalRemainingHours.toFixed(1)}h left</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-surface border border-subtle flex items-center gap-2">
                  <span className="flex items-center gap-1 text-green font-medium">
                    <span className="w-2 h-2 rounded-full bg-green"></span> {onTrackCount} On Track
                  </span>
                  {atRiskCount > 0 && (
                    <span className="flex items-center gap-1 text-amber font-medium">
                      <span className="w-2 h-2 rounded-full bg-amber"></span> {atRiskCount} At Risk
                    </span>
                  )}
                  {overdueCount > 0 && (
                    <span className="flex items-center gap-1 text-red font-medium">
                      <span className="w-2 h-2 rounded-full bg-red"></span> {overdueCount} Overdue
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-4">
              <div className="relative flex-1 w-full">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  placeholder="Search by Task ID (e.g. FDE-1025), issue (TKT-...), title, or assignee..."
                  value={activeTaskSearch}
                  onChange={(e) => setActiveTaskSearch(e.target.value)}
                  className="input input-sm pl-9 w-full bg-surface"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={activeDeptFilter}
                  onChange={(e) => setActiveDeptFilter(e.target.value)}
                  className="select select-sm bg-surface"
                >
                  <option value="ALL">All Departments</option>
                  {uniqueDepts.map((d: string) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>

                <select
                  value={activePacingFilter}
                  onChange={(e) => setActivePacingFilter(e.target.value)}
                  className="select select-sm bg-surface"
                >
                  <option value="ALL">All Pacing Statuses</option>
                  <option value="ON_TRACK">🟢 On Track</option>
                  <option value="AT_RISK">🟡 At Risk</option>
                  <option value="OVERDUE">🔴 Overdue</option>
                  <option value="BLOCKED">⛔ Blocked</option>
                </select>
              </div>
            </div>

            {/* Active Tasks Table */}
            <div className="overflow-x-auto border border-subtle rounded-lg">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-surface border-b border-subtle text-xs text-muted uppercase tracking-wider">
                    <th className="py-3 px-4">Task & Origin Issue</th>
                    <th className="py-3 px-4">Assignee & Team</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Progress / Effort</th>
                    <th className="py-3 px-4">Time to Finish</th>
                    <th className="py-3 px-4">Delivery Health</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle bg-surface/50">
                  {loadingActiveTasks ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted">
                        <div className="flex items-center justify-center gap-2">
                          <span className="spinner-border animate-spin inline-block w-4 h-4 border-2 rounded-full border-blue border-r-transparent"></span>
                          Loading active tasks velocity...
                        </div>
                      </td>
                    </tr>
                  ) : filteredActiveTasks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted">
                        No active tasks match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    filteredActiveTasks.map((task: any) => {
                      const isOvertime = task.computedAct > task.computedEst;
                      return (
                        <tr key={task.id} className="hover:bg-surface-hover/60 transition-colors">
                          {/* Task & Origin Issue */}
                          <td className="py-3 px-4 max-w-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span 
                                onClick={() => navigate(`/tasks/${task.id}`)}
                                className="font-mono text-xs font-bold text-blue hover:underline cursor-pointer"
                              >
                                {task.taskId}
                              </span>
                              {task.ticket && (
                                <span 
                                  onClick={() => navigate(`/tickets/${task.ticket.id}`)}
                                  className="badge bg-purple-subtle text-purple text-[10px] cursor-pointer hover:underline flex items-center gap-1 font-mono"
                                  title={`Spawned from Issue: ${task.ticket.title}`}
                                >
                                  <CornerDownRight size={10} />
                                  {task.ticket.ticketId}
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-primary text-sm truncate max-w-xs mt-0.5" title={task.title}>
                              {task.title}
                            </div>
                            {task.project && (
                              <div className="text-xs text-muted truncate">
                                {task.project.name}
                              </div>
                            )}
                          </td>

                          {/* Assignee & Team */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {task.assignee ? (
                                <>
                                  <div className="w-6 h-6 rounded-full bg-blue text-white text-[10px] font-bold flex items-center justify-center uppercase">
                                    {task.assignee.name.charAt(0)}
                                  </div>
                                  <div>
                                    <div className="text-xs font-medium text-primary">{task.assignee.name}</div>
                                    <div className="text-[10px] text-muted font-mono">{task.department?.code || 'NO-DEPT'}</div>
                                  </div>
                                </>
                              ) : (
                                <span className="badge bg-amber-subtle text-amber text-xs">Unassigned</span>
                              )}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={`badge badge-status-${task.status?.name?.toLowerCase() || 'todo'}`}>
                              {task.status?.name || 'TODO'}
                            </span>
                            {task.priority && (
                              <div className="text-[10px] text-muted mt-1 uppercase font-semibold">
                                {task.priority.name} Priority
                              </div>
                            )}
                          </td>

                          {/* Progress / Effort */}
                          <td className="py-3 px-4 min-w-[140px]">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="font-mono text-muted">{task.computedAct}h / {task.computedEst}h</span>
                              <span className={`font-mono font-bold ${
                                task.computedPct >= 100 ? 'text-red' : task.computedPct >= 80 ? 'text-amber' : 'text-green'
                              }`}>
                                {task.computedPct}%
                              </span>
                            </div>
                            <div className="w-full bg-surface-hover rounded-full h-1.5 overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${
                                  task.computedPct >= 100 ? 'bg-red' : task.computedPct >= 80 ? 'bg-amber' : 'bg-green'
                                }`} 
                                style={{ width: `${Math.min(100, task.computedPct)}%` }}
                              />
                            </div>
                          </td>

                          {/* Time to Finish */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {isOvertime ? (
                              <div>
                                <div className="text-xs font-semibold text-red flex items-center gap-1">
                                  <AlertTriangle size={12} />
                                  +{(task.computedAct - task.computedEst).toFixed(1)}h over
                                </div>
                                <div className="text-[10px] text-muted">
                                  {task.dueDate ? `Due ${formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}` : 'No deadline'}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div className="text-xs font-semibold text-blue flex items-center gap-1">
                                  <Clock size={12} />
                                  ~{task.computedRemaining}h remaining
                                </div>
                                <div className="text-[10px] text-muted">
                                  {task.dueDate ? `Due ${formatDistanceToNow(new Date(task.dueDate), { addSuffix: true })}` : 'No deadline'}
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Delivery Health */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {task.pacing === 'BLOCKED' && (
                              <span className="badge bg-red-subtle text-red border border-red/30 flex items-center gap-1 w-fit font-medium text-xs">
                                ⛔ Blocked
                              </span>
                            )}
                            {task.pacing === 'OVERDUE' && (
                              <span className="badge bg-red-subtle text-red border border-red/30 flex items-center gap-1 w-fit font-medium text-xs">
                                🔴 Overdue
                              </span>
                            )}
                            {task.pacing === 'AT_RISK' && (
                              <span className="badge bg-amber-subtle text-amber border border-amber/30 flex items-center gap-1 w-fit font-medium text-xs">
                                🟡 At Risk
                              </span>
                            )}
                            {task.pacing === 'ON_TRACK' && (
                              <span className="badge bg-green-subtle text-green border border-green/30 flex items-center gap-1 w-fit font-medium text-xs">
                                🟢 On Track
                              </span>
                            )}
                          </td>

                          {/* Action */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => navigate(`/tasks/${task.id}`)}
                              className="btn btn-xs btn-ghost text-primary hover:text-blue flex items-center gap-1 ml-auto"
                            >
                              Inspect <ArrowRight size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── ADMIN VIEW (ALLOCATION COMMAND CENTER) ──────────────────────── */}
      {isAdmin && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-blue-subtle text-blue"><CheckSquare size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.myTasks || 0}</div>
                <div className="stat-label mt-1">My Tasks</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-purple-subtle text-purple"><Briefcase size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.openTickets || 0}</div>
                <div className="stat-label mt-1">Ticket Queue</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
              </div>
              <div>
                <div className={`stat-value ${(data.stats?.slaBreaches || 0) > 0 ? 'text-red' : ''}`}>{data.stats?.slaBreaches || 0}</div>
                <div className="stat-label mt-1">SLA Breaches</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-amber-subtle text-amber"><Clock size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{unassignedTasks?.length || 0}</div>
                <div className="stat-label mt-1">Unallocated</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-purple-subtle text-purple"><TrendingUp size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.reviewTasks || 0}</div>
                <div className="stat-label mt-1">Pending Review</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
              </div>
              <div>
                <div className="stat-value text-red">{data.stats?.blockedTasks || 0}</div>
                <div className="stat-label mt-1">Blocked Tasks</div>
              </div>
            </div>
          </div>

          {/* Unallocated Issues Triage Queue (Exclusive Admin Feature) */}
          <div className="card">
            <div className="card-header border-b border-subtle pb-3 mb-4 flex justify-between items-center">
              <div>
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <UserCheck size={18} className="text-amber" /> 
                  Triage Queue: Unallocated Issues Raised by Teams
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Issues raised by FDE, Sales, and Marketing awaiting your allocation.
                </p>
              </div>
              <span className="badge bg-amber-subtle text-amber border border-amber/30">
                {unassignedTasks?.length || 0} Awaiting Owner
              </span>
            </div>

            <div className="card-body p-0">
              {loadingUnassigned ? (
                <div className="flex justify-center p-8"><div className="spinner"></div></div>
              ) : unassignedTasks && unassignedTasks.length > 0 ? (
                <div className="table-wrapper border-none">
                  <table>
                    <thead>
                      <tr>
                        <th>Issue ID</th>
                        <th>Title</th>
                        <th>Department</th>
                        <th>Priority</th>
                        <th>Reporter</th>
                        <th className="text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unassignedTasks.map((t: any) => (
                        <tr key={t.id} className="hover:bg-surface-hover">
                          <td className="font-mono text-xs font-semibold text-primary">{t.taskId}</td>
                          <td className="font-medium text-sm text-primary max-w-xs truncate">
                            <a href={`/tasks/${t.id}`} className="hover:underline flex items-center gap-1">
                              {t.title} <ExternalLink size={12} className="text-muted" />
                            </a>
                          </td>
                          <td>
                            <span className="badge badge-sm" style={{ backgroundColor: `${t.department?.color}20`, color: t.department?.color }}>
                              {t.department?.name || 'General'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge badge-priority-${t.priority?.name?.toLowerCase()}`}>
                              {t.priority?.name}
                            </span>
                          </td>
                          <td className="text-xs text-muted">{t.reporter?.name || 'Unknown'}</td>
                          <td className="text-right">
                            {allocatingTaskId === t.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <select 
                                  className="input text-xs py-1 h-7"
                                  value={selectedAssignee}
                                  onChange={e => setSelectedAssignee(e.target.value)}
                                >
                                  <option value="">Select Assignee...</option>
                                  {assignees?.map((u: any) => (
                                    <option key={u.id} value={u.id}>{u.name} ({u.department?.code})</option>
                                  ))}
                                </select>
                                <button 
                                  className="btn btn-primary btn-sm h-7 text-xs"
                                  onClick={() => handleAllocate(t.id)}
                                  disabled={allocateMutation.isPending}
                                >
                                  Save
                                </button>
                                <button 
                                  className="btn btn-secondary btn-sm h-7 text-xs"
                                  onClick={() => setAllocatingTaskId(null)}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button 
                                className="btn btn-secondary btn-sm h-7 text-xs flex items-center gap-1 ml-auto"
                                onClick={() => {
                                  setAllocatingTaskId(t.id);
                                  setSelectedAssignee('');
                                }}
                              >
                                <UserCheck size={12} /> Allocate
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center p-8 text-muted">
                  <UserCheck size={32} className="mx-auto mb-2 text-green opacity-60" />
                  <p className="font-medium text-primary">All caught up!</p>
                  <p className="text-xs mt-1">No unassigned issues in the queue. All team requests have owners.</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Team Attendance & Daily Activity Roster (Camera Verification & Evening Logoff) ── */}
          <div className="mt-6">
            <TeamAttendanceOverviewWidget />
          </div>
        </>
      )}

      {/* ── FDE ENGINEERING WORKSPACE ──────────────────────────────────── */}
      {isFDE && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-purple-subtle text-purple"><Bug size={18} /></div>
                <span className="text-xs text-muted">Engineering</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.activeCount || 0}</div>
                <div className="stat-label mt-1">My Active Tickets</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
                <span className="text-xs text-muted">Blockers</span>
              </div>
              <div>
                <div className="stat-value text-red">{data.stats?.blockedTasks || 0}</div>
                <div className="stat-label mt-1">Blocked Deployment Bugs</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-amber-subtle text-amber"><Clock size={18} /></div>
                <span className="text-xs text-muted">SLA</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.dueTodayTasks || 0}</div>
                <div className="stat-label mt-1">Due Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-green-subtle text-green"><CheckSquare size={18} /></div>
                <span className="text-xs text-muted">Last 7 Days</span>
              </div>
              <div>
                <div className="stat-value">{data.recentlyDone?.length || 0}</div>
                <div className="stat-label mt-1">Resolved Defects</div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            {/* My Active Engineering Tickets */}
            <div className="card flex-1">
              <div className="card-header border-b border-subtle pb-3 mb-4 flex justify-between items-center">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Bug size={16} className="text-purple" /> Assigned Technical Tickets
                </h3>
                <a href="/tasks" className="text-xs text-blue hover:underline flex items-center gap-1">
                  View Board <ArrowRight size={12} />
                </a>
              </div>
              <div className="card-body p-0">
                {data.myTasks?.length > 0 ? (
                  data.myTasks.map((t: any) => (
                    <div key={t.id} className="task-row cursor-pointer" onClick={() => navigate(`/tasks/${t.id}`)}>
                      <div className="font-mono text-xs font-semibold text-purple">{t.taskId}</div>
                      <div className="task-title flex-1">{t.title}</div>
                      <span className={`badge badge-priority-${t.priority?.name?.toLowerCase()}`}>
                        {t.priority?.name}
                      </span>
                      <span className={`badge badge-status-${t.status?.name?.toLowerCase()}`}>
                        {t.status?.name}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted">
                    <p>No open engineering tickets assigned to you.</p>
                  </div>
                )}
              </div>
            </div>

            {/* FDE Daily AI Plan */}
            <div className="card">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Sparkles size={16} className="text-purple" /> AI Engineering Plan
                </h3>
              </div>
              <div className="card-body">
                {data.dailyPlan?.plan ? (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap font-sans text-muted">
                    {data.dailyPlan.plan}
                  </div>
                ) : (
                  <p className="text-sm text-muted">AI plan is generated daily based on open bugs and priority tickets.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── SALES WORKSPACE ────────────────────────────────────────────── */}
      {isSales && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-green-subtle text-green"><Briefcase size={18} /></div>
                <span className="text-xs text-muted">Accounts</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.activeCount || 0}</div>
                <div className="stat-label mt-1">Client Issues Assigned</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-amber-subtle text-amber"><Clock size={18} /></div>
                <span className="text-xs text-muted">Urgent</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.dueTodayTasks || 0}</div>
                <div className="stat-label mt-1">SLA Critical Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
                <span className="text-xs text-muted">Deal Risk</span>
              </div>
              <div>
                <div className="stat-value text-red">{data.stats?.blockedTasks || 0}</div>
                <div className="stat-label mt-1">Blocked Accounts</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-blue-subtle text-blue"><CheckSquare size={18} /></div>
                <span className="text-xs text-muted">Resolved</span>
              </div>
              <div>
                <div className="stat-value">{data.recentlyDone?.length || 0}</div>
                <div className="stat-label mt-1">Deals Unblocked</div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card flex-1">
              <div className="card-header border-b border-subtle pb-3 mb-4 flex justify-between items-center">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Briefcase size={16} className="text-green" /> Client Issues Under Investigation
                </h3>
                <button 
                  className="btn btn-primary btn-sm text-xs"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <PlusCircle size={12} /> Raise Client Blocker
                </button>
              </div>
              <div className="card-body p-0">
                {data.myTasks?.length > 0 ? (
                  data.myTasks.map((t: any) => (
                    <div key={t.id} className="task-row cursor-pointer" onClick={() => navigate(`/tasks/${t.id}`)}>
                      <div className="font-mono text-xs font-semibold text-green">{t.taskId}</div>
                      <div className="task-title flex-1">{t.title}</div>
                      <span className={`badge badge-status-${t.status?.name?.toLowerCase()}`}>
                        {t.status?.name}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted">
                    <p>No active customer blockers assigned to you.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Sparkles size={16} className="text-green" /> Daily Action Checklist
                </h3>
              </div>
              <div className="card-body">
                {data.dailyPlan?.plan ? (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted">
                    {data.dailyPlan.plan}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Daily checklist generated for high-priority client deliverables.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── MARKETING WORKSPACE ────────────────────────────────────────── */}
      {isMarketing && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-amber-subtle text-amber"><Megaphone size={18} /></div>
                <span className="text-xs text-muted">Campaigns</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.activeCount || 0}</div>
                <div className="stat-label mt-1">Active Deliverables</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-blue-subtle text-blue"><Calendar size={18} /></div>
                <span className="text-xs text-muted">This Week</span>
              </div>
              <div>
                <div className="stat-value">{data.stats?.dueThisWeek || 0}</div>
                <div className="stat-label mt-1">Due This Week</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
                <span className="text-xs text-muted">Launch Risk</span>
              </div>
              <div>
                <div className="stat-value text-red">{data.stats?.blockedTasks || 0}</div>
                <div className="stat-label mt-1">Blocked Deliverables</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-green-subtle text-green"><CheckSquare size={18} /></div>
                <span className="text-xs text-muted">Shipped</span>
              </div>
              <div>
                <div className="stat-value">{data.recentlyDone?.length || 0}</div>
                <div className="stat-label mt-1">Assets Approved</div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card flex-1">
              <div className="card-header border-b border-subtle pb-3 mb-4 flex justify-between items-center">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Megaphone size={16} className="text-amber" /> Active Campaign Deliverables
                </h3>
                <button 
                  className="btn btn-primary btn-sm text-xs"
                  onClick={() => setIsCreateModalOpen(true)}
                >
                  <PlusCircle size={12} /> Submit Campaign Request
                </button>
              </div>
              <div className="card-body p-0">
                {data.myTasks?.length > 0 ? (
                  data.myTasks.map((t: any) => (
                    <div key={t.id} className="task-row cursor-pointer" onClick={() => navigate(`/tasks/${t.id}`)}>
                      <div className="font-mono text-xs font-semibold text-amber">{t.taskId}</div>
                      <div className="task-title flex-1">{t.title}</div>
                      <span className={`badge badge-status-${t.status?.name?.toLowerCase()}`}>
                        {t.status?.name}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted">
                    <p>No active marketing deliverables assigned to you.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary flex items-center gap-2">
                  <Sparkles size={16} className="text-amber" /> Campaign Schedule
                </h3>
              </div>
              <div className="card-body">
                {data.dailyPlan?.plan ? (
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted">
                    {data.dailyPlan.plan}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Daily creative schedule aligned with campaign launch dates.</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── DEFAULT EMPLOYEE VIEW (OTHER DEPARTMENTS) ────────────────── */}
      {!isFDE && !isSales && !isMarketing && isEmployee && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-blue-subtle text-blue"><CheckSquare size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.activeCount || 0}</div>
                <div className="stat-label mt-1">My Active Tasks</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-amber-subtle text-amber"><Clock size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.dueTodayTasks || 0}</div>
                <div className="stat-label mt-1">Due Today</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-red-subtle text-red"><AlertTriangle size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.blockedTasks || 0}</div>
                <div className="stat-label mt-1">Blocked Tasks</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-start justify-between">
                <div className="stat-icon-wrap bg-purple-subtle text-purple"><TrendingUp size={18} /></div>
              </div>
              <div>
                <div className="stat-value">{data.stats?.dueThisWeek || 0}</div>
                <div className="stat-label mt-1">Due This Week</div>
              </div>
            </div>
          </div>

          <div className="dashboard-grid">
            <div className="card flex-1">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary">My Priority Work</h3>
              </div>
              <div className="card-body p-0">
                {data.myTasks?.length > 0 ? (
                  data.myTasks.map((task: any) => (
                    <div key={task.id} className="task-row cursor-pointer" onClick={() => navigate(`/tasks/${task.id}`)}>
                      <div className="task-id">{task.taskId}</div>
                      <div className="task-title">{task.title}</div>
                      <span className={`badge badge-status-${task.status.name.toLowerCase()}`}>{task.status.name}</span>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-muted">You're all caught up!</div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header border-b border-subtle pb-3 mb-4">
                <h3 className="font-semibold text-primary">AI Daily Plan</h3>
              </div>
              <div className="card-body">
                <div className="text-sm leading-relaxed whitespace-pre-wrap text-muted">
                  {data.dailyPlan?.plan || 'No plan generated yet.'}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Interactive Modal */}
      <CreateTaskModal 
        isOpen={isCreateModalOpen} 
        onClose={() => setIsCreateModalOpen(false)} 
      />

    </div>
  );
}
