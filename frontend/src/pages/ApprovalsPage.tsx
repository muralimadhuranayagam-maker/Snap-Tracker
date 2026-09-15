import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Hourglass, 
  ShieldCheck, 
  CheckSquare,
  UserCheck
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

export function ApprovalsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);

  const [tabFilter, setTabFilter] = useState<'pending' | 'approved' | 'rejected' | 'my_requests' | 'all'>('pending');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // New Request Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('TASK_COMPLETION');
  const [taskId, setTaskId] = useState('');
  const [approverId, setApproverId] = useState('');

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['approvals'],
    queryFn: () => api.get('/approvals').then(r => r.data),
    refetchInterval: 15_000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-for-approval'],
    queryFn: () => api.get('/tasks').then(r => r.data?.tasks || r.data?.data || []),
    enabled: isRequestModalOpen,
  });

  // Query only Super Admins and Admins for the Approver dropdown
  const { data: approvers = [], isLoading: isLoadingApprovers } = useQuery({
    queryKey: ['approvers-for-approval'],
    queryFn: () => api.get('/approvals/approvers').then(r => r.data),
    enabled: isRequestModalOpen,
  });

  // Decision Mutation (Approve / Reject)
  const decisionMutation = useMutation({
    mutationFn: (data: { id: string; decision: 'APPROVED' | 'REJECTED'; notes?: string }) =>
      api.patch(`/approvals/${data.id}/decision`, { decision: data.decision, notes: data.notes }),
    onSuccess: (_, variables) => {
      toast.success(`Request ${variables.decision.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      queryClient.invalidateQueries({ queryKey: ['mywork'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Decision failed');
    }
  });

  // Create Approval Request
  const createApprovalMutation = useMutation({
    mutationFn: (data: any) => api.post('/approvals', data),
    onSuccess: () => {
      toast.success('Approval request submitted');
      queryClient.invalidateQueries({ queryKey: ['approvals'] });
      setIsRequestModalOpen(false);
      setTitle('');
      setDescription('');
      setTaskId('');
      setApproverId('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to submit approval request');
    }
  });

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!approverId) {
      toast.error('Please select an approver (Admin or Super Admin)');
      return;
    }
    createApprovalMutation.mutate({
      title,
      description,
      type,
      taskId: taskId || undefined,
      approverId,
    });
  };

  const pendingCount = approvals.filter((a: any) => a.status === 'PENDING').length;
  const approvedCount = approvals.filter((a: any) => a.status === 'APPROVED').length;
  const rejectedCount = approvals.filter((a: any) => a.status === 'REJECTED').length;
  const myRequestsCount = approvals.filter((a: any) => a.requesterId === user?.id).length;

  const displayedApprovals = approvals.filter((a: any) => {
    if (tabFilter === 'pending') return a.status === 'PENDING';
    if (tabFilter === 'approved') return a.status === 'APPROVED';
    if (tabFilter === 'rejected') return a.status === 'REJECTED';
    if (tabFilter === 'my_requests') return a.requesterId === user?.id;
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Approval Center</h1>
            <span className="badge bg-elevated font-mono text-xs text-muted">{approvals.length} total</span>
            {pendingCount > 0 && (
              <span className="badge bg-amber-subtle text-amber border border-amber/30 text-xs flex items-center gap-1 font-semibold">
                <Hourglass size={12} /> {pendingCount} Pending Review
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Operational approval workflows for critical milestone sign-offs, deployments, and budget actions.
          </p>
        </div>

        <button 
          className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
          onClick={() => {
            setIsRequestModalOpen(true);
            setApproverId('');
          }}
        >
          <Plus size={14} />
          <span>Request Approval</span>
        </button>
      </div>

      {/* Approval Inbox Tabs */}
      <div className="flex items-center gap-1.5 border-b border-subtle pb-2 overflow-x-auto">
        <button
          className={`btn btn-sm text-xs ${tabFilter === 'pending' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTabFilter('pending')}
        >
          Pending ({pendingCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${tabFilter === 'approved' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTabFilter('approved')}
        >
          Approved ({approvedCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${tabFilter === 'rejected' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTabFilter('rejected')}
        >
          Rejected ({rejectedCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${tabFilter === 'my_requests' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTabFilter('my_requests')}
        >
          My Requests ({myRequestsCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${tabFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setTabFilter('all')}
        >
          All ({approvals.length})
        </button>
      </div>

      {/* Approvals Table */}
      <div className="card p-0 overflow-hidden bg-surface border-subtle">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="spinner spinner-md mx-auto" />
            <div className="text-xs text-muted mt-2">Loading approvals...</div>
          </div>
        ) : displayedApprovals.length === 0 ? (
          <div className="py-16 text-center text-muted text-xs">
            <ShieldCheck size={28} className="mx-auto mb-2 opacity-40" />
            No approval requests found in this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                <tr>
                  <th className="p-3">Title</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Linked Task</th>
                  <th className="p-3">Requester</th>
                  <th className="p-3">Assigned Approver</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Requested</th>
                  {isAdmin && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {displayedApprovals.map((a: any) => {
                  const canDecide = isAdmin && (
                    user?.role === 'SUPER_ADMIN' || 
                    a.approverId === user?.id || 
                    !a.approverId
                  );

                  return (
                    <tr key={a.id} className="hover:bg-elevated/40 transition">
                      <td className="p-3">
                        <div className="font-semibold text-primary">{a.title}</div>
                        {a.description && <div className="text-[11px] text-muted truncate max-w-xs">{a.description}</div>}
                      </td>
                      <td className="p-3 text-secondary font-mono text-[11px]">
                        {a.type.replace('_', ' ')}
                      </td>
                      <td className="p-3">
                        {a.task ? (
                          <div 
                            className="flex items-center gap-1 font-mono text-accent hover:underline cursor-pointer"
                            onClick={() => navigate(`/tasks/${a.task.id}`)}
                          >
                            <CheckSquare size={12} />
                            <span>{a.task.taskId}</span>
                          </div>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="p-3 text-secondary">{a.requester?.name}</td>
                      <td className="p-3">
                        {a.approver ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center text-[10px] font-bold shrink-0">
                              {a.approver.name?.charAt(0)}
                            </div>
                            <span className="font-medium text-foreground">{a.approver.name}</span>
                          </div>
                        ) : (
                          <span className="text-muted italic">Any Admin</span>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`badge text-[10px] font-bold ${
                          a.status === 'APPROVED' ? 'bg-green-subtle text-green' :
                          a.status === 'REJECTED' ? 'bg-red-subtle text-red' :
                          'bg-amber-subtle text-amber'
                        }`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="p-3 text-secondary">
                        {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-right">
                          {a.status === 'PENDING' ? (
                            canDecide ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button 
                                  className="btn btn-primary btn-xs flex items-center gap-1 text-green"
                                  onClick={() => decisionMutation.mutate({ id: a.id, decision: 'APPROVED' })}
                                  disabled={decisionMutation.isPending}
                                >
                                  <CheckCircle2 size={12} />
                                  <span>Approve</span>
                                </button>
                                <button 
                                  className="btn btn-secondary btn-xs flex items-center gap-1 text-red"
                                  onClick={() => decisionMutation.mutate({ id: a.id, decision: 'REJECTED' })}
                                  disabled={decisionMutation.isPending}
                                >
                                  <XCircle size={12} />
                                  <span>Reject</span>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted italic">
                                Assigned to {a.approver?.name || 'another Admin'}
                              </span>
                            )
                          ) : (
                            <span className="text-[11px] text-muted">
                              Decided by {a.approver?.name || 'Admin'}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Approval Modal with createPortal for seamless full-screen backdrop blur */}
      {isRequestModalOpen && createPortal(
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
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
            overflowY: 'auto'
          }}
          onClick={() => setIsRequestModalOpen(false)}
        >
          <div 
            className="bg-surface border border-subtle rounded-2xl shadow-2xl w-full my-auto overflow-hidden animate-in zoom-in-95 duration-200" 
            style={{ 
              backgroundColor: 'var(--bg-surface)',
              maxWidth: '560px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-subtle flex items-center justify-between bg-surface-hover">
              <h3 className="font-semibold text-base text-primary flex items-center gap-2">
                <Hourglass size={16} className="text-accent" />
                Submit Approval Request
              </h3>
              <button className="btn-icon btn-ghost" onClick={() => setIsRequestModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Request Title *</label>
                <input 
                  type="text" 
                  className="input w-full text-xs" 
                  placeholder="e.g. Sign-off for ABC Corp Production Deployment"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Select Member (Super Admin and Admin only) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-secondary flex items-center gap-1.5">
                    <UserCheck size={13} className="text-indigo-400" />
                    Send Request To (Approver) *
                  </label>
                  <span className="text-[10px] text-muted font-normal">
                    Admins & Super Admins only
                  </span>
                </div>
                <select
                  className="input w-full text-xs"
                  value={approverId}
                  onChange={e => setApproverId(e.target.value)}
                  required
                >
                  <option value="">Select an Admin or Super Admin...</option>
                  {approvers.map((admin: any) => (
                    <option key={admin.id} value={admin.id}>
                      {admin.name} ({admin.role?.name === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}) {admin.title ? `— ${admin.title}` : ''}
                    </option>
                  ))}
                </select>
                {isLoadingApprovers && (
                  <div className="text-[10px] text-muted mt-1">Loading available approvers...</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1.5">Approval Type</label>
                  <select 
                    className="input w-full text-xs"
                    value={type}
                    onChange={e => setType(e.target.value)}
                  >
                    <option value="TASK_COMPLETION">TASK_COMPLETION</option>
                    <option value="DEPLOYMENT">DEPLOYMENT</option>
                    <option value="CAMPAIGN_LAUNCH">CAMPAIGN_LAUNCH</option>
                    <option value="ACCESS_REQUEST">ACCESS_REQUEST</option>
                    <option value="BUDGET">BUDGET</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-secondary block mb-1.5">Link Task (Optional)</label>
                  <select 
                    className="input w-full text-xs"
                    value={taskId}
                    onChange={e => setTaskId(e.target.value)}
                  >
                    <option value="">None</option>
                    {tasks.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.taskId} - {t.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Rationale & Notes</label>
                <textarea 
                  rows={3}
                  className="input w-full text-xs" 
                  placeholder="Provide verification details, PR links, test coverage, or business reasons..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" className="btn btn-ghost text-xs" onClick={() => setIsRequestModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary text-xs"
                  disabled={createApprovalMutation.isPending}
                >
                  {createApprovalMutation.isPending ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
