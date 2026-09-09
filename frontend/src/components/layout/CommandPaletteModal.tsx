import { useState, useEffect } from 'react';
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
  }>({ tasks: [], tickets: [], projects: [], customers: [] });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setResults({ tasks: [], tickets: [], projects: [], customers: [] });
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
          });
        } catch {
          // ignore
        } finally {
          setIsLoading(false);
        }
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setResults({ tasks: [], tickets: [], projects: [], customers: [] });
      setIsLoading(false);
    }
  }, [query]);

  if (!isOpen) return null;

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div className="modal-overlay z-50" onClick={onClose}>
      <div 
        className="modal-content max-w-xl p-0 overflow-hidden bg-surface border border-subtle shadow-2xl rounded-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3 border-b border-subtle gap-3">
          <Search size={18} className="text-muted shrink-0" />
          <input 
            type="text"
            className="w-full bg-transparent border-none text-primary text-sm focus:outline-none placeholder:text-muted"
            placeholder="Type a command, search tasks, tickets, customers or type to ask AI..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
          <kbd className="px-2 py-0.5 rounded text-[11px] font-mono bg-elevated border border-subtle text-muted">
            ESC
          </kbd>
        </div>

        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {/* Quick Actions if query is empty */}
          {query.trim().length < 2 && (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-muted px-2 uppercase tracking-wider">
                Quick Navigation & Actions
              </div>
              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => handleSelect('/my-work')}
              >
                <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-2">
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
                <div className="flex items-center gap-2">
                  <Plus size={14} className="text-blue" />
                  <span>Create a <strong>Task</strong></span>
                </div>
                <Plus size={12} className="text-muted" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                onClick={() => handleSelect('/ai-assistant')}
              >
                <div className="flex items-center gap-2">
                  <Bot size={14} className="text-purple" />
                  <span>Open <strong>AI Executive Assistant</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted" />
              </button>
            </div>
          )}

          {isLoading && (
            <div className="py-6 text-center text-xs text-muted">
              Searching SnapServe records...
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
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                  onClick={() => handleSelect(`/tasks/${task.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-accent text-[11px] font-semibold">{task.taskId}</span>
                    <span className="truncate">{task.title}</span>
                  </div>
                  <span className="badge text-[10px] bg-elevated border border-subtle">
                    {task.status?.name}
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
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                  onClick={() => handleSelect(`/tickets/${ticket.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-amber text-[11px] font-semibold">{ticket.ticketId}</span>
                    <span className="truncate">{ticket.title}</span>
                  </div>
                  <span className="badge text-[10px] bg-elevated border border-subtle">
                    {ticket.department?.code}
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
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                  onClick={() => handleSelect(`/projects/${p.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <FolderKanban size={14} className="text-blue shrink-0" />
                    <span className="truncate">{p.name}</span>
                  </div>
                  <span className="badge text-[10px] bg-blue-subtle text-blue">
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
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition"
                  onClick={() => handleSelect(`/customers/${c.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <Building size={14} className="text-green shrink-0" />
                    <span className="truncate">{c.name}</span>
                    <span className="text-[10px] text-muted">({c.code})</span>
                  </div>
                  <span className="badge text-[10px] bg-green-subtle text-green">
                    {c.tier}
                  </span>
                </button>
              ))}
            </div>
          )}

          {query.trim().length >= 2 && 
           results.tasks.length === 0 && 
           results.tickets.length === 0 && 
           results.projects.length === 0 && 
           results.customers.length === 0 && !isLoading && (
            <div className="py-6 text-center text-xs text-muted">
              No matching records found for "{query}".
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-elevated border-t border-subtle flex items-center justify-between text-[11px] text-muted">
          <span>Navigate with <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd></span>
          <span>Select with <kbd className="font-mono">↵</kbd></span>
        </div>
      </div>
    </div>
  );
}
