import React, { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Sparkles, 
  CheckCircle2, 
  Send, 
  CheckSquare, 
  History,
  MessageSquare,
  Building,
  Paperclip,
  Upload,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { format, formatDistanceToNow } from 'date-fns';

export function TicketDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [commentText, setCommentText] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('8');
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    setIsUploadingAttachment(true);
    try {
      await api.post(`/upload/ticket/${id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Screenshot attached successfully');
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to upload screenshot');
    } finally {
      setIsUploadingAttachment(false);
      e.target.value = '';
    }
  };

  const { data: ticket, isLoading } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => api.get(`/tickets/${id}`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 10_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get('/projects').then(r => r.data),
  });

  const isAdminOrAbove = user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);

  // Post Comment Mutation
  const postCommentMutation = useMutation({
    mutationFn: (data: { content: string; isInternal: boolean }) =>
      api.post(`/tickets/${id}/comments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      setCommentText('');
      toast.success('Comment posted');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to post comment');
    }
  });

  // Convert Ticket to Task Mutation
  const convertToTaskMutation = useMutation({
    mutationFn: (data: any) => api.post(`/tickets/${id}/convert-to-task`, data),
    onSuccess: (res: any) => {
      toast.success(`Task ${res.data.task.taskId} created and linked!`);
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setIsConvertModalOpen(false);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to convert ticket to task');
    }
  });

  // Status Change Mutation
  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) => api.patch(`/tickets/${id}`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', id] });
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      toast.success('Ticket status updated');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="empty-state py-16 text-center">
        <h3 className="text-lg font-bold text-primary">Ticket not found</h3>
        <button className="btn btn-primary btn-sm mt-3" onClick={() => navigate('/tickets')}>
          Back to Tickets
        </button>
      </div>
    );
  }

  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    postCommentMutation.mutate({ content: commentText, isInternal });
  };

  const handleConvertSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    convertToTaskMutation.mutate({
      projectId: selectedProject || undefined,
      assigneeId: selectedAssignee || undefined,
      estimatedHours: parseFloat(estimatedHours) || 8,
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button 
          className="btn btn-ghost btn-sm flex items-center gap-1.5 text-secondary hover:text-primary"
          onClick={() => navigate('/tickets')}
        >
          <ArrowLeft size={14} /> Back to Tickets
        </button>

        <div className="flex items-center gap-2">
          {isAdminOrAbove && (
            <button 
              className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
              onClick={() => setIsConvertModalOpen(true)}
            >
              <CheckSquare size={14} />
              <span>Convert to Task</span>
            </button>
          )}

          {isAdminOrAbove && ticket.status !== 'RESOLVED' && (
            <button 
              className="btn btn-secondary btn-sm flex items-center gap-1.5 text-green border-green/30"
              onClick={() => updateStatusMutation.mutate('RESOLVED')}
            >
              <CheckCircle2 size={14} />
              <span>Mark Resolved</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Details & Comments */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Ticket Info Card */}
          <div className="card p-5 bg-surface border-subtle space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold text-amber px-2 py-0.5 rounded bg-amber-subtle border border-amber/30">
                {ticket.ticketId}
              </span>
              <span className="badge bg-elevated text-xs">{ticket.category}</span>
              <span className="badge bg-elevated text-xs">{ticket.department?.name || 'General'}</span>
              <span className={`badge text-xs font-semibold ${
                ticket.priority === 'CRITICAL' ? 'bg-red-subtle text-red border border-red/30' :
                ticket.priority === 'HIGH' ? 'bg-amber-subtle text-amber border border-amber/30' :
                'bg-elevated'
              }`}>
                {ticket.priority} Priority
              </span>
              <span className={`badge text-xs ${
                ticket.status === 'RESOLVED' ? 'bg-green-subtle text-green' : 'bg-blue-subtle text-blue'
              }`}>
                {ticket.status}
              </span>
            </div>

            <h1 className="text-xl font-bold text-primary">{ticket.title}</h1>

            <div className="text-sm text-secondary leading-relaxed whitespace-pre-wrap bg-elevated/40 p-4 rounded-lg border border-subtle">
              {ticket.description}
            </div>

            {/* AI Triage Card */}
            {ticket.aiSummary && (
              <div className="p-3.5 rounded-lg bg-purple-subtle/20 border border-purple/30 flex items-start gap-3">
                <Sparkles size={16} className="text-purple mt-0.5 shrink-0" />
                <div className="text-xs">
                  <div className="font-semibold text-primary mb-0.5">AI Triage Intelligence</div>
                  <div className="text-secondary leading-relaxed">{ticket.aiSummary}</div>
                </div>
              </div>
            )}
          </div>

          {/* Linked Tasks Section */}
          <div className="card p-5 bg-surface border-subtle">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <CheckSquare size={16} className="text-accent" />
                Linked Execution Tasks ({ticket.linkedTasks?.length || 0})
              </h3>
              {isAdminOrAbove && (
                <button 
                  className="btn btn-ghost btn-xs text-accent"
                  onClick={() => setIsConvertModalOpen(true)}
                >
                  + Link Another Task
                </button>
              )}
            </div>

            {ticket.linkedTasks?.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted border border-dashed border-subtle rounded-lg">
                No tasks spawned yet. Admin can convert this ticket into an actionable task.
              </div>
            ) : (
              <div className="space-y-2">
                {ticket.linkedTasks.map((lt: any) => (
                  <div 
                    key={lt.id}
                    className="p-3 rounded-lg bg-elevated border border-subtle flex items-center justify-between hover:border-accent/40 transition cursor-pointer"
                    onClick={() => navigate(`/tasks/${lt.id}`)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-accent">{lt.taskId}</span>
                        <span className="text-xs font-medium text-primary">{lt.title}</span>
                      </div>
                      <div className="text-[11px] text-muted mt-1">
                        Assignee: {lt.assignee?.name || 'Unassigned'}
                      </div>
                    </div>
                    <span className="badge text-[10px] bg-surface border border-subtle">
                      {lt.status?.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Screenshots & Attachments Section */}
          <div className="card p-5 bg-surface border-subtle">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Paperclip size={16} className="text-accent" />
                Screenshots & Attachments ({ticket.attachments?.length || 0})
              </h3>
              <div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={handleAttachmentUpload} 
                />
                <button 
                  className="btn btn-secondary btn-xs flex items-center gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAttachment}
                >
                  <Upload size={12} />
                  <span>{isUploadingAttachment ? 'Uploading...' : 'Add Screenshot'}</span>
                </button>
              </div>
            </div>

            {ticket.attachments?.length === 0 ? (
              <div className="p-5 text-center text-xs text-muted border border-dashed border-subtle rounded-lg">
                No screenshots or files attached to this ticket yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {ticket.attachments.map((att: any) => (
                  <div key={att.id} className="p-2.5 rounded-lg bg-elevated border border-subtle flex flex-col gap-2 group">
                    {att.mimeType?.startsWith('image/') ? (
                      <a href={att.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded border border-subtle bg-surface">
                        <img 
                          src={att.url} 
                          alt={att.originalName} 
                          className="w-full h-32 object-cover hover:scale-105 transition duration-200" 
                        />
                      </a>
                    ) : (
                      <div className="w-full h-24 rounded bg-surface border border-subtle flex items-center justify-center text-muted">
                        <Paperclip size={24} />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="font-medium text-primary truncate max-w-[140px]" title={att.originalName}>
                        {att.originalName}
                      </span>
                      <a 
                        href={att.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="btn-icon btn-ghost btn-xs text-muted hover:text-primary"
                        title="Open full size"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discussion & Comments */}
          <div className="card p-5 bg-surface border-subtle space-y-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <MessageSquare size={16} className="text-blue" />
              Activity & Comments ({ticket.comments?.length || 0})
            </h3>

            <div className="space-y-3">
              {ticket.comments?.map((c: any) => (
                <div 
                  key={c.id} 
                  className={`p-3 rounded-lg border text-xs ${
                    c.isInternal ? 'bg-amber-subtle/20 border-amber/30' : 'bg-elevated/60 border-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-primary">{c.user?.name}</span>
                      {c.isInternal && (
                        <span className="badge bg-amber-subtle text-amber text-[9px] font-bold">INTERNAL NOTE</span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted">
                      {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-secondary leading-relaxed whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>

            {/* Add Comment Form */}
            <form onSubmit={handleCommentSubmit} className="pt-3 border-t border-subtle space-y-3">
              <textarea 
                rows={3}
                className="input w-full text-xs"
                placeholder="Type a response, update, or troubleshooting notes..."
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
              />
              <div className="flex items-center justify-between">
                {isAdminOrAbove && (
                  <label className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={isInternal} 
                      onChange={e => setIsInternal(e.target.checked)} 
                    />
                    <span>Post as Internal Note (Admin only)</span>
                  </label>
                )}
                <button 
                  type="submit" 
                  className="btn btn-primary btn-sm ml-auto flex items-center gap-1.5"
                  disabled={postCommentMutation.isPending}
                >
                  <Send size={12} />
                  <span>Send</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Metadata Sidebar */}
        <div className="space-y-4">
          {/* SLA Status Card */}
          <div className="card p-4 bg-surface border-subtle space-y-3">
            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">SLA Performance</h4>
            <div className="p-3 rounded-lg bg-elevated border border-subtle space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">Resolution SLA:</span>
                <span className="font-mono text-primary font-bold">{ticket.slaHours} Hours</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-secondary">SLA Target:</span>
                <span className="text-primary">
                  {ticket.slaTarget ? format(new Date(ticket.slaTarget), 'MMM d, h:mm a') : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-subtle">
                <span className="text-secondary">Status:</span>
                {ticket.slaBreached ? (
                  <span className="badge bg-red-subtle text-red border border-red/30 text-[10px] font-bold">
                    BREACHED
                  </span>
                ) : ticket.status === 'RESOLVED' ? (
                  <span className="badge bg-green-subtle text-green text-[10px] font-bold">
                    MET
                  </span>
                ) : (
                  <span className="badge bg-green-subtle text-green text-[10px] font-bold">
                    ON TRACK
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Properties Card */}
          <div className="card p-4 bg-surface border-subtle space-y-3 text-xs">
            <h4 className="font-semibold text-muted uppercase tracking-wider">Ticket Properties</h4>
            
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-muted">Customer</span>
                <span className="text-primary font-medium">{ticket.customer?.name || '—'}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted">Reporter</span>
                <span className="text-primary font-medium">{ticket.reporter?.name}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted">Assignee</span>
                <span className="text-primary font-medium">{ticket.assignee?.name || 'Unassigned'}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted">Created</span>
                <span className="text-secondary">
                  {format(new Date(ticket.createdAt), 'MMM d, yyyy h:mm a')}
                </span>
              </div>
            </div>
          </div>

          {/* Customer 360 Link */}
          {ticket.customer && (
            <div 
              className="card p-4 bg-surface border-subtle cursor-pointer hover:border-green/40 transition"
              onClick={() => navigate(`/customers/${ticket.customer.id}`)}
            >
              <div className="text-[11px] text-muted font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Building size={13} className="text-green" /> Customer 360 Account
              </div>
              <div className="text-sm font-bold text-primary">{ticket.customer.name}</div>
              <div className="text-[10px] text-muted font-mono mt-0.5">{ticket.customer.code} • View client overview</div>
            </div>
          )}

          {/* Audit History */}
          <div className="card p-4 bg-surface border-subtle space-y-3 text-xs">
            <h4 className="font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <History size={13} /> Audit History
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {ticket.history?.map((h: any) => (
                <div key={h.id} className="text-[11px] pb-1.5 border-b border-subtle last:border-0">
                  <div className="font-medium text-primary">{h.action}</div>
                  <div className="text-[10px] text-muted">
                    {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Convert to Task Modal */}
      {isConvertModalOpen && (
        <div className="modal-overlay" onClick={() => setIsConvertModalOpen(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="font-semibold text-base text-primary flex items-center gap-2">
                <CheckSquare size={16} className="text-accent" />
                Convert Ticket to Task
              </h3>
              <button className="btn-icon btn-ghost" onClick={() => setIsConvertModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleConvertSubmit} className="mt-4 space-y-4">
              <div className="text-xs text-muted">
                This creates a linked task in the developer backlog linked to <strong className="text-primary">{ticket.ticketId}</strong>.
              </div>

              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Assign to Project</label>
                <select 
                  className="input w-full text-xs"
                  value={selectedProject}
                  onChange={e => setSelectedProject(e.target.value)}
                >
                  <option value="">Select Project (Optional)...</option>
                  {projects.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Assignee</label>
                <select 
                  className="input w-full text-xs"
                  value={selectedAssignee}
                  onChange={e => setSelectedAssignee(e.target.value)}
                >
                  <option value="">Select Assignee...</option>
                  {users.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.role?.name})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Estimated Effort (Hours)</label>
                <input 
                  type="number"
                  step="0.5"
                  className="input w-full text-xs"
                  value={estimatedHours}
                  onChange={e => setEstimatedHours(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" className="btn btn-ghost text-xs" onClick={() => setIsConvertModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary text-xs"
                  disabled={convertToTaskMutation.isPending}
                >
                  {convertToTaskMutation.isPending ? 'Creating Task...' : 'Convert & Spawn Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
