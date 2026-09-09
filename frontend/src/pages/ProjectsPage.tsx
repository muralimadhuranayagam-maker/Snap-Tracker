import { useState } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export function ProjectsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Project Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [priority] = useState('HIGH');

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
            const completedTasks = p.tasks?.filter((t: any) => t.status?.name === 'DONE').length || 0;
            const totalTasks = p.tasks?.length || 0;
            const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

            return (
              <div 
                key={p.id}
                className="card p-5 bg-surface border-subtle hover:border-accent/40 transition cursor-pointer flex flex-col justify-between"
                onClick={() => navigate(`/projects/${p.id}`)}
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
                    <span className="badge bg-elevated text-[10px]">{p.status}</span>
                  </div>

                  <div>
                    <h3 className="text-base font-semibold text-primary">{p.name}</h3>
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
                      <span>Tasks Progress</span>
                      <span className="font-mono text-primary">{progress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-elevated rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all duration-300 rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-xs text-muted">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <CheckSquare size={13} className="text-accent" />
                      <span>{totalTasks}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Ticket size={13} className="text-amber" />
                      <span>{p.tickets?.length || 0}</span>
                    </span>
                  </div>

                  <span className="text-accent flex items-center gap-1 text-xs font-medium">
                    Open <ArrowRight size={12} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Project Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="font-semibold text-base text-primary flex items-center gap-2">
                <FolderKanban size={16} className="text-accent" />
                Create New Project
              </h3>
              <button className="btn-icon btn-ghost" onClick={() => setIsCreateModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-secondary block mb-1.5">Project Name *</label>
                <input 
                  type="text" 
                  className="input w-full text-xs" 
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
                  className="input w-full text-xs" 
                  placeholder="Objectives, deliverables, and scope..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1.5">Linked Customer</label>
                  <select 
                    className="input w-full text-xs"
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
                    className="input w-full text-xs"
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

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" className="btn btn-ghost text-xs" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary text-xs"
                  disabled={createProjectMutation.isPending}
                >
                  {createProjectMutation.isPending ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
