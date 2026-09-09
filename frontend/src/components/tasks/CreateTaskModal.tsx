import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { 
  X, AlertTriangle, Bug, Briefcase, Megaphone, 
  PlusCircle, Calendar, UserCheck, ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDepartmentId?: string;
}

export function CreateTaskModal({ isOpen, onClose, defaultDepartmentId }: CreateTaskModalProps) {
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

  // Fetch Metadata (priorities, departments, users)
  const { data: meta } = useQuery({
    queryKey: ['task-metadata'],
    queryFn: async () => {
      const res = await api.get('/tasks/meta/statuses');
      return res.data;
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
      toast.success(isAdminOrSuper ? 'Task created and allocated!' : 'Issue raised successfully!');
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
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
      toast.error('Please enter a title');
      return;
    }

    // Build rich formatted description based on persona
    let fullDescription = description.trim();

    if (isFDE) {
      fullDescription = `### 🛠️ FDE Incident Details\n- **Environment:** ${environment}\n\n**Description:**\n${description}\n\n**Steps to Reproduce:**\n${stepsToReproduce || 'N/A'}\n\n**Error Logs / Traces:**\n\`\`\`\n${errorLogs || 'No logs provided'}\n\`\`\``;
    } else if (isSales) {
      fullDescription = `### 💼 Sales Client Blocker\n- **Client / Account:** ${clientName || 'General'}\n- **Category:** ${blockerCategory}\n- **Deal / ARR Impact:** ${dealValue ? `$${dealValue}` : 'Not Specified'}\n\n**Impact & Details:**\n${description}`;
    } else if (isMarketing) {
      fullDescription = `### 📣 Marketing Campaign Request\n- **Campaign:** ${campaignName || 'General Brand'}\n- **Deliverable Type:** ${deliverableType}\n\n**Brief & Requirements:**\n${description}`;
    }

    const payload: any = {
      title,
      description: fullDescription,
      departmentId: departmentId || user?.department?.id,
      priorityId: priorityId || undefined,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    };

    if (isAdminOrSuper) {
      if (assigneeId) payload.assigneeId = assigneeId;
      if (estimatedHours) payload.estimatedHours = parseFloat(estimatedHours);
    }

    createTaskMutation.mutate(payload);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-subtle rounded-xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        
        {/* Header with Departmental Branding */}
        <div className="p-4 border-b border-subtle flex justify-between items-center bg-surface-hover rounded-t-xl">
          <div className="flex items-center gap-2.5">
            {isAdminOrSuper ? (
              <div className="w-8 h-8 rounded-lg bg-blue-subtle text-blue flex items-center justify-center">
                <PlusCircle size={18} />
              </div>
            ) : isFDE ? (
              <div className="w-8 h-8 rounded-lg bg-purple-subtle text-purple flex items-center justify-center">
                <Bug size={18} />
              </div>
            ) : isSales ? (
              <div className="w-8 h-8 rounded-lg bg-green-subtle text-green flex items-center justify-center">
                <Briefcase size={18} />
              </div>
            ) : isMarketing ? (
              <div className="w-8 h-8 rounded-lg bg-amber-subtle text-amber flex items-center justify-center">
                <Megaphone size={18} />
              </div>
            ) : (
              <div className="w-8 h-8 rounded-lg bg-accent text-primary flex items-center justify-center">
                <AlertTriangle size={18} />
              </div>
            )}

            <div>
              <h2 className="font-semibold text-base text-primary">
                {isAdminOrSuper 
                  ? 'Create & Allocate Task'
                  : isFDE 
                  ? 'Raise Technical Issue / Bug' 
                  : isSales 
                  ? 'Raise Client Blocker / Request' 
                  : isMarketing 
                  ? 'Submit Campaign Deliverable' 
                  : 'Raise an Issue'}
              </h2>
              <div className="text-xs text-muted flex items-center gap-1.5">
                <span className="badge badge-sm uppercase tracking-wide">
                  {isAdminOrSuper ? `${user?.role} MODE` : `${user?.department?.name || 'EMPLOYEE'} DESK`}
                </span>
                <span>•</span>
                <span>{isAdminOrSuper ? 'Full assignment privileges' : 'Will be queued for Admin allocation'}</span>
              </div>
            </div>
          </div>

          <button 
            className="text-muted hover:text-primary transition-colors p-1 rounded-lg hover:bg-surface"
            onClick={handleClose}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Form Body */}
        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
          <form id="taskCreateForm" onSubmit={handleSubmit} className="flex flex-col gap-4">
            
            {/* Title */}
            <div className="form-group">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1 block">
                {isFDE ? 'Incident Summary / Defect Title' : isSales ? 'Client Issue / Blocker Summary' : isMarketing ? 'Deliverable / Asset Title' : 'Task Title'} *
              </label>
              <input 
                required 
                type="text" 
                className="input text-sm" 
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

            {/* FDE Specific Fields */}
            {isFDE && !isAdminOrSuper && (
              <div className="p-3 bg-purple-subtle/20 border border-purple/20 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-purple">
                  <Bug size={14} /> FDE Technical Diagnostics
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Environment</label>
                    <select 
                      className="input text-xs py-1.5"
                      value={environment}
                      onChange={e => setEnvironment(e.target.value)}
                    >
                      <option value="Production">Production (Live Customer)</option>
                      <option value="Staging">Staging / QA</option>
                      <option value="On-Premise">On-Premise Client Node</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Priority Level</label>
                    <select 
                      className="input text-xs py-1.5"
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
                  <label className="text-xs text-muted mb-1 block">Steps to Reproduce</label>
                  <input 
                    type="text" 
                    className="input text-xs" 
                    placeholder="1. Login as Tenant Admin -> 2. Click Sync -> 3. Error 500" 
                    value={stepsToReproduce}
                    onChange={e => setStepsToReproduce(e.target.value)}
                  />
                </div>

                <div>
                  <label className="text-xs text-muted mb-1 block">Error Logs / Stacktrace</label>
                  <textarea 
                    className="input text-xs font-mono resize-y min-h-[60px]" 
                    placeholder="Paste relevant terminal logs or trace IDs here..." 
                    value={errorLogs}
                    onChange={e => setErrorLogs(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Sales Specific Fields */}
            {isSales && !isAdminOrSuper && (
              <div className="p-3 bg-green-subtle/20 border border-green/20 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-green">
                  <Briefcase size={14} /> Client Account Context
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Client / Account Name *</label>
                    <input 
                      type="text" 
                      className="input text-xs" 
                      placeholder="e.g. Globex Corp"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Deal / ARR at Risk ($)</label>
                    <input 
                      type="text" 
                      className="input text-xs" 
                      placeholder="e.g. 50,000"
                      value={dealValue}
                      onChange={e => setDealValue(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block">Blocker Category</label>
                  <select 
                    className="input text-xs py-1.5"
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
              <div className="p-3 bg-amber-subtle/20 border border-amber/20 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber">
                  <Megaphone size={14} /> Campaign Specification
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Campaign / Initiative</label>
                    <input 
                      type="text" 
                      className="input text-xs" 
                      placeholder="e.g. Q3 Product Hunt Launch"
                      value={campaignName}
                      onChange={e => setCampaignName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Deliverable Type</label>
                    <select 
                      className="input text-xs py-1.5"
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
              <div className="p-3.5 bg-blue-subtle/20 border border-blue/20 rounded-lg flex flex-col gap-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-blue">
                  <UserCheck size={14} /> Admin Task Allocation & Department Routing
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Target Department</label>
                    <select 
                      className="input text-xs py-1.5"
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
                    <label className="text-xs text-muted mb-1 block font-semibold text-primary">Assignee (Owner)</label>
                    <select 
                      className="input text-xs py-1.5 font-medium"
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

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted mb-1 block">Priority</label>
                    <select 
                      className="input text-xs py-1.5"
                      value={priorityId}
                      onChange={e => setPriorityId(e.target.value)}
                    >
                      {meta?.priorities?.map((p: any) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Est. Hours</label>
                    <input 
                      type="number" 
                      step="0.5" 
                      className="input text-xs" 
                      placeholder="e.g. 4.5"
                      value={estimatedHours}
                      onChange={e => setEstimatedHours(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted mb-1 block">Target Due Date</label>
                    <input 
                      type="date" 
                      className="input text-xs" 
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Common Description Field */}
            <div className="form-group">
              <label className="text-xs font-semibold text-muted uppercase tracking-wider mb-1 block">
                Detailed Description & Context
              </label>
              <textarea 
                rows={4}
                className="input text-sm resize-y" 
                placeholder="Provide complete context, links, and acceptance criteria..." 
                value={description} 
                onChange={e => setDescription(e.target.value)} 
              />
            </div>

            {/* Non-admin Due Date & Priority */}
            {!isAdminOrSuper && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted mb-1 block flex items-center gap-1">
                    <Calendar size={12} /> Desired Resolution Date
                  </label>
                  <input 
                    type="date" 
                    className="input text-xs" 
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted mb-1 block flex items-center gap-1">
                    <ShieldAlert size={12} /> Urgency Level
                  </label>
                  <select 
                    className="input text-xs py-1.5"
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
        <div className="p-4 border-t border-subtle bg-surface-hover rounded-b-xl flex justify-between items-center">
          <span className="text-xs text-muted">
            {isAdminOrSuper ? 'Assignee will be notified instantly.' : 'Admins will triage & assign this issue.'}
          </span>
          <div className="flex gap-2">
            <button 
              type="button" 
              className="btn btn-secondary btn-sm"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              form="taskCreateForm"
              className="btn btn-primary btn-sm"
              disabled={createTaskMutation.isPending}
            >
              {createTaskMutation.isPending ? (
                'Submitting...'
              ) : isAdminOrSuper ? (
                'Create & Assign'
              ) : (
                'Submit Issue'
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
