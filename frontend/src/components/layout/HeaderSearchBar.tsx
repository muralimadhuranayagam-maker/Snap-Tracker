import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  CheckSquare, 
  Ticket, 
  FolderKanban, 
  Building, 
  ArrowRight, 
  Bot, 
  Plus, 
  X,
  History
} from 'lucide-react';
import { api } from '../../services/api';
import { useAuthStore } from '../../store/authStore';

interface HeaderSearchBarProps {
  onOpenCreateTask?: () => void;
  onOpenRaiseTicket?: () => void;
}

export function HeaderSearchBar({ onOpenCreateTask, onOpenRaiseTicket }: HeaderSearchBarProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const isAdminOrSuper = user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<{
    tasks: any[];
    tickets: any[];
    projects: any[];
    customers: any[];
    users: any[];
  }>({ tasks: [], tickets: [], projects: [], customers: [], users: [] });

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut Cmd+K or Ctrl+K to focus top search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setIsFocused(true);
      } else if (e.key === 'Escape') {
        setIsFocused(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside listener to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time API search on query change
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
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setResults({ tasks: [], tickets: [], projects: [], customers: [], users: [] });
      setIsLoading(false);
    }
  }, [query]);

  const handleSelect = (path: string) => {
    navigate(path);
    setIsFocused(false);
    setQuery('');
  };

  const totalResultsCount = 
    results.tasks.length + 
    results.tickets.length + 
    results.projects.length + 
    results.customers.length + 
    results.users.length;

  const showDropdown = isFocused;

  return (
    <div ref={searchContainerRef} className="relative flex-1 max-w-lg">
      {/* Top Search Input Box */}
      <div 
        className={`search-bar flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
          isFocused ? 'bg-surface border-accent shadow-md' : 'bg-elevated/60 border-subtle hover:border-default'
        }`}
      >
        <Search size={15} className={`shrink-0 transition-colors ${isFocused ? 'text-accent' : 'text-muted'}`} />
        
        <input 
          ref={inputRef}
          type="text" 
          placeholder="Search tasks, projects, employees, tickets..." 
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          className="w-full bg-transparent border-none text-primary text-xs focus:outline-none placeholder:text-muted"
        />

        {isLoading ? (
          <div className="spinner spinner-xs text-accent shrink-0" />
        ) : query ? (
          <button 
            type="button"
            onClick={() => { setQuery(''); inputRef.current?.focus(); }}
            className="text-muted hover:text-primary shrink-0"
          >
            <X size={13} />
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-0.5 text-muted opacity-60 px-1.5 py-0.5 rounded bg-surface border border-subtle text-[10px] font-mono shrink-0">
            <span>⌘K</span>
          </div>
        )}
      </div>

      {/* Inline Floating Recommendations Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-surface border border-subtle shadow-2xl rounded-xl max-h-96 overflow-y-auto p-2 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          
          {/* Quick Actions when search query is empty */}
          {query.trim().length < 2 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-muted px-2.5 py-1 uppercase tracking-wider">
                Quick Navigation & Actions
              </div>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                onClick={() => handleSelect('/my-work')}
              >
                <div className="flex items-center gap-2.5">
                  <CheckSquare size={14} className="text-accent" />
                  <span>Go to <strong>My Work</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                onClick={() => handleSelect('/tasks/logs')}
              >
                <div className="flex items-center gap-2.5">
                  <History size={14} className="text-emerald-400" />
                  <span>View <strong>Task Status Change Logs</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </button>

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                onClick={() => {
                  setIsFocused(false);
                  onOpenRaiseTicket?.();
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Ticket size={14} className="text-amber" />
                  <span>Raise a <strong>Ticket</strong></span>
                </div>
                <Plus size={12} className="text-muted" />
              </button>

              {isAdminOrSuper && (
                <button
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => {
                    setIsFocused(false);
                    onOpenCreateTask?.();
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <Plus size={14} className="text-blue" />
                    <span>Create a <strong>Task</strong></span>
                  </div>
                  <Plus size={12} className="text-muted" />
                </button>
              )}

              <button
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                onClick={() => handleSelect('/ai-assistant')}
              >
                <div className="flex items-center gap-2.5">
                  <Bot size={14} className="text-purple" />
                  <span>Open <strong>AI Executive Assistant</strong></span>
                </div>
                <ArrowRight size={12} className="text-muted group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>
          )}

          {/* Results: Employees & Team Members */}
          {results.users.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted px-2.5 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Employees & Team Members</span>
                <span className="badge text-[9px] bg-elevated">{results.users.length}</span>
              </div>
              {results.users.map(u => (
                <button
                  key={u.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect('/team')}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-full bg-accent text-white flex items-center justify-center text-[10px] font-bold shrink-0 shadow-xs">
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
              <div className="text-[10px] font-bold text-muted px-2.5 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Tasks</span>
                <span className="badge text-[9px] bg-elevated">{results.tasks.length}</span>
              </div>
              {results.tasks.map(task => (
                <button
                  key={task.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect(`/tasks/${task.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-accent text-[11px] font-bold shrink-0">{task.taskId}</span>
                    <span className="truncate group-hover:text-accent transition-colors">{task.title}</span>
                  </div>
                  <span className="badge text-[10px] bg-elevated border border-subtle shrink-0">
                    {task.status?.name?.replace('_', ' ')}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results: Tickets */}
          {results.tickets.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted px-2.5 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Tickets</span>
                <span className="badge text-[9px] bg-elevated">{results.tickets.length}</span>
              </div>
              {results.tickets.map(ticket => (
                <button
                  key={ticket.id}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-elevated flex items-center justify-between text-xs text-secondary hover:text-primary transition group"
                  onClick={() => handleSelect(`/tickets/${ticket.id}`)}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono text-amber text-[11px] font-bold shrink-0">{ticket.ticketId}</span>
                    <span className="truncate group-hover:text-amber transition-colors">{ticket.title}</span>
                  </div>
                  <span className="badge text-[10px] bg-elevated border border-subtle shrink-0">
                    {ticket.department?.code || 'TICKET'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results: Projects */}
          {results.projects.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted px-2.5 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Projects</span>
                <span className="badge text-[9px] bg-elevated">{results.projects.length}</span>
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
                  <span className="badge text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
                    {p.status}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Results: Customers */}
          {results.customers.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-muted px-2.5 mb-1 uppercase tracking-wider flex items-center justify-between">
                <span>Customers</span>
                <span className="badge text-[9px] bg-elevated">{results.customers.length}</span>
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
                  <span className="badge text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                    {c.tier}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {query.trim().length >= 2 && totalResultsCount === 0 && !isLoading && (
            <div className="py-8 text-center text-xs text-muted">
              No matching tasks, projects, employees, tickets, or customers found for "{query}".
            </div>
          )}
        </div>
      )}
    </div>
  );
}
