import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  CheckCircle2, 
  XCircle, 
  Plus, 
  Hourglass, 
  ShieldCheck, 
  CheckSquare 
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
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to submit approval request');
    }
  });

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    createApprovalMutation.mutate({
      title,
      description,
      type,
      taskId: taskId || undefined,
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
          onClick={() => setIsRequestModalOpen(true)}
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
                  <th className="p-3">Status</th>
                  <th className="p-3">Requested</th>
                  {isAdmin && <th className="p-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {displayedApprovals.map((a: any) => (
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
                          <span className="text-[11px] text-muted">
                            Decided by {a.approver?.name || 'Admin'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Request Approval Modal */}
      {isRequestModalOpen && (
        <div className="modal-overlay" onClick={() => setIsRequestModalOpen(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="font-semibold text-base text-primary flex items-center gap-2">
                <Hourglass size={16} className="text-accent" />
                Submit Approval Request
              </h3>
              <button className="btn-icon btn-ghost" onClick={() => setIsRequestModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleRequestSubmit} className="mt-4 space-y-4">
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
        </div>
      )}
    </div>
  );
}
