import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { 
  X, Bug, Briefcase, Megaphone, 
  PlusCircle, Calendar, UserCheck, ShieldAlert, FolderKanban
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDepartmentId?: string;
  defaultProjectId?: string;
}

export function CreateTaskModal({ isOpen, onClose, defaultDepartmentId, defaultProjectId }: CreateTaskModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const isAdminOrSuper = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';
  const deptCode = user?.department?.code?.toUpperCase() || '';
  const isFDE = deptCode === 'FDE';
  const isSales = deptCode === 'SAL' || user?.department?.name?.toLowerCase().includes('sales');
  const isMarketing = deptCode === 'MKT' || user?.department?.name?.toLowerCase().includes('marketing');

  // Common Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [departmentId, setDepartmentId] = useState(defaultDepartmentId || user?.department?.id || '');
  const [priorityId, setPriorityId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  const [projectId, setProjectId] = useState(defaultProjectId || '');

  // Department-specific fields
  // FDE fields
  const [environment, setEnvironment] = useState('Production');
  const [errorLogs, setErrorLogs] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');

  // Sales fields
  const [clientName, setClientName] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [blockerCategory, setBlockerCategory] = useState('Onboarding Blocker');

  // Marketing fields
  const [campaignName, setCampaignName] = useState('');
  const [deliverableType, setDeliverableType] = useState('Social Media & Ads');

  // Sync defaultProjectId when opened
  useEffect(() => {
    if (defaultProjectId) {
      setProjectId(defaultProjectId);
    }
  }, [defaultProjectId]);

  // Fetch Metadata (priorities, departments, users)
  const { data: meta } = useQuery({
    queryKey: ['task-metadata'],
    queryFn: async () => {
      const res = await api.get('/tasks/meta/statuses');
      return res.data;
    },
    enabled: isOpen,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-select'],
    queryFn: async () => {
      const res = await api.get('/projects');
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: isOpen,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await api.get('/departments');
      return res.data;
    },
    enabled: isOpen,
  });

  const { data: users } = useQuery({
    queryKey: ['users-assignees'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    enabled: isOpen && isAdminOrSuper,
  });

  // Set default priority
  useEffect(() => {
    if (meta?.priorities && !priorityId) {
      const medium = meta.priorities.find((p: any) => p.name === 'MEDIUM');
      if (medium) setPriorityId(medium.id);
    }
  }, [meta, priorityId]);

  useEffect(() => {
    if (user?.department?.id && !departmentId) {
      setDepartmentId(user.department.id);
    }
  }, [user, departmentId]);

  const createTaskMutation = useMutation({
    mutationFn: (payload: any) => api.post('/tasks', payload),
    onSuccess: () => {
      toast.success(isAdminOrSuper ? 'Task created and mapped to project!' : 'Task created and assigned!');
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['unassigned-tasks'] });
      handleClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create task');
    }
  });

  const handleClose = () => {
    setTitle('');
    setDescription('');
    setProjectId(defaultProjectId || '');
    setErrorLogs('');
    setStepsToReproduce('');
    setClientName('');
    setDealValue('');
    setCampaignName('');
    setDueDate('');
    setEstimatedHours('');
    setAssigneeId('');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a task title');
      return;
    }
    if (!projectId) {
      toast.error('Please select a project to map this task');
      return;
    }

    const payload: any = {
      title: title.trim(),
      description: description.trim(),
      projectId,
      departmentId: departmentId || user?.department?.id,
      priorityId: priorityId || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    };

    if (assigneeId) {
      payload.assigneeId = assigneeId;
    } else if (!isAdminOrSuper && user?.id) {
      // Default to self-assign for users creating their own tasks
      payload.assigneeId = user.id;
    }

    if (estimatedHours) payload.estimatedHours = parseFloat(estimatedHours);

    createTaskMutation.mutate(payload);
  };

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div 
        className="bg-surface border border-subtle rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] my-auto"
        style={{ 
          backgroundColor: 'var(--bg-surface)',
          maxWidth: '700px', /* 20% larger than 576px (max-w-xl) */
          width: '100%'
        }}
      >
        
        {/* Header with Departmental Branding */}
        <div className="px-6 py-4 border-b border-subtle flex justify-between items-center bg-surface-hover rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-subtle text-blue flex items-center justify-center shrink-0">
              <PlusCircle size={20} />
            </div>

            <div>
              <h2 className="font-bold text-base text-primary tracking-tight">
                Create & Allocate Task
              </h2>
              <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                <span className="badge badge-sm font-semibold tracking-wide uppercase px-2 py-0.5 bg-surface-hover border border-subtle">
                  {user?.role} MODE
                </span>
                <span className="text-muted/60">•</span>
                <span>{isAdminOrSuper ? 'Admin task creation & project allocation' : 'Create & map task to project'}</span>
              </div>
            </div>
          </div>

          <button 
            type="button"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-surface transition-colors"
            onClick={handleClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          <form id="taskCreateForm" onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            {/* Title */}
            <div className="form-group">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
                {isFDE ? 'Incident Summary / Defect Title' : isSales ? 'Client Issue / Blocker Summary' : isMarketing ? 'Deliverable / Asset Title' : 'Task Title'} <span className="text-red font-bold">*</span>
              </label>
              <input 
                required 
                type="text" 
                className="input text-sm h-10" 
                placeholder={
                  isFDE ? 'e.g. 504 Gateway Timeout during batch deployment on US-East' :
                  isSales ? 'e.g. Acme Corp cannot onboard: SSO SAML integration fails' :
                  isMarketing ? 'e.g. Q4 Growth Campaign: Hero banner & copy for LinkedIn' :
                  'e.g. Update user authentication flow'
                }
                value={title} 
                onChange={e => setTitle(e.target.value)} 
              />
            </div>

            {/* Target Project (Required Mapping) */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
                  <FolderKanban size={13} className="text-blue" />
                  <span>Target Project</span>
                  <span className="text-red font-bold">*</span>
                </label>
                <span className="text-[11px] text-muted normal-case font-normal">All tasks must be mapped to a project</span>
              </div>
              <select 
                required 
                className="input text-sm h-10"
                value={projectId}
                onChange={e => setProjectId(e.target.value)}
              >
                <option value="">Select Associated Project...</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.customer?.name ? `— ${p.customer.name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* FDE Specific Fields */}
            {isFDE && !isAdminOrSuper && (
              <div className="p-4 bg-purple-subtle/20 border border-purple/20 rounded-xl flex flex-col gap-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple pb-2 border-b border-purple/15">
                  <Bug size={14} /> <span>FDE Technical Diagnostics</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Environment</label>
                    <select 
                      className="input text-sm h-10"
                      value={environment}
                      onChange={e => setEnvironment(e.target.value)}
                    >
                      <option value="Production">Production (Live Customer)</option>
                      <option value="Staging">Staging / QA</option>
                      <option value="On-Premise">On-Premise Client Node</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Priority Level</label>
                    <select 
                      className="input text-sm h-10"
                      value={priorityId}
                      onChange={e => setPriorityId(e.target.value)}
                    >
                      {meta?.priorities?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Steps to Reproduce</label>
                  <input 
                    type="text" 
                    className="input text-sm h-10" 
                    placeholder="1. Login as Tenant Admin -> 2. Click Sync -> 3. Error 500" 
                    value={stepsToReproduce}
                    onChange={e => setStepsToReproduce(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Error Logs / Stacktrace</label>
                  <textarea 
                    className="input text-sm font-mono resize-y min-h-[70px]" 
                    placeholder="Paste relevant terminal logs or trace IDs here..." 
                    value={errorLogs}
                    onChange={e => setErrorLogs(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Sales Specific Fields */}
            {isSales && !isAdminOrSuper && (
              <div className="p-4 bg-green-subtle/20 border border-green/20 rounded-xl flex flex-col gap-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green pb-2 border-b border-green/15">
                  <Briefcase size={14} /> <span>Client Account Context</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Client / Account Name *</label>
                    <input 
                      type="text" 
                      className="input text-sm h-10" 
                      placeholder="e.g. Globex Corp"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Deal / ARR at Risk ($)</label>
                    <input 
                      type="text" 
                      className="input text-sm h-10" 
                      placeholder="e.g. 50,000"
                      value={dealValue}
                      onChange={e => setDealValue(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Blocker Category</label>
                  <select 
                    className="input text-sm h-10"
                    value={blockerCategory}
                    onChange={e => setBlockerCategory(e.target.value)}
                  >
                    <option value="Onboarding Blocker">Onboarding Blocker (Customer cannot launch)</option>
                    <option value="Enterprise Feature Request">Enterprise Feature Request (Contract condition)</option>
                    <option value="SLA Breach Risk">SLA Response Required</option>
                    <option value="Billing / Contract Query">Billing / Security Questionnaire</option>
                  </select>
                </div>
              </div>
            )}

            {/* Marketing Specific Fields */}
            {isMarketing && !isAdminOrSuper && (
              <div className="p-4 bg-amber-subtle/20 border border-amber/20 rounded-xl flex flex-col gap-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber pb-2 border-b border-amber/15">
                  <Megaphone size={14} /> <span>Campaign Specification</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Campaign / Initiative</label>
                    <input 
                      type="text" 
                      className="input text-sm h-10" 
                      placeholder="e.g. Q3 Product Hunt Launch"
                      value={campaignName}
                      onChange={e => setCampaignName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Deliverable Type</label>
                    <select 
                      className="input text-sm h-10"
                      value={deliverableType}
                      onChange={e => setDeliverableType(e.target.value)}
                    >
                      <option value="Social Media & Ads">Social Media & Ads</option>
                      <option value="Landing Page & Web">Landing Page & Web</option>
                      <option value="Blog Post & Content">Blog Post & SEO Article</option>
                      <option value="Video & Motion">Video & Demo Animation</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Admin / Super Admin Allocation Section */}
            {isAdminOrSuper && (
              <div className="p-4 bg-blue-subtle/15 border border-blue/20 rounded-xl flex flex-col gap-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue pb-2 border-b border-blue/15">
                  <UserCheck size={15} />
                  <span>Admin Task Allocation & Department Routing</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Target Department</label>
                    <select 
                      className="input text-sm h-10"
                      value={departmentId}
                      onChange={e => setDepartmentId(e.target.value)}
                    >
                      <option value="">Select Department...</option>
                      {departments?.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Assignee (Owner)</label>
                    <select 
                      className="input text-sm h-10"
                      value={assigneeId}
                      onChange={e => setAssigneeId(e.target.value)}
                    >
                      <option value="">Leave Unassigned (Queue)</option>
                      {users?.map((u: any) => (
                        <option key={u.id} value={u.id}>
                          {u.name} — {u.department?.code || 'GEN'} ({u.activeTaskCount || 0} active)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Priority</label>
                    <select 
                      className="input text-sm h-10"
                      value={priorityId}
                      onChange={e => setPriorityId(e.target.value)}
                    >
                      {meta?.priorities?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Est. Hours</label>
                    <input 
                      type="number" 
                      step="0.5" 
                      className="input text-sm h-10" 
                      placeholder="e.g. 4.5"
                      value={estimatedHours}
                      onChange={e => setEstimatedHours(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">Target Due Date</label>
                    <input 
                      type="date" 
                      className="input text-sm h-10" 
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Common Description Field */}
            <div className="form-group">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
                Detailed Description & Context
              </label>
              <textarea 
                rows={4}
                className="input text-sm resize-y leading-relaxed" 
                placeholder="Provide complete context, links, and acceptance criteria..." 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
            </div>

            {/* Non-admin Due Date & Priority */}
            {!isAdminOrSuper && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <Calendar size={13} className="text-muted" /> <span>Desired Resolution Date</span>
                  </label>
                  <input 
                    type="date" 
                    className="input text-sm h-10" 
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <ShieldAlert size={13} className="text-muted" /> <span>Urgency Level</span>
                  </label>
                  <select 
                    className="input text-sm h-10"
                    value={priorityId}
                    onChange={e => setPriorityId(e.target.value)}
                  >
                    {meta?.priorities?.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

          </form>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-subtle bg-surface-hover rounded-b-2xl flex justify-between items-center">
          <span className="text-xs text-muted font-medium">
            {isAdminOrSuper ? 'Assignee will be notified instantly.' : 'Task will be mapped directly to the selected project.'}
          </span>
          <div className="flex items-center gap-3">
            <button 
              type="button" 
              className="btn btn-secondary text-xs px-4 h-9 font-medium"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="taskCreateForm"
              className="btn btn-primary text-xs px-5 h-9 font-semibold shadow-sm"
              disabled={createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? (
                'Submitting...'
              ) : isAdminOrSuper ? (
                'Create & Assign'
              ) : (
                'Create Task'
              )}
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
