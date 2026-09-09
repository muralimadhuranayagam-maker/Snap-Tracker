import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Ticket, 
  Plus, 
  Search, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  ExternalLink,
  ShieldAlert
} from 'lucide-react';
import { api } from '../services/api';
import { RaiseTicketModal } from '../components/tickets/RaiseTicketModal';
import { formatDistanceToNow } from 'date-fns';

export function TicketsPage() {
  const navigate = useNavigate();
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');

  const [viewFilter, setViewFilter] = useState<'all' | 'unassigned' | 'assigned' | 'in_progress' | 'blocked' | 'sla_risk' | 'resolved'>('all');

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets', search, statusFilter, priorityFilter, departmentFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (statusFilter) params.append('status', statusFilter);
      if (priorityFilter) params.append('priority', priorityFilter);
      if (departmentFilter) params.append('departmentId', departmentFilter);
      return api.get(`/tickets?${params.toString()}`).then(r => r.data);
    },
    refetchInterval: 15_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then(r => r.data),
  });

  const breachedCount = tickets.filter((t: any) => t.slaBreached).length;
  const unassignedCount = tickets.filter((t: any) => !t.assigneeId && !['RESOLVED', 'CLOSED'].includes(t.status)).length;
  const inProgressCount = tickets.filter((t: any) => t.status === 'IN_PROGRESS').length;
  const blockedCount = tickets.filter((t: any) => ['BLOCKED', 'WAITING'].includes(t.status)).length;
  const resolvedCount = tickets.filter((t: any) => ['RESOLVED', 'CLOSED'].includes(t.status)).length;

  const displayedTickets = tickets.filter((t: any) => {
    if (viewFilter === 'unassigned') return !t.assigneeId && !['RESOLVED', 'CLOSED'].includes(t.status);
    if (viewFilter === 'assigned') return t.assigneeId && !['RESOLVED', 'CLOSED'].includes(t.status);
    if (viewFilter === 'in_progress') return t.status === 'IN_PROGRESS';
    if (viewFilter === 'blocked') return ['BLOCKED', 'WAITING'].includes(t.status);
    if (viewFilter === 'sla_risk') return t.slaBreached;
    if (viewFilter === 'resolved') return ['RESOLVED', 'CLOSED'].includes(t.status);
    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Tickets</h1>
            <span className="badge bg-elevated font-mono text-xs text-muted">{tickets.length} total</span>
            {breachedCount > 0 && (
              <span className="badge bg-red-subtle text-red border border-red/30 text-xs flex items-center gap-1 font-semibold">
                <ShieldAlert size={12} /> {breachedCount} SLA Breached
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Operational service desk, customer requests, and conversion pipeline to tasks.
          </p>
        </div>

        <button 
          className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
          onClick={() => setIsRaiseModalOpen(true)}
        >
          <Plus size={14} />
          <span>Raise Ticket</span>
        </button>
      </div>

      {/* Service Desk Queue Tabs */}
      <div className="flex items-center gap-1.5 border-b border-subtle pb-2 overflow-x-auto">
        <button
          className={`btn btn-sm text-xs ${viewFilter === 'all' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewFilter('all')}
        >
          All Tickets ({tickets.length})
        </button>
        <button
          className={`btn btn-sm text-xs ${viewFilter === 'unassigned' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewFilter('unassigned')}
        >
          Unassigned ({unassignedCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${viewFilter === 'in_progress' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewFilter('in_progress')}
        >
          In Progress ({inProgressCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${viewFilter === 'blocked' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewFilter('blocked')}
        >
          Waiting / Blocked ({blockedCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${viewFilter === 'sla_risk' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewFilter('sla_risk')}
        >
          SLA Breached ({breachedCount})
        </button>
        <button
          className={`btn btn-sm text-xs ${viewFilter === 'resolved' ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setViewFilter('resolved')}
        >
          Resolved ({resolvedCount})
        </button>
      </div>

      {/* Filter Bar */}
      <div className="card p-3 bg-surface border-subtle flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search tickets by ID, title, or details..."
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
          <option value="NEW">NEW</option>
          <option value="ASSIGNED">ASSIGNED</option>
          <option value="IN_PROGRESS">IN_PROGRESS</option>
          <option value="WAITING">WAITING</option>
          <option value="BLOCKED">BLOCKED</option>
          <option value="RESOLVED">RESOLVED</option>
          <option value="CLOSED">CLOSED</option>
        </select>

        <select 
          className="input text-xs py-1.5"
          value={priorityFilter}
          onChange={e => setPriorityFilter(e.target.value)}
        >
          <option value="">All Priorities</option>
          <option value="CRITICAL">CRITICAL</option>
          <option value="HIGH">HIGH</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="LOW">LOW</option>
        </select>

        <select 
          className="input text-xs py-1.5"
          value={departmentFilter}
          onChange={e => setDepartmentFilter(e.target.value)}
        >
          <option value="">All Departments</option>
          {departments.map((d: any) => (
            <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
          ))}
        </select>

        {(search || statusFilter || priorityFilter || departmentFilter) && (
          <button 
            className="btn btn-ghost btn-xs text-xs text-muted hover:text-primary"
            onClick={() => {
              setSearch('');
              setStatusFilter('');
              setPriorityFilter('');
              setDepartmentFilter('');
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Tickets Table */}
      <div className="card p-0 overflow-hidden bg-surface border-subtle">
        {isLoading ? (
          <div className="py-16 text-center">
            <div className="spinner spinner-md mx-auto" />
            <div className="text-xs text-muted mt-2">Loading tickets...</div>
          </div>
        ) : displayedTickets.length === 0 ? (
          <div className="py-16 text-center text-muted text-xs">
            <Ticket size={28} className="mx-auto mb-2 opacity-40" />
            No tickets match this queue or filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-elevated border-b border-subtle text-muted text-[11px] font-semibold uppercase">
                <tr>
                  <th className="p-3">Ticket ID</th>
                  <th className="p-3">Title</th>
                  <th className="p-3">Customer</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">SLA Status</th>
                  <th className="p-3">Assignee</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {displayedTickets.map((ticket: any) => {
                  const isResolved = ['RESOLVED', 'CLOSED'].includes(ticket.status);
                  return (
                    <tr 
                      key={ticket.id}
                      className="hover:bg-elevated/40 transition cursor-pointer"
                      onClick={() => navigate(`/tickets/${ticket.id}`)}
                    >
                      <td className="p-3 font-mono font-bold text-amber whitespace-nowrap">
                        {ticket.ticketId}
                      </td>
                      <td className="p-3 font-medium text-primary">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate max-w-sm">{ticket.title}</span>
                          {ticket.linkedTasks?.length > 0 && (
                            <span className="badge bg-purple-subtle text-purple border border-purple/30 text-[10px]">
                              {ticket.linkedTasks.length} task
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-secondary whitespace-nowrap">
                        {ticket.customer?.name || '—'}
                      </td>
                      <td className="p-3">
                        <span className="badge bg-elevated text-[11px] font-mono">
                          {ticket.department?.code || 'GEN'}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`badge text-[11px] font-semibold ${
                          ticket.priority === 'CRITICAL' ? 'bg-red-subtle text-red border border-red/30' :
                          ticket.priority === 'HIGH' ? 'bg-amber-subtle text-amber border border-amber/30' :
                          'bg-elevated text-secondary'
                        }`}>
                          {ticket.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`badge text-[11px] ${
                          ticket.status === 'RESOLVED' ? 'bg-green-subtle text-green' :
                          ticket.status === 'NEW' ? 'bg-blue-subtle text-blue' :
                          ticket.status === 'BLOCKED' ? 'bg-red-subtle text-red' :
                          'bg-amber-subtle text-amber'
                        }`}>
                          {ticket.status}
                        </span>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {isResolved ? (
                          <span className="badge bg-green-subtle text-green text-[10px] flex items-center gap-1 w-fit">
                            <CheckCircle2 size={10} /> Resolved
                          </span>
                        ) : ticket.slaBreached ? (
                          <span className="badge bg-red-subtle text-red border border-red/30 text-[10px] flex items-center gap-1 w-fit font-bold">
                            <AlertTriangle size={10} /> Breached
                          </span>
                        ) : ticket.slaTarget ? (
                          <span className="text-[11px] text-muted flex items-center gap-1">
                            <Clock size={11} className="text-amber" />
                            {formatDistanceToNow(new Date(ticket.slaTarget), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted">—</span>
                        )}
                      </td>
                      <td className="p-3 text-secondary whitespace-nowrap">
                        {ticket.assignee?.name || (
                          <span className="text-muted italic">Unassigned</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <button className="btn btn-ghost btn-xs text-accent">
                          <ExternalLink size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RaiseTicketModal 
        isOpen={isRaiseModalOpen}
        onClose={() => setIsRaiseModalOpen(false)}
      />
    </div>
  );
}
