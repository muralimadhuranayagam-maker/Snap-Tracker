import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  FolderKanban, 
  Plus, 
  Search, 
  Building, 
  CheckSquare, 
  Ticket, 
  ArrowRight, 
  ShieldAlert,
  X,
  Trash2
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { ProjectTasksModal } from '../components/projects/ProjectTasksModal';
import { CreateTaskModal } from '../components/tasks/CreateTaskModal';
import { DeleteConfirmModal } from '../components/common/DeleteConfirmModal';

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedProjectForTasks, setSelectedProjectForTasks] = useState<any | null>(null);
  const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false);
  const [createTaskProjectId, setCreateTaskProjectId] = useState<string | undefined>(undefined);
  const [deletingProject, setDeletingProject] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteProject = async () => {
    if (!deletingProject) return;
    try {
      setIsDeleting(true);
      await api.delete(`/projects/${deletingProject.id}`);
      toast.success(`Project "${deletingProject.name}" deleted completely`);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setDeletingProject(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  // New Project Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [priority] = useState('HIGH');

  useEffect(() => {
    if (isCreateModalOpen || selectedProjectForTasks || isCreateTaskModalOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isCreateModalOpen, selectedProjectForTasks, isCreateTaskModalOpen]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      return api.get(`/projects?${params.toString()}`).then(r => r.data);
    },
    refetchInterval: 15_000,
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => api.get('/customers').then(r => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
  });

  const createProjectMutation = useMutation({
    mutationFn: (data: any) => api.post('/projects', data),
    onSuccess: () => {
      toast.success('Project created successfully');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsCreateModalOpen(false);
      setName('');
      setDescription('');
      setCustomerId('');
      setDepartmentId('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create project');
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createProjectMutation.mutate({
      name,
      description,
      customerId: customerId || undefined,
      departmentId: departmentId || undefined,
      priority,
    });
  };

  const atRiskCount = projects.filter((p: any) => p.health === 'AT_RISK' || p.health === 'CRITICAL').length;

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Projects</h1>
            <span className="badge bg-elevated font-mono text-xs text-muted">{projects.length} total</span>
            {atRiskCount > 0 && (
              <span className="badge bg-red-subtle text-red border border-red/30 text-xs flex items-center gap-1 font-semibold">
                <ShieldAlert size={12} /> {atRiskCount} At Risk
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Cross-departmental programs connecting engineering, sales onboarding, and marketing.
          </p>
        </div>

        {isAdmin && (
          <button 
            className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} />
            <span>New Project</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="card p-3 bg-surface border-subtle flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search projects..."
            className="input w-full pl-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select 
          className="input text-xs py-1.5"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="ON_HOLD">ON_HOLD</option>
        </select>
      </div>

      {/* Project Grid */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="spinner spinner-md mx-auto" />
          <div className="text-xs text-muted mt-2">Loading projects...</div>
        </div>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center text-muted text-xs">
          <FolderKanban size={28} className="mx-auto mb-2 opacity-40" />
          No projects found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p: any) => {
            const totalTasks = p.stats?.total ?? p._count?.tasks ?? (p.tasks?.length || 0);
            const completedTasks = p.stats?.done ?? p.tasks?.filter((t: any) => t.status?.name === 'DONE').length ?? 0;
            const progress = p.stats?.progress ?? (totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0);

            return (
              <div 
                key={p.id}
                className="card p-5 bg-surface border border-subtle hover:border-accent/40 transition cursor-pointer flex flex-col justify-between group shadow-sm hover:shadow-md"
                onClick={() => setSelectedProjectForTasks(p)}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`badge text-[10px] font-semibold ${
                      p.health === 'CRITICAL' ? 'bg-red-subtle text-red border border-red/30' :
                      p.health === 'AT_RISK' ? 'bg-amber-subtle text-amber border border-amber/30' :
                      'bg-green-subtle text-green'
                    }`}>
                      {p.health || 'HEALTHY'}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="badge bg-elevated text-[10px]">{p.status}</span>
                      {isSuperAdmin && (
                        <button
                          type="button"
                          title="Delete Project (Super Admin)"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingProject(p);
                          }}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '4px',
                            padding: '2px 4px',
                            color: '#94a3b8',
                            transition: 'all 0.15s',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#ef4444'; e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-primary group-hover:text-blue-400 transition-colors flex items-center gap-2">
                      <FolderKanban size={16} className="text-blue-400 shrink-0" />
                      <span>{p.name}</span>
                    </h3>
                    <p className="text-xs text-muted mt-1 line-clamp-2">{p.description || 'No description provided.'}</p>
                  </div>

                  {p.customer && (
                    <div className="flex items-center gap-1 text-xs text-secondary">
                      <Building size={12} className="text-green" />
                      <span>{p.customer.name}</span>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-muted mb-1">
                      <span>Tasks Progress ({completedTasks}/{totalTasks})</span>
                      <span className="font-mono text-primary font-bold">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all duration-300 rounded-full"
                        style={{
                          width: `${progress}%`,
                          background: progress === 100 ? '#22c55e' : 'linear-gradient(90deg, #3b82f6 0%, #22c55e 100%)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-2.5">
                    <span 
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '3px 9px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        lineHeight: 1.2,
                        background: 'rgba(59, 130, 246, 0.12)',
                        color: '#93c5fd',
                        border: '1px solid rgba(96, 165, 250, 0.3)',
                        userSelect: 'none',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <CheckSquare size={13} style={{ color: '#60a5fa', flexShrink: 0 }} />
                      <span>{totalTasks} {totalTasks === 1 ? 'task' : 'tasks'}</span>
                    </span>
                    {p.tickets && p.tickets.length > 0 && (
                      <span className="flex items-center gap-1 text-amber text-xs">
                        <Ticket size={13} />
                        <span>{p.tickets.length}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs text-blue-400 font-medium transition flex items-center gap-1">
                      View Tasks <ArrowRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <button
                      type="button"
                      className="text-xs text-muted hover:text-primary transition flex items-center gap-0.5 border-l border-subtle pl-2.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projects/${p.id}`);
                      }}
                      title="Open full project dashboard"
                    >
                      <span>Dashboard</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateModalOpen && createPortal(
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
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div 
            className="bg-surface border border-subtle rounded-2xl shadow-2xl w-full my-auto overflow-hidden" 
            style={{ 
              backgroundColor: 'var(--bg-surface)',
              maxWidth: '640px',
              width: '100%'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 py-4.5 border-b border-subtle flex items-center justify-between bg-surface-hover rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-subtle text-blue flex items-center justify-center shrink-0">
                  <FolderKanban size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-base text-primary">
                    Create New Project
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Set up cross-departmental initiative & client association
                  </p>
                </div>
              </div>
              <button 
                className="text-muted hover:text-primary transition-colors p-1.5 rounded-lg hover:bg-surface" 
                onClick={() => setIsCreateModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Project Name *</label>
                <input 
                  type="text" 
                  className="input w-full text-sm" 
                  placeholder="e.g. ABC Corp API Integration & Launch"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Description</label>
                <textarea 
                  rows={3}
                  className="input w-full text-sm resize-y" 
                  placeholder="Objectives, deliverables, and scope..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1.5">Linked Customer</label>
                  <select 
                    className="input w-full text-xs py-2"
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                  >
                    <option value="">Select Customer (Optional)...</option>
                    {customers.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-secondary block mb-1.5">Primary Department</label>
                  <select 
                    className="input w-full text-xs py-2"
                    value={departmentId}
                    onChange={e => setDepartmentId(e.target.value)}
                  >
                    <option value="">Select Department...</option>
                    {departments.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-subtle">
                <button 
                  type="button" 
                  className="btn btn-secondary text-xs px-4 py-2" 
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary text-xs px-4 py-2 font-medium"
                  disabled={createProjectMutation.isPending}
                >
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Project Tasks Modal */}
      {selectedProjectForTasks && (
        <ProjectTasksModal
          isOpen={!!selectedProjectForTasks}
          onClose={() => setSelectedProjectForTasks(null)}
          project={selectedProjectForTasks}
          onAddTask={(projId) => {
            setCreateTaskProjectId(projId);
            setIsCreateTaskModalOpen(true);
          }}
        />
      )}

      {/* Create Task Modal */}
      {isCreateTaskModalOpen && (
        <CreateTaskModal
          isOpen={isCreateTaskModalOpen}
          onClose={() => {
            setIsCreateTaskModalOpen(false);
            setCreateTaskProjectId(undefined);
            queryClient.invalidateQueries({ queryKey: ['projects'] });
          }}
          defaultProjectId={createTaskProjectId}
        />
      )}

      {/* Delete Confirmation Modal for Super Admin */}
      <DeleteConfirmModal
        isOpen={!!deletingProject}
        title="Delete Project"
        recordType="Project"
        recordTitle={deletingProject?.name}
        recordSubtitle={deletingProject?.status}
        isLoading={isDeleting}
        onClose={() => setDeletingProject(null)}
        onConfirm={handleDeleteProject}
      />
    </div>
  );
}
