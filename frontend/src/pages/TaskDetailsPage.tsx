import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { SubmitForReviewModal } from '../components/tasks/SubmitForReviewModal';
import { 
  ArrowLeft, 
  Clock, 
  FileText, 
  Users, 
  AlertCircle, 
  Ticket, 
  MessageSquare, 
  Send,
  AlertTriangle,
  FolderKanban,
  ShieldCheck,
  Sparkles,
  Calendar,
  ArrowRight,
  ChevronDown,
  X,
  Check,
  CheckCircle2,
  XCircle,
  Paperclip,
  Music,
  Video,
  Image as ImageIcon,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

interface StatusConfig {
  label: string;
  desc: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  BACKLOG: { label: 'Backlog', desc: 'Queued for future sprint work', dotColor: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.1)', textColor: '#94a3b8', borderColor: 'rgba(148, 163, 184, 0.25)' },
  IN_PROGRESS: { label: 'In Progress', desc: 'Work actively underway', dotColor: '#eab308', bgColor: 'rgba(234, 179, 8, 0.12)', textColor: '#eab308', borderColor: 'rgba(234, 179, 8, 0.3)' },
  BLOCKED: { label: 'Blocked', desc: 'Waiting on dependencies or approvals', dotColor: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.12)', textColor: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' },
  IN_REVIEW: { label: 'In Review', desc: 'Awaiting Super Admin review & approval', dotColor: '#f97316', bgColor: 'rgba(249, 115, 22, 0.12)', textColor: '#f97316', borderColor: 'rgba(249, 115, 22, 0.3)' },
  DONE: { label: 'Completed', desc: 'Task verified and approved as complete', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)', textColor: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)' },
};

