import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Building, 
  Mail, 
  Phone, 
  FolderKanban, 
  Ticket, 
  CheckSquare, 
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';

export function CustomerDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'projects' | 'tickets' | 'tasks'>('projects');

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get(`/customers/${id}`).then(r => r.data),
    enabled: !!id,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="empty-state py-16 text-center">
        <h3 className="text-lg font-bold text-primary">Customer not found</h3>
        <button className="btn btn-primary btn-sm mt-3" onClick={() => navigate('/customers')}>
          Back to Customers
        </button>
      </div>
    );
  }

  const projects = customer.projects || [];
  const tickets = customer.tickets || [];
  const tasks = customer.tasks || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button 
          className="btn btn-ghost btn-sm flex items-center gap-1.5 text-secondary hover:text-primary"
          onClick={() => navigate('/customers')}
        >
          <ArrowLeft size={14} /> Back to Customers
        </button>

        <div className="flex items-center gap-2">
          <span className="badge bg-green-subtle text-green border border-green/30 text-xs font-semibold">
            {customer.tier} TIER
          </span>
          <span className="badge bg-elevated text-xs">{customer.status}</span>
        </div>
      </div>

      {/* Customer Header Card */}
      <div className="card p-6 bg-surface border-subtle space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building size={22} className="text-green" />
              <h1 className="text-2xl font-bold text-primary">{customer.name}</h1>
              <span className="badge bg-elevated font-mono text-xs text-muted">{customer.code}</span>
            </div>
            <p className="text-xs text-secondary mt-1">
              Industry: <strong className="text-primary">{customer.industry || 'Technology'}</strong>
            </p>
          </div>

          <div className="flex items-center gap-4 bg-elevated/60 px-4 py-2.5 rounded-xl border border-subtle">
            <div>
              <div className="text-[10px] text-muted uppercase">Health Score</div>
              <div className="text-lg font-bold text-green">{customer.healthScore}%</div>
            </div>
            <div className="w-[1px] h-8 bg-subtle" />
            <div>
              <div className="text-[10px] text-muted uppercase">Annual Recurring</div>
              <div className="text-lg font-bold font-mono text-primary">
                ${customer.arr ? (customer.arr / 1000).toFixed(0) : '0'}k
              </div>
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="flex flex-wrap items-center gap-6 text-xs text-secondary pt-3 border-t border-subtle">
          {customer.primaryContactName && (
            <div>Contact: <strong className="text-primary">{customer.primaryContactName}</strong></div>
          )}
          {customer.primaryContactEmail && (
            <div className="flex items-center gap-1.5">
              <Mail size={13} className="text-muted" />
              <a href={`mailto:${customer.primaryContactEmail}`} className="text-accent hover:underline">
                {customer.primaryContactEmail}
              </a>
            </div>
          )}
          {customer.primaryContactPhone && (
            <div className="flex items-center gap-1.5">
              <Phone size={13} className="text-muted" />
              <span>{customer.primaryContactPhone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Linked Navigation Tabs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-subtle pb-2">
          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'projects' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('projects')}
          >
            <FolderKanban size={14} />
            <span>Active Projects ({projects.length})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'tickets' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('tickets')}
          >
            <Ticket size={14} />
            <span>Tickets & Issues ({tickets.length})</span>
          </button>

          <button
            className={`btn btn-sm text-xs flex items-center gap-1.5 ${
              activeTab === 'tasks' ? 'btn-primary' : 'btn-ghost'
            }`}
            onClick={() => setActiveTab('tasks')}
          >
            <CheckSquare size={14} />
            <span>Engineering & Deliverable Tasks ({tasks.length})</span>
          </button>
        </div>

        {/* Tab 1: Projects */}
        {activeTab === 'projects' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {projects.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">No projects associated with this customer.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Project Name</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Tasks</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {projects.map((p: any) => (
                      <tr 
                        key={p.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/projects/${p.id}`)}
                      >
                        <td className="p-3 font-semibold text-primary">{p.name}</td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{p.status}</span>
                        </td>
                        <td className="p-3 text-secondary">{p._count?.tasks || 0} tasks</td>
                        <td className="p-3 text-right">
                          <button className="btn btn-ghost btn-xs text-accent">
                            <ExternalLink size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Tickets */}
        {activeTab === 'tickets' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {tickets.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">No active tickets for this customer.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Ticket ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {tickets.map((t: any) => (
                      <tr 
                        key={t.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/tickets/${t.id}`)}
                      >
                        <td className="p-3 font-mono font-bold text-amber">{t.ticketId}</td>
                        <td className="p-3 font-medium text-primary">{t.title}</td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{t.department?.code}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{t.priority}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-amber-subtle text-amber text-[10px]">{t.status}</span>
                        </td>
                        <td className="p-3 text-secondary">{t.assignee?.name || 'Unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Tasks */}
        {activeTab === 'tasks' && (
          <div className="card p-0 overflow-hidden bg-surface border-subtle">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-muted text-xs">No execution tasks logged under this account.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                    <tr>
                      <th className="p-3">Task ID</th>
                      <th className="p-3">Title</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-subtle">
                    {tasks.map((task: any) => (
                      <tr 
                        key={task.id}
                        className="hover:bg-elevated/40 transition cursor-pointer"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                      >
                        <td className="p-3 font-mono font-bold text-accent">{task.taskId}</td>
                        <td className="p-3 font-medium text-primary">{task.title}</td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{task.status?.name}</span>
                        </td>
                        <td className="p-3">
                          <span className="badge bg-elevated text-[10px]">{task.priority?.name}</span>
                        </td>
                        <td className="p-3 text-secondary">{task.assignee?.name || 'Unassigned'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
