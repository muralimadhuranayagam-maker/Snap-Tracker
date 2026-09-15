import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, CheckSquare, Ticket, FolderKanban, Building, ArrowRight, Bot, Plus } from 'lucide-react';
import { api } from '../../services/api';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCreateTask?: () => void;
  onOpenRaiseTicket?: () => void;
}

export function CommandPaletteModal({
  isOpen,
  onClose,
  onOpenCreateTask,
  onOpenRaiseTicket
}: CommandPaletteModalProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{
    tasks: any[];
    tickets: any[];
    projects: any[];
    customers: any[];
    users: any[];
  }>({ tasks: [], tickets: [], projects: [], customers: [], users: [] });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults({ tasks: [], tickets: [], projects: [], customers: [], users: [] });
    }
  }, [isOpen]);

  useEffect(() => {
    if (query.trim().length >= 2) {
      setIsLoading(true);
      const timer = setTimeout(async () => {
        try {
          const res = await api.get(`/search?q=${encodeURIComponent(query)}`);
          setResults({
            tasks: res.data.tasks || [],
            tickets: res.data.tickets || [],
            projects: res.data.projects || [],
            customers: res.data.customers || [],
            users: res.data.users || [],
          });
        } catch {
          // ignore
        } finally {
          setIsLoading(false);
        }
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setResults({ tasks: [], tickets: [], projects: [], customers: [], users: [] });
      setIsLoading(false);
    }
  }, [query]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  const totalResultsCount = 
    results.tasks.length + 
    results.tickets.length + 
    results.projects.length + 
    results.customers.length + 
    results.users.length;

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
        padding: '20px',
        overflowY: 'auto'
      }}
      onClick={onClose}
    >
      <div 
        className="modal-content max-w-xl p-0 overflow-hidden bg-surface border border-subtle shadow-2xl rounded-2xl my-auto"
        style={{ backgroundColor: 'var(--bg-surface)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center px-4 py-3.5 border-b border-subtle gap-3 bg-elevated/40">
          <Search size={18} className="text-muted shrink-0" />
          <input 
            type="text"
            className="w-full bg-transparent border-none text-primary text-sm focus:outline-none placeholder:text-muted"
            placeholder="Search tasks, tickets, projects, employees, or customers..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <kbd className="px-2 py-0.5 rounded text-[11px] font-mono bg-elevated border border-subtle text-muted shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results / Suggestions Area */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {/* Quick Actions if query is empty */}
          {query.trim().length < 2 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-muted px-2 py-1 uppercase tracking-wider">
                Quick Navigation & Actions
              </div>
              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => handleSelect('/my-work')}
              >
                <div className="flex items-center gap-2.5">
                  <CheckSquare size={14} className="text-accent" />
                  <span>Go to <strong>My Work</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => {
                  onClose();
                  onOpenRaiseTicket?.();
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Ticket size={14} className="text-amber" />
                  <span>Raise a <strong>Ticket</strong></span>
                </div>
                <Plus size={12} className="text-muted" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => {
                  onClose();
                  onOpenCreateTask?.();
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Plus size={14} className="text-blue" />
                  <span>Create a <strong>Task</strong></span>
                </div>
                <Plus size={12} className="text-muted" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => handleSelect('/tasks/logs')}
              >
                <div className="flex items-center gap-2.5">
                  <CheckSquare size={14} className="text-emerald-400" />
                  <span>View <strong>Task Status Change Logs</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => handleSelect('/ai-assistant')}
              >
                <div className="flex items-center gap-2.5">
                  <Bot size={14} className="text-purple" />
                  <span>Open <strong>AI Executive Assistant</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted" />
              </button>
            </div>
          )}

          {isLoading && (
            <div className="py-8 text-center text-xs text-muted flex items-center justify-center gap-2">
              <div className="spinner spinner-sm" />
              <span>Searching tasks, projects, employees, tickets & customers...</span>
            </div>
          )}

          {/* Results: Employees & Team Members */}
          {results.users.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted px-2 mb-1 uppercase tracking-wider">
                Employees & Team Members ({results.users.length})
              </div>
              {results.users.map(u => (
                <button
                  key={u.id}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect('/team')}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                      {u.avatar ? (
                        <img src={u.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                      ) : (
                        u.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="truncate">
                      <span className="font-bold text-primary group-hover:text-accent transition-colors">{u.name}</span>
                      <span className="text-[11px] text-muted ml-2">{u.title || u.email}</span>
                    </div>
                  </div>
                  {u.department?.code && (
                    <span className="badge text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                      {u.department.code}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Results: Tasks */}
          {results.tasks.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted px-2 mb-1 uppercase tracking-wider">
                Tasks ({results.tasks.length})
              </div>
              {results.tasks.map(task => (
                <button
                  key={task.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect(`/tasks/${task.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-accent text-[11px] font-bold">{task.taskId}</span>
                    <span className="truncate group-hover:text-accent transition-colors">{task.title}</span>
                  </div>
                  <span className="badge text-[10px] bg-elevated border border-subtle">
                    {task.status?.name?.replace('_', ' ')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results: Tickets */}
          {results.tickets.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted px-2 mb-1 uppercase tracking-wider">
                Tickets ({results.tickets.length})
              </div>
              {results.tickets.map(ticket => (
                <button
                  key={ticket.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect(`/tickets/${ticket.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-amber text-[11px] font-bold">{ticket.ticketId}</span>
                    <span className="truncate group-hover:text-amber transition-colors">{ticket.title}</span>
                  </div>
                  <span className="badge text-[10px] bg-elevated border border-subtle">
                    {ticket.department?.code || 'TICKET'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results: Projects */}
          {results.projects.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted px-2 mb-1 uppercase tracking-wider">
                Projects ({results.projects.length})
              </div>
              {results.projects.map(p => (
                <button
                  key={p.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect(`/projects/${p.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FolderKanban size={14} className="text-blue shrink-0" />
                    <span className="truncate font-semibold group-hover:text-blue transition-colors">{p.name}</span>
                  </div>
                  <span className="badge text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {p.status}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results: Customers */}
          {results.customers.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-muted px-2 mb-1 uppercase tracking-wider">
                Customers ({results.customers.length})
              </div>
              {results.customers.map(c => (
                <button
                  key={c.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect(`/customers/${c.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Building size={14} className="text-emerald-400 shrink-0" />
                    <span className="truncate font-semibold group-hover:text-emerald-400 transition-colors">{c.name}</span>
                    <span className="text-[10px] text-muted">({c.code})</span>
                  </div>
                  <span className="badge text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {c.tier}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {query.trim().length >= 2 && totalResultsCount === 0 && !isLoading && (
            <div className="py-10 text-center text-xs text-muted">
              No matching tasks, tickets, projects, employees, or customers found for "{query}".
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-elevated border-t border-subtle flex items-center justify-between text-[11px] text-muted">
          <span>Search dynamically across tasks, projects, employees & tickets</span>
          <span>Press <kbd className="font-mono bg-surface px-1 rounded border border-subtle">ESC</kbd> to close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
