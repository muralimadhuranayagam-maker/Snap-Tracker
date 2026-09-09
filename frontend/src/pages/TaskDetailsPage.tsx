import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { 
  ArrowLeft, 
  Clock, 
  FileText, 
  Users, 
  AlertCircle, 
  Building, 
  Ticket, 
  MessageSquare, 
  Send,
  AlertTriangle,
  FolderKanban,
  ShieldCheck,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export function TaskDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'overview' | 'comments' | 'worklogs' | 'dependencies' | 'history'>('overview');
  const [newComment, setNewComment] = useState('');
  const [isLogWorkModalOpen, setIsLogWorkModalOpen] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [logDescription, setLogDescription] = useState('');
  
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvalTitle, setApprovalTitle] = useState('');
  const [approvalDescription, setApprovalDescription] = useState('');

  // Fetch Task Details
  const { data: task, isLoading, error } = useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const res = await api.get(`/tasks/${id}`);
      return res.data;
    },
    enabled: !!id,
    refetchInterval: 12_000,
  });

  // Fetch statuses and priorities for update selectors
  const { data: metaData } = useQuery({
    queryKey: ['task-meta'],
    queryFn: async () => {
      const res = await api.get('/tasks/meta/statuses');
      return res.data;
    }
  });
  const statuses = metaData?.statuses || [];
  const priorities = metaData?.priorities || [];

  // Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: (statusId: string) => api.patch(`/tasks/${id}`, { statusId }),
    onSuccess: (res: any) => {
      toast.success(`Status changed to ${res.data.status?.name?.replace('_', ' ')}`);
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update status');
    }
  });

  // Update Priority Mutation
  const updatePriorityMutation = useMutation({
    mutationFn: (priorityId: string) => api.patch(`/tasks/${id}`, { priorityId }),
    onSuccess: () => {
      toast.success('Priority updated');
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to update priority');
    }
  });

  // Post Comment Mutation
  const postCommentMutation = useMutation({
    mutationFn: (content: string) => api.post('/comments', { taskId: id, content }),
    onSuccess: (res: any) => {
      setNewComment('');
      if (res.data?.aiFlag === 'BLOCKER') {
        toast('Comment flagged as an active BLOCKER', { icon: '⚠️' });
      } else {
        toast.success('Comment posted');
      }
      queryClient.invalidateQueries({ queryKey: ['task', id] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to post comment');
    }
  });

  // Log Work Mutation
  const logWorkMutation = useMutation({
    mutationFn: (data: { hours: number; description: string }) => 
      api.post('/worklogs', { taskId: id, ...data }),
    onSuccess: () => {
      toast.success('Work logged successfully');
      setLogHours('');
      setLogDescription('');
      setIsLogWorkModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to log work');
    }
  });

  // Request Sign-off Approval Mutation
  const requestApprovalMutation = useMutation({
    mutationFn: (data: { title: string; description: string; type: string }) =>
      api.post('/approvals', { taskId: id, ...data }),
    onSuccess: () => {
      toast.success('Sign-off approval requested');
      setIsApprovalModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to request approval');
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="empty-state-card text-red my-8">
        <AlertCircle size={40} className="mb-3" />
        <h2 className="text-xl font-bold text-primary">Task Not Found</h2>
        <p className="mt-1 text-sm text-muted">{(error as any)?.message || 'Task not found or access restricted.'}</p>
        <button className="btn btn-secondary btn-sm mt-4" onClick={() => navigate('/tasks')}>
          <ArrowLeft size={14} /> Back to Tasks
        </button>
      </div>
    );
  }

  // Derived metrics
  const totalLoggedHours = task.worklogs?.reduce((sum: number, w: any) => sum + Number(w.hours), 0) || 0;
  const remainingHours = Math.max(0, (task.estimatedHours || 0) - totalLoggedHours);
  const hasRisk = task.aiRisk?.hasRisk;
  const comments = task.comments || [];
  const worklogs = task.worklogs || [];
  const approvals = task.approvals || [];
  const blockedByDeps = task.blockedByDeps || [];
  const blockingDeps = task.blockingDeps || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-subtle pb-4">
        <div className="flex items-start gap-3">
          <button 
            className="btn-icon btn-ghost text-muted hover:text-primary mt-1" 
            onClick={() => navigate('/tasks')}
            title="Back to Tasks"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="font-mono text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                {task.taskId}
              </span>

              {/* Status Selector */}
              <div className="relative inline-block">
                <select
                  className="bg-elevated border border-subtle text-xs font-semibold rounded-full px-2.5 py-1 text-primary cursor-pointer hover:border-accent"
                  value={task.statusId}
                  onChange={e => updateStatusMutation.mutate(e.target.value)}
                >
                  {statuses.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {/* Priority Selector */}
              <div className="relative inline-block">
                <select
                  className="bg-elevated border border-subtle text-xs font-medium rounded-full px-2.5 py-1 text-secondary cursor-pointer hover:border-accent"
                  value={task.priorityId}
                  onChange={e => updatePriorityMutation.mutate(e.target.value)}
                >
                  {priorities.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} Priority</option>
                  ))}
                </select>
              </div>

              {/* Originating Ticket Badge */}
              {task.ticket && (
                <button
                  className="badge bg-amber-subtle text-amber border border-amber/30 text-xs flex items-center gap-1 hover:bg-amber/20 transition cursor-pointer"
                  onClick={() => navigate(`/tickets/${task.ticket.id}`)}
                  title="View Originating Ticket"
                >
                  <Ticket size={12} /> Linked Ticket: {task.ticket.ticketId}
                </button>
              )}

              {hasRisk && (
                <span className="badge bg-red-subtle text-red border border-red/30 flex items-center gap-1 text-xs">
                  <AlertTriangle size={12} /> At-Risk Deadline
                </span>
              )}
            </div>

            <h1 className="text-xl md:text-2xl font-bold text-primary">{task.title}</h1>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button 
            className="btn btn-secondary btn-sm flex items-center gap-1.5"
            onClick={() => setIsLogWorkModalOpen(true)}
          >
            <Clock size={14} /> Log Work
          </button>
          
          <button 
            className="btn btn-primary btn-sm flex items-center gap-1.5"
            onClick={() => {
              setApprovalTitle(`Sign-off: ${task.taskId} - ${task.title}`);
              setIsApprovalModalOpen(true);
            }}
          >
            <ShieldCheck size={14} /> Request Approval
          </button>
        </div>
      </div>

      {/* Grid Layout: Main Tabs & Sidebar Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Navigation Tabs */}
          <div className="flex border-b border-subtle gap-2">
            <button
              className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 ${activeTab === 'overview' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center gap-1.5 ${activeTab === 'comments' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}`}
              onClick={() => setActiveTab('comments')}
            >
              Comments
              {comments.length > 0 && <span className="badge bg-elevated text-[10px]">{comments.length}</span>}
            </button>
            <button
              className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center gap-1.5 ${activeTab === 'worklogs' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}`}
              onClick={() => setActiveTab('worklogs')}
            >
              Worklogs
              <span className="badge bg-elevated text-[10px] font-mono">{totalLoggedHours}h</span>
            </button>
            <button
              className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 flex items-center gap-1.5 ${activeTab === 'dependencies' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}`}
              onClick={() => setActiveTab('dependencies')}
            >
              Dependencies
              {(blockedByDeps.length + blockingDeps.length) > 0 && (
                <span className="badge bg-elevated text-[10px]">{blockedByDeps.length + blockingDeps.length}</span>
              )}
            </button>
            <button
              className={`pb-2.5 px-3 text-xs font-semibold transition border-b-2 ${activeTab === 'history' ? 'border-accent text-primary' : 'border-transparent text-muted hover:text-primary'}`}
              onClick={() => setActiveTab('history')}
            >
              History
            </button>
          </div>

          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="card p-5 bg-surface border-subtle">
                <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FileText size={14} /> Description
                </h3>
                <div className="text-sm text-primary leading-relaxed whitespace-pre-wrap">
                  {task.description || <span className="text-muted italic">No description provided for this deliverable.</span>}
                </div>
              </div>

              {/* AI Insights Card */}
              {task.aiRisk && (
                <div className="card p-4 bg-gradient-to-r from-accent/5 to-purple-500/5 border-accent/20">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={15} className="text-accent" />
                    <h4 className="text-xs font-bold text-primary uppercase tracking-wider">AI Predictive Analysis</h4>
                  </div>
                  <div className="text-xs text-secondary space-y-1">
                    <div>Estimated Cycle Time: <strong className="text-primary">{task.aiRisk.estimatedCompletionDays || 2} days</strong></div>
                    {task.aiRisk.riskFactors?.length > 0 && (
                      <div className="text-red mt-1">
                        Risk Factor: {task.aiRisk.riskFactors.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMMENTS */}
          {activeTab === 'comments' && (
            <div className="space-y-4">
              {/* Comment Input */}
              <div className="card p-4 bg-surface border-subtle space-y-3">
                <textarea
                  className="input text-xs w-full min-h-[70px]"
                  placeholder="Add an update or report a blocker (AI will automatically flag dependencies)..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                    disabled={!newComment.trim() || postCommentMutation.isPending}
                    onClick={() => postCommentMutation.mutate(newComment)}
                  >
                    <Send size={12} /> Post Comment
                  </button>
                </div>
              </div>

              {/* Comments Stream */}
              <div className="space-y-3">
                {comments.map((comment: any) => (
                  <div key={comment.id} className="card p-4 bg-surface border-subtle space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="avatar avatar-sm bg-accent text-xs">
                          {comment.user?.avatar ? <img src={comment.user.avatar} alt="" /> : comment.user?.name?.charAt(0) || '?'}
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-primary">{comment.user?.name}</div>
                          <div className="text-[10px] text-muted">{format(new Date(comment.createdAt), 'MMM d, h:mm a')}</div>
                        </div>
                      </div>

                      {comment.aiFlag === 'BLOCKER' && (
                        <span className="badge bg-red-subtle text-red border border-red/30 text-[10px] font-bold">
                          BLOCKER DETECTED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-primary leading-relaxed whitespace-pre-wrap pl-8">
                      {comment.content}
                    </div>
                  </div>
                ))}

                {comments.length === 0 && (
                  <div className="empty-state-card py-8">
                    <MessageSquare size={28} className="text-muted mb-2" />
                    <div className="text-xs text-muted">No comments yet. Start the conversation above.</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: WORKLOGS */}
          {activeTab === 'worklogs' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-3 bg-surface border-subtle">
                  <div className="text-[11px] text-muted">Estimated</div>
                  <div className="text-lg font-bold font-mono text-primary">{task.estimatedHours || 0}h</div>
                </div>
                <div className="card p-3 bg-surface border-subtle">
                  <div className="text-[11px] text-muted">Logged Effort</div>
                  <div className="text-lg font-bold font-mono text-accent">{totalLoggedHours}h</div>
                </div>
                <div className="card p-3 bg-surface border-subtle">
                  <div className="text-[11px] text-muted">Remaining</div>
                  <div className="text-lg font-bold font-mono text-green">{remainingHours}h</div>
                </div>
              </div>

              <div className="card overflow-hidden">
                <div className="table-responsive">
                  <table>
                    <thead>
                      <tr>
                        <th>Engineer</th>
                        <th>Hours</th>
                        <th>Notes</th>
                        <th>Logged Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {worklogs.map((w: any) => (
                        <tr key={w.id}>
                          <td className="text-xs font-medium text-primary">
                            {w.user?.name || 'Engineer'}
                          </td>
                          <td className="text-xs font-mono font-bold text-accent">
                            {w.hours}h
                          </td>
                          <td className="text-xs text-secondary">
                            {w.description || '—'}
                          </td>
                          <td className="text-xs text-muted">
                            {format(new Date(w.logDate || w.createdAt), 'MMM d, yyyy')}
                          </td>
                        </tr>
                      ))}

                      {worklogs.length === 0 && (
                        <tr>
                          <td colSpan={4} className="text-center py-8 text-xs text-muted">
                            No work logged yet. Click "+ Log Work" above.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DEPENDENCIES */}
          {activeTab === 'dependencies' && (
            <div className="space-y-4">
              <div className="card p-4 bg-surface border-subtle space-y-2">
                <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Prerequisite Tasks (Blocked By)</h4>
                {blockedByDeps.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {blockedByDeps.map((dep: any) => (
                      <div 
                        key={dep.id} 
                        className="flex items-center justify-between p-2.5 bg-elevated rounded border border-subtle cursor-pointer hover:border-accent"
                        onClick={() => navigate(`/tasks/${dep.source?.id}`)}
                      >
                        <span className="font-mono text-xs text-accent">{dep.source?.taskId}</span>
                        <span className="text-xs text-primary font-medium">{dep.source?.title}</span>
                        <span className="badge bg-surface text-[10px]">{dep.source?.status?.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted italic">This task is not blocked by any dependencies.</p>
                )}
              </div>

              <div className="card p-4 bg-surface border-subtle space-y-2">
                <h4 className="text-xs font-bold text-secondary uppercase tracking-wider">Subsequent Tasks (Blocking)</h4>
                {blockingDeps.length > 0 ? (
                  <div className="space-y-2 mt-2">
                    {blockingDeps.map((dep: any) => (
                      <div 
                        key={dep.id} 
                        className="flex items-center justify-between p-2.5 bg-elevated rounded border border-subtle cursor-pointer hover:border-accent"
                        onClick={() => navigate(`/tasks/${dep.target?.id}`)}
                      >
                        <span className="font-mono text-xs text-accent">{dep.target?.taskId}</span>
                        <span className="text-xs text-primary font-medium">{dep.target?.title}</span>
                        <span className="badge bg-surface text-[10px]">{dep.target?.status?.name}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted italic">This task does not block any other tasks.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: HISTORY */}
          {activeTab === 'history' && (
            <div className="card p-4 bg-surface border-subtle">
              <div className="space-y-3">
                {task.history?.map((item: any) => (
                  <div key={item.id} className="flex gap-3 text-xs border-b border-subtle/50 pb-2.5">
                    <div className="text-muted font-mono whitespace-nowrap text-[11px]">
                      {format(new Date(item.createdAt), 'MMM d, h:mm a')}
                    </div>
                    <div className="text-secondary">
                      <strong className="text-primary">{item.action.replace(/_/g, ' ')}</strong>
                      {item.field && <span> on <code className="text-accent">{item.field}</code></span>}
                    </div>
                  </div>
                ))}

                {(!task.history || task.history.length === 0) && (
                  <p className="text-xs text-muted italic text-center py-4">No audit events recorded.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar Metadata */}
        <div className="space-y-4">
          {/* Customer 360 Link */}
          {task.customer && (
            <div 
              className="card p-4 bg-surface border-subtle cursor-pointer hover:border-accent/40 transition"
              onClick={() => navigate(`/customers/${task.customer.id}`)}
            >
              <div className="text-[11px] text-muted font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Building size={13} className="text-green" /> Customer 360
              </div>
              <div className="text-sm font-bold text-primary">{task.customer.name}</div>
              <div className="text-xs text-muted font-mono mt-0.5">{task.customer.code} • Click to view account</div>
            </div>
          )}

          {/* Project Link */}
          {task.project && (
            <div 
              className="card p-4 bg-surface border-subtle cursor-pointer hover:border-blue/40 transition"
              onClick={() => navigate(`/projects/${task.project.id}`)}
            >
              <div className="text-[11px] text-muted font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FolderKanban size={13} className="text-blue" /> Project Context
              </div>
              <div className="text-sm font-bold text-primary">{task.project.name}</div>
              <div className="text-xs text-muted mt-0.5">Click to view project roadmap</div>
            </div>
          )}

          {/* People Card */}
          <div className="card p-4 bg-surface border-subtle space-y-3">
            <h4 className="text-[11px] font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Users size={13} /> People
            </h4>

            <div>
              <span className="text-[10px] text-muted uppercase font-semibold block mb-1">Assignee</span>
              {task.assignee ? (
                <div className="flex items-center gap-2">
                  <div className="avatar avatar-sm bg-accent text-xs">
                    {task.assignee.avatar ? <img src={task.assignee.avatar} alt="" /> : task.assignee.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-primary">{task.assignee.name}</div>
                    <div className="text-[10px] text-muted">{task.assignee.email}</div>
                  </div>
                </div>
              ) : (
                <span className="text-xs text-muted italic">Unassigned</span>
              )}
            </div>

            <div className="border-t border-subtle pt-2">
              <span className="text-[10px] text-muted uppercase font-semibold block mb-1">Reporter</span>
              <div className="text-xs font-medium text-secondary">{task.reporter?.name || 'System'}</div>
            </div>
          </div>

          {/* Planning Details */}
          <div className="card p-4 bg-surface border-subtle space-y-2.5">
            <h4 className="text-[11px] font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Clock size={13} /> Planning & Schedule
            </h4>

            <div className="flex justify-between text-xs py-1 border-b border-subtle/50">
              <span className="text-muted">Due Date</span>
              <span className="font-medium text-primary">
                {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date'}
              </span>
            </div>

            <div className="flex justify-between text-xs py-1 border-b border-subtle/50">
              <span className="text-muted">Estimated Hours</span>
              <span className="font-mono font-medium text-primary">{task.estimatedHours || '—'} hrs</span>
            </div>

            <div className="flex justify-between text-xs py-1 border-b border-subtle/50">
              <span className="text-muted">Actual Logged</span>
              <span className="font-mono font-bold text-accent">{totalLoggedHours} hrs</span>
            </div>

            <div className="flex justify-between text-xs py-1">
              <span className="text-muted">Created</span>
              <span className="text-muted">{format(new Date(task.createdAt), 'MMM d, yyyy')}</span>
            </div>
          </div>

          {/* Active Approvals */}
          {approvals.length > 0 && (
            <div className="card p-4 bg-surface border-subtle space-y-2">
              <h4 className="text-[11px] font-bold text-secondary uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green" /> Approvals
              </h4>
              {approvals.map((appr: any) => (
                <div key={appr.id} className="p-2.5 bg-elevated rounded border border-subtle text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-primary">{appr.title}</span>
                    <span className={`badge text-[10px] font-bold ${
                      appr.status === 'APPROVED' ? 'bg-green-subtle text-green' :
                      appr.status === 'REJECTED' ? 'bg-red-subtle text-red' :
                      'bg-amber-subtle text-amber'
                    }`}>
                      {appr.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted">Requested by {appr.requester?.name}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Log Work Modal */}
      {isLogWorkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-blur">
          <div className="card p-6 bg-surface border-subtle max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-primary">Log Work Effort</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="input-label">Hours Spent</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="24"
                  placeholder="e.g. 2.5"
                  className="input"
                  value={logHours}
                  onChange={e => setLogHours(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Work Description</label>
                <textarea
                  placeholder="Summary of engineering activities completed..."
                  className="input min-h-[60px]"
                  value={logDescription}
                  onChange={e => setLogDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setIsLogWorkModalOpen(false)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary btn-sm"
                disabled={!logHours || logWorkMutation.isPending}
                onClick={() => logWorkMutation.mutate({ hours: parseFloat(logHours), description: logDescription })}
              >
                Save Worklog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Sign-off Approval Modal */}
      {isApprovalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop-blur">
          <div className="card p-6 bg-surface border-subtle max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-primary">Request Formal Approval</h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="input-label">Approval Title</label>
                <input
                  type="text"
                  className="input"
                  value={approvalTitle}
                  onChange={e => setApprovalTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="input-label">Sign-off Notes & Verification Evidence</label>
                <textarea
                  placeholder="Explain what has been verified and why this deliverable is ready for sign-off..."
                  className="input min-h-[80px]"
                  value={approvalDescription}
                  onChange={e => setApprovalDescription(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn btn-ghost btn-sm" onClick={() => setIsApprovalModalOpen(false)}>
                Cancel
              </button>
              <button 
                className="btn btn-primary btn-sm"
                disabled={!approvalTitle.trim() || requestApprovalMutation.isPending}
                onClick={() => requestApprovalMutation.mutate({ 
                  title: approvalTitle, 
                  description: approvalDescription,
                  type: 'TASK_COMPLETION' 
                })}
              >
                Submit Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
