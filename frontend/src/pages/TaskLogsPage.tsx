import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useWebSocket } from '../context/WebSocketContext';
import { 
  ArrowLeft, 
  Search, 
  History, 
  CheckCircle2, 
  AlertCircle, 
  UserCheck, 
  ArrowRight,
  RefreshCw,
  Clock,
  Filter,
  Activity,
  Layers,
  LayoutList,
  X
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

interface StatusConfig {
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  BACKLOG: { 
    label: 'BACKLOG', 
    dotColor: '#94a3b8',
    bgColor: 'rgba(148, 163, 184, 0.1)',
    textColor: '#94a3b8',
    borderColor: 'rgba(148, 163, 184, 0.2)'
  },
  TODO: { 
    label: 'TODO', 
    dotColor: '#3b82f6',
    bgColor: 'rgba(59, 130, 246, 0.1)',
    textColor: '#3b82f6',
    borderColor: 'rgba(59, 130, 246, 0.2)'
  },
  IN_PROGRESS: { 
    label: 'IN PROGRESS', 
    dotColor: '#eab308',
    bgColor: 'rgba(234, 179, 8, 0.1)',
    textColor: '#eab308',
    borderColor: 'rgba(234, 179, 8, 0.2)'
  },
  IN_REVIEW: { 
    label: 'IN REVIEW', 
    dotColor: '#f97316',
    bgColor: 'rgba(249, 115, 22, 0.1)',
    textColor: '#f97316',
    borderColor: 'rgba(249, 115, 22, 0.2)'
  },
  BLOCKED: { 
    label: 'BLOCKED', 
    dotColor: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    textColor: '#ef4444',
    borderColor: 'rgba(239, 68, 68, 0.2)'
  },
  DONE: { 
    label: 'COMPLETED', 
    dotColor: '#22c55e',
    bgColor: 'rgba(34, 197, 94, 0.1)',
    textColor: '#22c55e',
    borderColor: 'rgba(34, 197, 94, 0.2)'
  },
};

export function TaskLogsPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('table');
  const { isConnected, lastEvent } = useWebSocket();

  // Fetch status history logs
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['task-status-logs'],
    queryFn: async () => {
      const res = await api.get('/tasks/logs/status-history');
      return res.data;
    },
    refetchInterval: 3000,
  });

  // Listen to WebSocket task events for instant real-time update
  useEffect(() => {
    if (lastEvent?.type?.startsWith('TASK_')) {
      refetch();
    }
  }, [lastEvent, refetch]);

  const logs: any[] = data?.logs || [];

  // Filter logs locally
  const filteredLogs = logs.filter(log => {
    const matchesSearch = !searchQuery || 
      log.logNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.taskDisplayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.taskTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = !statusFilter || log.newStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate analytics
  const totalLogs = logs.length;
  const completedMoves = logs.filter(l => l.newStatus === 'DONE').length;
  const blockedMoves = logs.filter(l => l.newStatus === 'BLOCKED').length;
  const uniqueUsersCount = new Set(logs.map(l => l.userId).filter(Boolean)).size;
  const completedPct = totalLogs > 0 ? Math.round((completedMoves / totalLogs) * 100) : 0;

  const renderStatusBadge = (statusKey: string) => {
    const config = STATUS_CONFIG[statusKey] || {
      label: statusKey === 'DONE' ? 'COMPLETED' : statusKey.replace('_', ' '),
      dotColor: '#94a3b8',
      bgColor: 'rgba(148, 163, 184, 0.1)',
      textColor: '#94a3b8',
      borderColor: 'rgba(148, 163, 184, 0.2)',
    };

    return (
      <span 
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wide transition-all shadow-xs"
        style={{
          backgroundColor: config.bgColor,
          color: config.textColor,
          border: `1px solid ${config.borderColor}`
        }}
      >
        <span 
          className="w-2 h-2 rounded-full shrink-0 animate-pulse" 
          style={{ backgroundColor: config.dotColor }}
        />
        {config.label}
      </span>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-7xl mx-auto pb-16">
      {/* Top Header & Navigation Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface p-5 rounded-2xl border border-subtle shadow-sm">
        {/* Left Side: Title & Subtitle */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-blue-500/20 text-accent border border-accent/20 flex items-center justify-center shadow-inner shrink-0">
            <Activity size={20} className="text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-primary">
                Task Status Audit Trail
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-accent/10 text-accent border border-accent/20">
                {totalLogs} records
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Real-time tracking of drag-and-drop column transitions across all workspace tasks.
            </p>
          </div>
        </div>

        {/* Right Side: Status Indicator, Refresh, & Back Button */}
        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
          {/* Live Sync Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-elevated border border-subtle text-xs font-medium text-secondary">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-ping' : 'bg-amber-500'}`} />
            <span className="text-[11px] font-semibold text-muted">
              {isConnected ? 'Real-Time Sync Active' : 'Connecting...'}
            </span>
          </div>

          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 shadow-sm text-xs border border-subtle hover:border-accent/40"
            title="Force refresh status logs"
          >
            <RefreshCw size={13} className={isFetching ? 'animate-spin text-accent' : ''} />
            Refresh
          </button>

          <button
            onClick={() => navigate('/tasks')}
            className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-md text-xs font-semibold"
          >
            <ArrowLeft size={13} />
            Back to Task Board
          </button>
        </div>
      </div>

      {/* KPI Analytics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="relative overflow-hidden bg-surface p-4 rounded-xl border border-subtle shadow-sm hover:border-accent/30 transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl group-hover:bg-blue-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted tracking-wide uppercase">Total Transitions</span>
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
              <Layers size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-primary">{totalLogs}</span>
            <span className="text-xs text-muted">updates logged</span>
          </div>
          <div className="mt-3 w-full bg-elevated h-1 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full rounded-full" style={{ width: '100%' }} />
          </div>
        </div>

        {/* Card 2 */}
        <div className="relative overflow-hidden bg-surface p-4 rounded-xl border border-subtle shadow-sm hover:border-emerald-500/30 transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl group-hover:bg-emerald-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted tracking-wide uppercase">Moved to Completed</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">{completedMoves}</span>
            <span className="text-xs text-emerald-500 font-semibold">{completedPct}% of total</span>
          </div>
          <div className="mt-3 w-full bg-elevated h-1 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${completedPct}%` }} />
          </div>
        </div>

        {/* Card 3 */}
        <div className="relative overflow-hidden bg-surface p-4 rounded-xl border border-subtle shadow-sm hover:border-rose-500/30 transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted tracking-wide uppercase">Blocked Alerts</span>
            <div className="w-9 h-9 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
              <AlertCircle size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-rose-400">{blockedMoves}</span>
            <span className="text-xs text-muted">stalled items</span>
          </div>
          <div className="mt-3 w-full bg-elevated h-1 rounded-full overflow-hidden">
            <div className="bg-rose-500 h-full rounded-full" style={{ width: `${totalLogs > 0 ? (blockedMoves / totalLogs) * 100 : 0}%` }} />
          </div>
        </div>

        {/* Card 4 */}
        <div className="relative overflow-hidden bg-surface p-4 rounded-xl border border-subtle shadow-sm hover:border-amber-500/30 transition-all group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all" />
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted tracking-wide uppercase">Active Contributors</span>
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400">{uniqueUsersCount}</span>
            <span className="text-xs text-muted">team members</span>
          </div>
          <div className="mt-3 w-full bg-elevated h-1 rounded-full overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: '80%' }} />
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filter, & View Mode Switcher */}
      <div className="flex flex-col lg:flex-row items-center justify-between gap-3 bg-surface p-3.5 rounded-2xl border border-subtle shadow-sm">
        {/* Search Bar */}
        <div className="relative flex-1 w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none z-10" />
          <input
            type="text"
            placeholder="Search logs by ID (e.g. LOG-1014), task name, or team member..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input text-xs pr-8 py-2 w-full bg-elevated/50 focus:bg-elevated border-subtle"
            style={{ paddingLeft: '2.25rem' }}
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-primary z-10"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Target Status Filter */}
        <div className="flex items-center gap-2 w-full lg:w-auto shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted font-medium pl-1">
            <Filter size={13} /> Target Status:
          </div>
          <select
            className="input text-xs py-2 pr-8 bg-elevated/50 border-subtle"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="">All Column Targets</option>
            <option value="DONE">Moved to COMPLETED</option>
            <option value="IN_PROGRESS">Moved to IN PROGRESS</option>
            <option value="IN_REVIEW">Moved to IN REVIEW</option>
            <option value="BLOCKED">Moved to BLOCKED</option>
            <option value="TODO">Moved to TODO</option>
            <option value="BACKLOG">Moved to BACKLOG</option>
          </select>

          {/* View Mode Switcher */}
          <div className="flex bg-elevated rounded-lg p-0.5 border border-subtle shrink-0">
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === 'table' ? 'bg-surface shadow-xs text-primary' : 'text-muted hover:text-primary'}`}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <LayoutList size={13} />
              Table
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${viewMode === 'timeline' ? 'bg-surface shadow-xs text-primary' : 'text-muted hover:text-primary'}`}
              onClick={() => setViewMode('timeline')}
              title="Timeline Activity Feed"
            >
              <History size={13} />
              Timeline
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="card flex flex-col items-center justify-center py-20 gap-3 border border-subtle">
          <div className="spinner spinner-lg text-accent"></div>
          <span className="text-xs text-muted font-medium">Fetching real-time status audit trail...</span>
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center border border-subtle bg-surface/50">
          <div className="w-16 h-16 rounded-2xl bg-elevated border border-subtle flex items-center justify-center text-muted mb-4 shadow-inner">
            <History size={28} />
          </div>
          <h3 className="text-sm font-bold text-primary">No Matching Status Logs</h3>
          <p className="text-xs text-muted max-w-md mt-1">
            {searchQuery || statusFilter 
              ? 'No audit log entries matched your current search filters.'
              : 'Drag and drop any task card on the Kanban board to automatically record real-time status transitions.'}
          </p>
          {(searchQuery || statusFilter) && (
            <button
              onClick={() => { setSearchQuery(''); setStatusFilter(''); }}
              className="btn btn-secondary btn-sm mt-4 text-xs"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* Executive Table View */
        <div className="card overflow-hidden border border-subtle shadow-sm bg-surface">
          <div className="table-responsive">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-elevated/70 border-b border-subtle text-[11px] font-bold text-muted uppercase tracking-wider">
                  <th className="py-3.5 px-4" style={{ width: '120px' }}>Log Record</th>
                  <th className="py-3.5 px-4">User (Performed By)</th>
                  <th className="py-3.5 px-4">Target Task</th>
                  <th className="py-3.5 px-4">Workflow Transition</th>
                  <th className="py-3.5 px-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle/60 text-xs">
                {filteredLogs.map(log => {
                  const createdDate = new Date(log.createdAt);
                  const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true });
                  const formattedTime = format(createdDate, 'MMM d, yyyy • h:mm:ss a');

                  return (
                    <tr 
                      key={log.id} 
                      className="hover:bg-elevated/40 transition-colors group"
                    >
                      {/* Log Number */}
                      <td className="py-4 px-4 font-mono text-xs font-bold">
                        <span className="px-2.5 py-1 rounded-md bg-elevated border border-subtle text-accent shadow-xs group-hover:border-accent/40 transition-colors">
                          {log.logNumber}
                        </span>
                      </td>

                      {/* User Card */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border border-subtle text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
                            {log.userAvatar ? (
                              <img src={log.userAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              log.userName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-primary group-hover:text-accent transition-colors flex items-center gap-1.5">
                              {log.userName}
                              {log.userTitle && (
                                <span className="text-[10px] text-muted font-normal">({log.userTitle})</span>
                              )}
                            </div>
                            <div className="text-[11px] text-muted">{log.userEmail || 'System user'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Task Link */}
                      <td className="py-4 px-4">
                        <div 
                          className="cursor-pointer group/task"
                          onClick={() => navigate(`/tasks/${log.taskId}`)}
                        >
                          <span className="font-mono text-xs font-bold text-accent group-hover/task:underline">
                            {log.taskDisplayId}
                          </span>
                          <div className="font-medium text-primary text-xs line-clamp-1 max-w-sm group-hover/task:text-accent transition-colors">
                            {log.taskTitle}
                          </div>
                        </div>
                      </td>

                      {/* Transition Pills */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(log.oldStatus)}
                          <div className="w-5 h-5 rounded-full bg-elevated border border-subtle flex items-center justify-center shrink-0">
                            <ArrowRight size={11} className="text-muted" />
                          </div>
                          {renderStatusBadge(log.newStatus)}
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5 font-semibold text-secondary" title={formattedTime}>
                          <Clock size={12} className="text-muted" />
                          {timeAgo}
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">{formattedTime}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Timeline Feed View */
        <div className="relative pl-6 space-y-6 before:absolute before:left-3.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-subtle">
          {filteredLogs.map((log) => {
            const createdDate = new Date(log.createdAt);
            const timeAgo = formatDistanceToNow(createdDate, { addSuffix: true });
            const formattedTime = format(createdDate, 'MMM d, yyyy • h:mm a');

            return (
              <div key={log.id} className="relative flex items-start gap-4 group">
                {/* Node Dot */}
                <div className="absolute -left-6 top-1.5 w-7 h-7 rounded-full bg-surface border-2 border-accent flex items-center justify-center shadow-md">
                  <div className="w-2 h-2 rounded-full bg-accent" />
                </div>

                {/* Card Feed */}
                <div className="flex-1 bg-surface p-4 rounded-xl border border-subtle shadow-sm hover:border-accent/40 transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-subtle pb-3 mb-3">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-accent px-2 py-0.5 rounded bg-elevated border border-subtle">
                        {log.logNumber}
                      </span>
                      <span className="text-xs font-bold text-primary">{log.userName}</span>
                      <span className="text-xs text-muted">updated task</span>
                      <button 
                        onClick={() => navigate(`/tasks/${log.taskId}`)}
                        className="font-mono text-xs font-bold text-accent hover:underline"
                      >
                        {log.taskDisplayId}
                      </button>
                    </div>

                    <div className="text-xs text-muted flex items-center gap-1" title={formattedTime}>
                      <Clock size={12} />
                      {timeAgo}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="text-xs text-secondary font-medium">
                      "{log.taskTitle}"
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {renderStatusBadge(log.oldStatus)}
                      <ArrowRight size={12} className="text-muted" />
                      {renderStatusBadge(log.newStatus)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