interface PriorityConfig {
  label: string;
  desc: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const PRIORITY_CONFIG: Record<string, PriorityConfig> = {
  LOW: { label: 'Low Priority', desc: 'Minor impact / flexible schedule', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)', textColor: '#22c55e', borderColor: 'rgba(34, 197, 94, 0.3)' },
  MEDIUM: { label: 'Medium Priority', desc: 'Standard operational timeline', dotColor: '#3b82f6', bgColor: 'rgba(59, 130, 246, 0.12)', textColor: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.3)' },
  HIGH: { label: 'High Priority', desc: 'Important - finish before sprint end', dotColor: '#f97316', bgColor: 'rgba(249, 115, 22, 0.12)', textColor: '#f97316', borderColor: 'rgba(249, 115, 22, 0.3)' },
  CRITICAL: { label: 'Critical Priority', desc: 'Urgent - requires immediate action', dotColor: '#ef4444', bgColor: 'rgba(239, 68, 68, 0.15)', textColor: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.35)' },
};

export function TaskDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdminOrSuper = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [newComment, setNewComment] = useState('');
  const [isLogWorkModalOpen, setIsLogWorkModalOpen] = useState(false);
  const [logHours, setLogHours] = useState('');
  const [logDescription, setLogDescription] = useState('');
  
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [approvalTitle, setApprovalTitle] = useState('');
  const [approvalDescription, setApprovalDescription] = useState('');

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);

  // Review and Approval Flow States
  const [isSubmitReviewModalOpen, setIsSubmitReviewModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const handleApproveTask = async () => {
    if (!id) return;
    setIsApproving(true);
    try {
      await api.post(`/tasks/${id}/approve`, { notes: 'Approved as completed' });
      toast.success('Task approved and completed!');
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to approve task');
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectTask = async () => {
    if (!id) return;
    if (!rejectionReason.trim()) {
      toast.error('Please enter a rejection reason.');
      return;
    }
    setIsRejecting(true);
    try {
      await api.post(`/tasks/${id}/reject`, { reason: rejectionReason.trim() });
      toast.success('Task rejected and returned to In Progress.');
      setIsRejectModalOpen(false);
      setRejectionReason('');
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to reject task');
    } finally {
      setIsRejecting(false);
    }
  };

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
      const newStatusName = res.data.status?.name || '';
      const displayLabel = STATUS_CONFIG[newStatusName]?.label || newStatusName.replace('_', ' ');
      toast.success(`Status changed to ${displayLabel}`);
      queryClient.invalidateQueries({ queryKey: ['task', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task-status-logs'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['active-tasks-velocity'] });
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
      <div className="card max-w-lg mx-auto text-center py-12 px-6 my-12 border border-subtle shadow-sm">
        <div className="w-16 h-16 rounded-2xl bg-red/10 text-red flex items-center justify-center mx-auto mb-4">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-bold text-primary">Task Not Found</h2>
        <p className="mt-1 text-xs text-muted">{(error as any)?.message || 'Task not found or access restricted.'}</p>
        <button className="btn btn-secondary btn-sm mt-6 inline-flex items-center gap-2" onClick={() => navigate('/tasks')}>
          <ArrowLeft size={14} /> Back to Task Board
        </button>
      </div>
    );
  }

  // Derived metrics
  const worklogHours = task.worklogs?.reduce((sum: number, w: any) => sum + Number(w.hours), 0) || 0;
  let totalLoggedHours = Math.max(worklogHours, Number(task.actualHours || 0));
  if (task.status?.name === 'IN_PROGRESS') {
    const baseHours = Number(task.savedActualHours ?? worklogHours);
    const startTs = task.startDate ? new Date(task.startDate).getTime() : new Date(task.updatedAt || task.createdAt).getTime();
    const elapsedHours = Math.max(0, (Date.now() - startTs) / (1000 * 60 * 60));
    const liveSession = elapsedHours > 0 && elapsedHours < 0.1 ? 0.1 : elapsedHours;
    totalLoggedHours = Math.max(totalLoggedHours, Number((baseHours + liveSession).toFixed(1)));
  }
  const estimatedHours = task.estimatedHours || 0;
  const effortPct = estimatedHours > 0 ? Math.min(100, Math.round((totalLoggedHours / estimatedHours) * 100)) : 0;
  const comments = task.comments || [];

  // Find the latest review submission comment if any
  const latestReviewComment = comments.slice().reverse().find((c: any) => 
    c.content?.includes('[SUBMITTED FOR REVIEW]') || c.content?.includes('SUBMITTED FOR REVIEW')
  );

  const currentStatusKey = task.status?.name || 'BACKLOG';
  const statusConfig = STATUS_CONFIG[currentStatusKey] || {
    label: currentStatusKey === 'DONE' ? 'COMPLETED' : currentStatusKey.replace('_', ' '),
    dotColor: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.1)',
    textColor: '#94a3b8',
    borderColor: 'rgba(148, 163, 184, 0.2)'
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && currentStatusKey !== 'DONE';

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto pb-16">
      {/* Top Header Card Banner */}
      <div className="bg-surface p-6 rounded-2xl border border-subtle shadow-sm space-y-5">
        {/* Row 1: Integrated Back Navigation & Action Buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-subtle/60 pb-4">
          {/* Back Navigation & Breadcrumb */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/tasks')}
              className="w-8 h-8 rounded-lg bg-elevated hover:bg-elevated/80 border border-subtle flex items-center justify-center text-secondary hover:text-primary transition-all shadow-xs group shrink-0"
              title="Back to Task Board"
            >
              <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            </button>

            <div className="flex items-center gap-2 text-xs text-muted font-medium flex-wrap">
              <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => navigate('/projects')}>
                Projects
              </span>
              {task.project ? (
                <>
                  <span className="text-subtle">/</span>
                  <span 
                    className="cursor-pointer text-blue-400 hover:text-blue-300 transition-colors font-medium flex items-center gap-1"
                    onClick={() => navigate(`/projects/${task.project.id}`)}
                    title="Open parent project"
                  >
                    <FolderKanban size={13} className="shrink-0" />
                    {task.project.name}
                  </span>
                </>
              ) : null}
              <span className="text-subtle">/</span>
              <span className="cursor-pointer hover:text-primary transition-colors" onClick={() => navigate('/tasks')}>
                Tasks
              </span>
              <span className="text-subtle">/</span>
              <span className="font-mono font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                {task.taskId}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            {/* Submit for Review button: visible when task is in BACKLOG, IN_PROGRESS, or BLOCKED */}
            {(currentStatusKey === 'IN_PROGRESS' || currentStatusKey === 'BLOCKED' || currentStatusKey === 'BACKLOG') && (
              <button 
                className="btn btn-sm flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-all shadow-sm"
                onClick={() => setIsSubmitReviewModalOpen(true)}
              >
                <ShieldCheck size={15} />
                <span>Submit for Review</span>
              </button>
            )}

            <button 
              className="btn btn-secondary btn-sm flex items-center gap-2 shadow-xs text-xs font-medium px-3.5 py-2 border border-subtle hover:border-accent/40"
              onClick={() => setIsLogWorkModalOpen(true)}
            >
              <Clock size={14} className="text-accent" />
              <span>Log Work</span>
            </button>
            
            <button 
              className="btn btn-primary btn-sm flex items-center gap-2 shadow-md text-xs font-semibold px-4 py-2"
              onClick={() => {
                setApprovalTitle(`Sign-off: ${task.taskId} - ${task.title}`);
                setIsApprovalModalOpen(true);
              }}
            >
              <ShieldCheck size={15} />
              <span>Request Approval</span>
            </button>
          </div>
        </div>

        {/* Task Under Review Banner with Dedicated Approve (Green) & Reject (Red) Buttons */}
        {currentStatusKey === 'IN_REVIEW' && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <ShieldCheck size={22} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-amber-300">Task Under Review & Verification</h3>
                <p className="text-[11px] text-amber-200/80 leading-relaxed">
                  {isAdminOrSuper 
                    ? 'This task was submitted for completion review. Inspect the uploaded proof files, voice memos, and comments below before deciding.'
                    : 'Submitted for completion review. Your Super Admin will verify the files and notes before moving this task to Completed.'}
                </p>
              </div>
            </div>
            {isAdminOrSuper && (
              <div className="flex items-center gap-3 shrink-0">
                <button
                  onClick={handleApproveTask}
                  disabled={isApproving}
                  className="btn btn-approve-solid flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-xl cursor-pointer"
                  style={{
                    backgroundColor: '#16a34a',
                    color: '#ffffff',
                    border: '1px solid #15803d',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(22, 163, 74, 0.45)',
                  }}
                >
                  <CheckCircle2 size={18} />
                  <span>{isApproving ? 'Approving...' : 'Approve Task'}</span>
                </button>
                <button
                  onClick={() => setIsRejectModalOpen(true)}
                  className="btn btn-reject-solid flex items-center gap-2 text-sm font-bold px-6 py-2.5 rounded-xl cursor-pointer"
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: '1px solid #b91c1c',
                    fontWeight: 700,
                    boxShadow: '0 4px 14px rgba(220, 38, 38, 0.45)',
                  }}
                >
                  <XCircle size={18} />
                  <span>Reject Task</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Row 2: Task Title & Badges */}
        <div className="space-y-3 pt-1">
          {/* Project Hierarchy Badge */}
          {task.project ? (
            <div 
              className="badge-project"
              onClick={() => navigate(`/projects/${task.project.id}`)}
              title="Click to view project details"
            >
              <FolderKanban size={14} className="badge-project-icon" />
              <span className="badge-project-label">Project:</span>
              <span className="badge-project-name">{task.project.name}</span>
              <ArrowRight size={13} className="badge-project-arrow" />
            </div>
          ) : (
            <div 
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-elevated text-xs text-muted border border-subtle w-fit"
              style={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
            >
              <FolderKanban size={13} className="shrink-0" />
              <span>No Project Linked</span>
            </div>
          )}

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary leading-tight">
            {task.title}
          </h1>

          <div className="flex items-center gap-5 sm:gap-7 flex-wrap pt-2">
            {/* Status Custom Dropdown */}
            <div className="relative inline-block text-left">
              <button
                type="button"
                onClick={() => {
                  setIsStatusDropdownOpen(!isStatusDropdownOpen);
                  setIsPriorityDropdownOpen(false);
                }}
                className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border focus:outline-none cursor-pointer"
                style={{
                  backgroundColor: statusConfig.bgColor,
                  color: statusConfig.textColor,
                  borderColor: statusConfig.borderColor,
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: statusConfig.dotColor }} />
                <span>{statusConfig.label}</span>
                <ChevronDown size={13} className={`transition-transform duration-200 opacity-80 ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {isStatusDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0"
                    style={{ zIndex: 998 }}
                    onClick={() => setIsStatusDropdownOpen(false)} 
                  />
                  <div 
                    className="absolute left-0 mt-2 w-52 rounded-xl p-1.5 shadow-2xl transition-all overflow-hidden"
                    style={{
                      backgroundColor: '#161720',
                      color: '#f3f4f6',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.95), 0 0 15px rgba(170, 59, 255, 0.08)',
                      zIndex: 999
                    }}
                  >
                    <div 
                      className="px-3 py-1.5 flex items-center gap-1.5 mb-1"
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
                    >
                      <Sparkles size={11} style={{ color: '#c084fc' }} />
                      <span className="text-[10px] font-extrabold tracking-wider uppercase" style={{ color: '#9ca3af' }}>
                        Task Status
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {statuses
                        .filter((s: any) => ['BACKLOG', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'].includes(s.name))
                        .map((s: any) => {
                        const cfg = STATUS_CONFIG[s.name] || {
                          label: s.name.replace('_', ' '),
                          dotColor: '#94a3b8',
                        };
                        const isSelected = task.statusId === s.id;
                        return (
                          <button
                            key={s.id}
                            onClick={() => {
                              setIsStatusDropdownOpen(false);
                              if (s.name === currentStatusKey) return;

                              if (s.name === 'IN_REVIEW') {
                                setIsSubmitReviewModalOpen(true);
                                return;
                              }

                              if (s.name === 'DONE' && !isAdminOrSuper) {
                                toast.error('Tasks cannot be moved directly to Completed. Submit for review for Super Admin approval.');
                                return;
                              }

                              if (currentStatusKey === 'IN_REVIEW' && !isAdminOrSuper) {
                                toast.error('Tasks in review can only be approved or rejected by a Super Admin.');
                                return;
                              }

                              updateStatusMutation.mutate(s.id);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center justify-between transition-all rounded-lg"
                            style={{
                              backgroundColor: isSelected ? 'rgba(170, 59, 255, 0.15)' : 'transparent',
                              color: isSelected ? '#ffffff' : '#d1d5db',
                              cursor: 'pointer'
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                                e.currentTarget.style.color = '#ffffff';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = '#d1d5db';
                              }
                            }}
                          >
                            <div className="flex items-center gap-2.5">
                              <span 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ 
                                  backgroundColor: cfg.dotColor,
                                  boxShadow: `0 0 6px ${cfg.dotColor}80` 
                                }} 
                              />
                              <span className="font-semibold text-xs">{cfg.label}</span>
                            </div>
                            {isSelected && <Check size={13} style={{ color: '#c084fc' }} className="shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Priority Custom Dropdown */}
            <div className="relative inline-block text-left">
              {(() => {
                const currentPriorityName = task.priority?.name || 'MEDIUM';
                const prioConfig = PRIORITY_CONFIG[currentPriorityName] || {
                  label: `${currentPriorityName} Priority`,
                  dotColor: '#3b82f6',
                  bgColor: 'rgba(59, 130, 246, 0.1)',
                  textColor: '#3b82f6',
                  borderColor: 'rgba(59, 130, 246, 0.2)'
                };
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsPriorityDropdownOpen(!isPriorityDropdownOpen);
                        setIsStatusDropdownOpen(false);
                      }}
                      className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm border focus:outline-none cursor-pointer"
                      style={{
                        backgroundColor: prioConfig.bgColor,
                        color: prioConfig.textColor,
                        borderColor: prioConfig.borderColor,
                      }}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: prioConfig.dotColor }} />
                      <span>{prioConfig.label}</span>
                      <ChevronDown size={13} className={`transition-transform duration-200 opacity-80 ${isPriorityDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isPriorityDropdownOpen && (
                      <>
                        <div 
                          className="fixed inset-0"
                          style={{ zIndex: 998 }}
                          onClick={() => setIsPriorityDropdownOpen(false)} 
                        />
                        <div 
                          className="absolute left-0 mt-2 w-52 rounded-xl p-1.5 shadow-2xl transition-all overflow-hidden"
                          style={{
                            backgroundColor: '#161720',
                            color: '#f3f4f6',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            boxShadow: '0 20px 40px -5px rgba(0, 0, 0, 0.95), 0 0 15px rgba(239, 68, 68, 0.08)',
                            zIndex: 999
                          }}
                        >
                          <div 
                            className="px-3 py-1.5 flex items-center gap-1.5 mb-1"
                            style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}
                          >
                            <AlertTriangle size={11} style={{ color: '#f87171' }} />
                            <span className="text-[10px] font-extrabold tracking-wider uppercase" style={{ color: '#9ca3af' }}>
                              Priority Level
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {priorities.map((p: any) => {
                              const cfg = PRIORITY_CONFIG[p.name] || {
                                label: `${p.name} Priority`,
                                dotColor: '#94a3b8',
                              };
                              const isSelected = task.priorityId === p.id;
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => {
                                    updatePriorityMutation.mutate(p.id);
                                    setIsPriorityDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs font-semibold flex items-center justify-between transition-all rounded-lg"
                                  style={{
                                    backgroundColor: isSelected ? 'rgba(170, 59, 255, 0.15)' : 'transparent',
                                    color: isSelected ? '#ffffff' : '#d1d5db',
                                    cursor: 'pointer'
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                                      e.currentTarget.style.color = '#ffffff';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                      e.currentTarget.style.color = '#d1d5db';
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <span 
                                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                                      style={{ 
                                        backgroundColor: cfg.dotColor,
                                        boxShadow: `0 0 6px ${cfg.dotColor}80` 
                                      }} 
                                    />
                                    <span className="font-semibold text-xs">{cfg.label}</span>
                                  </div>
                                  {isSelected && <Check size={13} style={{ color: '#c084fc' }} className="shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            {/* Overdue Warning */}
            {isOverdue && (
              <span className="px-4 py-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-bold flex items-center gap-2 shadow-xs">
                <AlertTriangle size={14} className="text-rose-400 shrink-0" />
                <span>Overdue Task</span>
              </span>
            )}

            {/* Linked Ticket Badge */}
            {task.ticket && (
              <button
                className="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold flex items-center gap-2 hover:bg-amber-500/20 transition cursor-pointer shadow-xs"
                onClick={() => navigate(`/tickets/${task.ticket.id}`)}
                title="View Originating Ticket"
              >
                <Ticket size={14} className="shrink-0" />
                <span>Ticket #{task.ticket.ticketNumber || task.ticket.ticketId}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Grid Layout: Main Content Tabs (2 Cols) & Sidebar Metadata (1 Col) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Overview Section */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-surface border border-subtle text-xs font-bold text-primary shadow-xs">
              <FileText size={14} className="text-accent" />
              <span>Overview</span>
            </div>
          </div>

          <div className="space-y-6">
            {/* Task Description */}
            <div className="card p-5 bg-surface border border-subtle shadow-sm space-y-3">
              <div className="flex items-center gap-2 font-bold text-xs text-muted uppercase tracking-wider">
                <FileText size={14} className="text-accent" /> Description
              </div>
              <div className="text-sm text-primary leading-relaxed whitespace-pre-wrap pl-1">
                {task.description || (
                  <span className="text-muted italic">No detailed description provided for this deliverable.</span>
                )}
              </div>
            </div>

            {/* Review Submission Comment & Notes (Directly displayed on the first page) */}
            {latestReviewComment && (
              <div className="card p-5 bg-amber-500/5 border border-amber-500/30 shadow-sm space-y-3 rounded-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs shrink-0 border border-amber-500/30">
                      <ShieldCheck size={16} />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                        <span>User Review Submission Note</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">
                          By {latestReviewComment.user?.name || 'Assignee'}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted">
                        {format(new Date(latestReviewComment.createdAt), 'MMM d, yyyy • h:mm a')}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-primary leading-relaxed whitespace-pre-wrap bg-surface/90 p-4 rounded-xl border border-subtle">
                  {latestReviewComment.content.replace('**[SUBMITTED FOR REVIEW]**', '').trim()}
                </div>
              </div>
            )}

            {/* Uploaded Verification Files & Attachments */}
            {task.attachments && task.attachments.length > 0 && (
              <div className="card p-5 bg-surface border border-subtle shadow-sm space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-xs text-muted uppercase tracking-wider">
                    <Paperclip size={14} className="text-amber-400" />
                    <span>Review Verification Files & Attachments ({task.attachments.length})</span>
                  </div>
                  <span className="text-[11px] text-muted">Inspect uploaded proof</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {task.attachments.map((att: any) => {
                    const isImg = att.mimeType?.startsWith('image/');
                    const isAudio = att.mimeType?.startsWith('audio/');
                    const isVid = att.mimeType?.startsWith('video/');

                    return (
                      <div 
                        key={att.id}
                        className="p-3 rounded-xl bg-surface-hover/80 border border-subtle flex flex-col gap-2 transition-all hover:border-amber-500/30"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 truncate">
                            {isImg && <ImageIcon size={16} className="text-blue-400 shrink-0" />}
                            {isAudio && <Music size={16} className="text-purple-400 shrink-0" />}
                            {isVid && <Video size={16} className="text-amber-400 shrink-0" />}
                            {!isImg && !isAudio && !isVid && <FileText size={16} className="text-emerald-400 shrink-0" />}
                            <span className="text-xs font-medium text-primary truncate max-w-[200px]" title={att.originalName}>
                              {att.originalName}
                            </span>
                          </div>
                          <a
                            href={att.url}
                            target="_blank"
                            rel="noreferrer"
                            download
                            className="text-muted hover:text-primary p-1 rounded hover:bg-surface transition-colors shrink-0"
                            title="Download file"
                          >
                            <Download size={14} />
                          </a>
                        </div>

                        {/* Image preview */}
                        {isImg && (
                          <div className="mt-1 rounded-lg overflow-hidden border border-subtle max-h-48 bg-black/20 flex items-center justify-center">
                            <a href={att.url} target="_blank" rel="noreferrer">
                              <img src={att.url} alt={att.originalName} className="object-cover w-full h-auto max-h-48 hover:opacity-90 transition-opacity" />
                            </a>
                          </div>
                        )}

                        {/* Audio player preview */}
                        {isAudio && (
                          <div className="mt-1 p-2 rounded-lg bg-black/20 border border-subtle">
                            <audio controls className="w-full h-8" preload="metadata">
                              <source src={att.url} type={att.mimeType} />
                              Your browser does not support audio element.
                            </audio>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[10px] text-muted font-mono pt-0.5">
                          <span>{(att.size / 1024).toFixed(1)} KB</span>
                          <span>{att.createdAt ? format(new Date(att.createdAt), 'MMM d, h:mm a') : ''}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Comments & Discussion Directly on the Overview Page */}
            <div className="card p-5 bg-surface border border-subtle shadow-sm space-y-4 rounded-2xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-bold text-xs text-muted uppercase tracking-wider">
                  <MessageSquare size={14} className="text-accent" />
                  <span>Comments & Discussion ({comments.length})</span>
                </div>
                <span className="text-[11px] text-muted">Full activity & notes</span>
              </div>

              {/* Inline Comment Input */}
              <div className="space-y-2 pt-1">
                <textarea
                  className="input text-xs w-full min-h-[75px] p-3 resize-none rounded-xl"
                  style={{
                    backgroundColor: '#1f2029',
                    color: '#f3f4f6',
                    border: '1px solid rgba(255, 255, 255, 0.12)'
                  }}
                  placeholder="Add a progress update, ask a question, or leave feedback directly on this task..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted">AI engine automatically scans comments for blockers</span>
                  <button
                    className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm text-xs font-semibold px-3.5 py-1.5"
                    disabled={!newComment.trim() || postCommentMutation.isPending}
                    onClick={() => postCommentMutation.mutate(newComment)}
                  >
                    <Send size={12} /> Post Comment
                  </button>
                </div>
              </div>

              {/* Comments Feed on First Page */}
              <div className="space-y-3 pt-1">
                {comments.map((comment: any) => (
                  <div key={comment.id} className="p-3.5 rounded-xl bg-surface-hover/70 border border-subtle space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 border border-subtle text-white font-bold text-[11px] flex items-center justify-center shadow-xs shrink-0">
                          {comment.user?.avatar ? (
                            <img src={comment.user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                          ) : (
                            comment.user?.name?.charAt(0).toUpperCase() || '?'
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-primary">{comment.user?.name}</div>
                          <div className="text-[10px] text-muted">{format(new Date(comment.createdAt), 'MMM d, yyyy • h:mm a')}</div>
                        </div>
                      </div>

                      {comment.aiFlag === 'BLOCKER' && (
                        <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 text-[10px] font-bold tracking-wider">
                          BLOCKER DETECTED
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-primary leading-relaxed whitespace-pre-wrap pl-9">
                      {comment.content}
                    </div>
                  </div>
                ))}

                {comments.length === 0 && (
                  <div className="text-center py-6 text-muted text-xs">
                    No comments recorded yet. Leave a note above.
                  </div>
                )}
              </div>
            </div>

            {/* AI Insights Card */}
            {task.aiRisk && (
              <div className="card p-5 bg-gradient-to-br from-surface via-surface to-purple-500/5 border border-purple-500/20 shadow-sm space-y-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400">
                    <Sparkles size={16} />
                  </div>
                  <h4 className="text-xs font-bold text-primary uppercase tracking-wider">AI Cycle Time & Risk Analysis</h4>
                </div>
                <div className="text-xs text-secondary space-y-1.5 pl-8">
                  <div>Estimated Cycle Completion: <strong className="text-primary font-mono">{task.aiRisk.estimatedCompletionDays || 2} days</strong></div>
                  {task.aiRisk.riskFactors?.length > 0 && (
                    <div className="text-rose-400 font-medium">
                      Risk Factor: {task.aiRisk.riskFactors.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar Metadata (1/3) */}
        <div className="space-y-5">
          
          {/* Card 1: Project & Customer Context */}
          <div className="card p-5 bg-surface border border-subtle shadow-sm space-y-3">
            <div className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 border-b border-subtle pb-2.5">
              <FolderKanban size={15} style={{ color: '#60a5fa' }} /> Project & Context
            </div>

            {task.project ? (
              <div 
                className="p-3.5 rounded-xl cursor-pointer transition group"
                style={{
                  background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.08) 0%, rgba(79, 70, 229, 0.06) 100%)',
                  border: '1px solid rgba(96, 165, 250, 0.25)',
                }}
                onClick={() => navigate(`/projects/${task.project.id}`)}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1" style={{ color: '#93c5fd' }}>
                    <FolderKanban size={12} style={{ color: '#60a5fa' }} /> Project
                  </span>
                  <span className="text-[10px] text-muted">Click to view</span>
                </div>
                <div className="text-sm font-bold text-primary group-hover:text-blue-400 transition-colors">
                  {task.project.name}
                </div>
                <div className="text-[11px] text-muted mt-1 flex items-center gap-1 group-hover:text-secondary transition-colors">
                  <span>Open master project dashboard & team</span>
                  <ArrowRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted italic p-2 rounded-lg bg-elevated/50">No project linked</div>
            )}

            {task.customer && (
              <div 
                className="p-3 rounded-xl bg-elevated/50 border border-subtle cursor-pointer hover:border-emerald-500/40 transition group"
                onClick={() => navigate(`/customers/${task.customer.id}`)}
              >
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Customer Account</div>
                <div className="text-sm font-bold text-primary group-hover:text-emerald-400 transition-colors">
                  {task.customer.name}
                </div>
                <div className="text-[11px] text-muted font-mono mt-0.5">{task.customer.code} • Customer 360</div>
              </div>
            )}
          </div>

          {/* Card 2: People & Ownership */}
          <div className="card p-5 bg-surface border border-subtle shadow-sm space-y-4">
            <div className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 border-b border-subtle pb-2.5">
              <Users size={15} className="text-amber-400" /> People & Ownership
            </div>

            {/* Assignee */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-muted font-semibold uppercase tracking-wider block">Assignee</span>
              {task.assignee ? (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-elevated/50 border border-subtle">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-600 via-purple-600 to-blue-600 border border-subtle text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                    {task.assignee.avatar ? (
                      <img src={task.assignee.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      task.assignee.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-primary">{task.assignee.name}</div>
                    <div className="text-[11px] text-muted truncate">{task.assignee.email}</div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-elevated/40 border border-subtle text-xs text-muted italic">
                  Unassigned
                </div>
              )}
            </div>

            {/* Reporter */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[11px] text-muted font-semibold uppercase tracking-wider block">Reporter</span>
              {task.reporter ? (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-elevated/50 border border-subtle">
                  <div className="w-8 h-8 rounded-full bg-slate-700 border border-subtle text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0">
                    {task.reporter.avatar ? (
                      <img src={task.reporter.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      task.reporter.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="truncate">
                    <div className="text-xs font-bold text-primary">{task.reporter.name}</div>
                    <div className="text-[10px] text-muted truncate">{task.reporter.email}</div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-muted italic pl-1">System Generated</div>
              )}
            </div>
          </div>

          {/* Card 3: Planning & Schedule Metrics */}
          <div className="card p-5 bg-surface border border-subtle shadow-sm space-y-3.5">
            <div className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2 border-b border-subtle pb-2.5">
              <Clock size={15} className="text-emerald-400" /> Planning & Effort Progress
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-muted">Effort Logged</span>
                <span className="font-mono text-accent font-bold">{totalLoggedHours}h / {estimatedHours}h</span>
              </div>
              <div className="w-full bg-elevated h-2 rounded-full overflow-hidden border border-subtle">
                <div 
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${effortPct}%` }}
                />
              </div>
            </div>

            {/* Schedule Details */}
            <div className="space-y-2 pt-2 border-t border-subtle text-xs">
              <div className="flex items-center justify-between py-1">
                <span className="text-muted flex items-center gap-1.5">
                  <Calendar size={13} className="text-muted" /> Due Date
                </span>
                <span className={`font-semibold ${isOverdue ? 'text-rose-400' : 'text-primary'}`}>
                  {task.dueDate ? format(new Date(task.dueDate), 'MMM d, yyyy') : 'No due date'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1">
                <span className="text-muted">Created Date</span>
                <span className="font-medium text-secondary">
                  {format(new Date(task.createdAt), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Log Work Modal */}
      {isLogWorkModalOpen && (
        <div className="modal-overlay z-50" onClick={() => setIsLogWorkModalOpen(false)}>
          <div className="modal-content max-w-md p-6 bg-surface border border-subtle shadow-2xl rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-subtle pb-3">
              <h3 className="font-bold text-base text-primary flex items-center gap-2">
                <Clock size={18} className="text-accent" /> Log Work Effort ({task.taskId})
              </h3>
              <button onClick={() => setIsLogWorkModalOpen(false)} className="text-muted hover:text-primary">
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-muted block mb-1">Hours Logged *</label>
                <input 
                  type="number" 
                  step="0.5"
                  className="input text-xs w-full py-2 bg-elevated/50 border-subtle font-mono"
                  placeholder="e.g. 2.5"
                  value={logHours}
                  onChange={e => setLogHours(e.target.value)}
                />
              </div>

              <div>
                <label className="font-bold text-muted block mb-1">Work Summary</label>
                <textarea 
                  className="input text-xs w-full min-h-[80px] p-2.5 bg-elevated/50 border-subtle"
                  placeholder="Describe technical progress or resolution..."
                  value={logDescription}
                  onChange={e => setLogDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsLogWorkModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary btn-sm"
                  disabled={!logHours || logWorkMutation.isPending}
                  onClick={() => logWorkMutation.mutate({ hours: parseFloat(logHours), description: logDescription })}
                >
                  Save Log
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approval Sign-off Modal */}
      {isApprovalModalOpen && (
        <div className="modal-overlay z-50" onClick={() => setIsApprovalModalOpen(false)}>
          <div className="modal-content max-w-md p-6 bg-surface border border-subtle shadow-2xl rounded-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 border-b border-subtle pb-3">
              <h3 className="font-bold text-base text-primary flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-400" /> Request Sign-off Approval
              </h3>
              <button onClick={() => setIsApprovalModalOpen(false)} className="text-muted hover:text-primary">
                <X size={16} />
              </button>
            </div>
            
            <div className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-muted block mb-1">Approval Title</label>
                <input 
                  type="text" 
                  className="input text-xs w-full py-2 bg-elevated/50 border-subtle"
                  value={approvalTitle}
                  onChange={e => setApprovalTitle(e.target.value)}
                />
              </div>

              <div>
                <label className="font-bold text-muted block mb-1">Reason / Notes</label>
                <textarea 
                  className="input text-xs w-full min-h-[80px] p-2.5 bg-elevated/50 border-subtle"
                  placeholder="Provide context for sign-off review..."
                  value={approvalDescription}
                  onChange={e => setApprovalDescription(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button 
                  className="btn btn-secondary btn-sm"
                  onClick={() => setIsApprovalModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary btn-sm"
                  disabled={!approvalTitle || requestApprovalMutation.isPending}
                  onClick={() => requestApprovalMutation.mutate({ 
                    title: approvalTitle, 
                    description: approvalDescription,
                    type: 'TASK_SIGN_OFF'
                  })}
                >
                  Submit Request
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit For Review Modal */}
      <SubmitForReviewModal
        isOpen={isSubmitReviewModalOpen}
        task={{ id: task.id, taskId: task.taskId, title: task.title }}
        onClose={() => setIsSubmitReviewModalOpen(false)}
      />

      {/* Reject Task Modal */}
      {isRejectModalOpen && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isRejecting) setIsRejectModalOpen(false);
          }}
        >
          <div 
            className="bg-surface border border-subtle rounded-2xl p-6 shadow-2xl max-w-md w-full space-y-4 animate-in fade-in zoom-in-95 duration-150"
            style={{ backgroundColor: 'var(--bg-surface, #18181b)' }}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-primary flex items-center gap-2">
                <XCircle className="text-rose-400" size={18} />
                Reject Task Review
              </h3>
              <button 
                onClick={() => setIsRejectModalOpen(false)} 
                disabled={isRejecting}
                className="text-muted hover:text-primary p-1 rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
            
            <p className="text-xs text-muted leading-relaxed">
              Please specify the reason for rejection. The task assignee will be notified immediately and the task status will be returned to <span className="text-amber-400 font-semibold">IN PROGRESS</span>.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-primary">
                Rejection Reason / Feedback <span className="text-rose-400">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="State why the review was rejected (e.g., audio proof missing details, bug reproducible)..."
                className="input text-xs resize-none rounded-xl"
                style={{
                  backgroundColor: '#1f2029',
                  color: '#f3f4f6',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  minHeight: '80px'
                }}
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button 
                type="button"
                onClick={() => setIsRejectModalOpen(false)} 
                disabled={isRejecting}
                className="px-3.5 py-1.5 text-xs text-muted hover:text-primary rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectTask}
                disabled={isRejecting || !rejectionReason.trim()}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all shadow-md shadow-rose-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
