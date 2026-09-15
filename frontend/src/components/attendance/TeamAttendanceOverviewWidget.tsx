import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Camera, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  ChevronRight, 
  Search
} from 'lucide-react';
import api from '../../lib/api';
import { DailyActivityInspectorModal } from './DailyActivityInspectorModal';

export function TeamAttendanceOverviewWidget() {
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'CHECKED_IN' | 'CHECKED_OUT' | 'NOT_STARTED'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['attendance-overview', selectedDate],
    queryFn: async () => {
      const res = await api.get('/attendance/overview', {
        params: { date: selectedDate },
      });
      return res.data;
    },
    refetchInterval: 30000,
  });

  const roster = data?.roster || [];
  const stats = data?.stats || {
    totalEmployees: 0,
    checkedInCount: 0,
    checkedOutCount: 0,
    notStartedCount: 0,
  };

  const filteredRoster = roster.filter((item: any) => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchName = item.user?.name?.toLowerCase().includes(q);
      const matchEmail = item.user?.email?.toLowerCase().includes(q);
      const matchDept = item.user?.department?.name?.toLowerCase().includes(q);
      return matchName || matchEmail || matchDept;
    }
    return true;
  });

  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return '--:--';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '--:--';
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="card-header border-b border-subtle pb-4 mb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Camera size={18} />
            </div>
            <h3 className="font-semibold text-lg text-primary">Team Attendance & Daily Activity Roster</h3>
            <span className="badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs">
              {stats.checkedInCount} Active In Shift
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Mandatory morning webcam verification & evening shift activity submission. Click any team member to inspect their full day report.
          </p>
        </div>

        {/* Date Selector & Search */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 bg-surface border border-subtle rounded-lg px-2.5 py-1.5 text-xs shadow-sm">
            <Calendar size={13} className="text-muted" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-xs text-primary focus:outline-none cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div 
          onClick={() => setStatusFilter('ALL')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            statusFilter === 'ALL' ? 'bg-surface-hover border-primary/50 shadow-sm' : 'bg-surface border-subtle hover:border-subtle/80'
          }`}
        >
          <div className="text-[11px] font-medium text-muted uppercase tracking-wider">Total Team</div>
          <div className="text-xl font-bold text-primary mt-1">{stats.totalEmployees}</div>
          <div className="text-[10px] text-muted mt-0.5">Active workforce</div>
        </div>

        <div 
          onClick={() => setStatusFilter('CHECKED_IN')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            statusFilter === 'CHECKED_IN' ? 'bg-emerald-500/15 border-emerald-500/50 shadow-sm' : 'bg-surface border-subtle hover:border-emerald-500/30'
          }`}
        >
          <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            In Shift
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{stats.checkedInCount}</div>
          <div className="text-[10px] text-muted mt-0.5">Currently working</div>
        </div>

        <div 
          onClick={() => setStatusFilter('CHECKED_OUT')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            statusFilter === 'CHECKED_OUT' ? 'bg-blue-500/15 border-blue-500/50 shadow-sm' : 'bg-surface border-subtle hover:border-blue-500/30'
          }`}
        >
          <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 size={12} className="text-blue-500" />
            Shift Concluded
          </div>
          <div className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-1">{stats.checkedOutCount}</div>
          <div className="text-[10px] text-muted mt-0.5">Report submitted</div>
        </div>

        <div 
          onClick={() => setStatusFilter('NOT_STARTED')}
          className={`p-3 rounded-lg border cursor-pointer transition-all ${
            statusFilter === 'NOT_STARTED' ? 'bg-amber-500/15 border-amber-500/50 shadow-sm' : 'bg-surface border-subtle hover:border-amber-500/30'
          }`}
        >
          <div className="text-[11px] font-medium text-muted uppercase tracking-wider flex items-center gap-1">
            <AlertCircle size={12} className="text-amber" />
            Not Started
          </div>
          <div className="text-xl font-bold text-primary mt-1">{stats.notStartedCount}</div>
          <div className="text-[10px] text-muted mt-0.5">Pending morning check-in</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search employee by name, department, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input input-sm pl-8 w-full bg-surface"
          />
        </div>
      </div>

      {/* Roster Cards Grid */}
      {isLoading ? (
        <div className="py-12 text-center text-muted flex flex-col items-center justify-center space-y-2">
          <span className="spinner-border animate-spin inline-block w-5 h-5 border-2 rounded-full border-primary border-r-transparent" />
          <span className="text-xs">Loading attendance roster & camera verification records...</span>
        </div>
      ) : filteredRoster.length === 0 ? (
        <div className="p-8 text-center bg-surface border border-dashed border-subtle rounded-xl text-xs text-muted">
          No employee records match the selected filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredRoster.map((item: any) => {
            const att = item.attendance;
            const summary = att?.summary;
            const isCheckedIn = item.status === 'CHECKED_IN';
            const isCheckedOut = item.status === 'CHECKED_OUT';

            return (
              <div
                key={item.user.id}
                onClick={() => setInspectUserId(item.user.id)}
                className="p-3.5 rounded-xl border border-subtle bg-surface hover:border-primary/50 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
              >
                {/* Top: Avatar & User Info */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full overflow-hidden border border-subtle bg-surface-hover shrink-0 flex items-center justify-center font-bold text-xs text-primary">
                        {item.user.avatar ? (
                          <img src={item.user.avatar} alt={item.user.name} className="w-full h-full object-cover" />
                        ) : (
                          item.user.name?.charAt(0)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-primary group-hover:text-blue transition-colors truncate">
                          {item.user.name}
                        </div>
                        <div className="text-xs text-muted truncate">
                          {item.user.department?.name || 'General'}
                        </div>
                      </div>
                    </div>

                    {/* Status Badge */}
                    {isCheckedIn ? (
                      <span className="badge bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        In Shift
                      </span>
                    ) : isCheckedOut ? (
                      <span className="badge bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px] font-semibold flex items-center gap-1 shrink-0">
                        <CheckCircle2 size={11} className="text-blue-500" />
                        Concluded
                      </span>
                    ) : (
                      <span className="badge bg-surface border border-subtle text-muted text-[10px] shrink-0">
                        Not Started
                      </span>
                    )}
                  </div>

                  {/* Middle: Verified Camera Snapshot & Day Metrics */}
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-hover/60 border border-subtle/70 my-2">
                    {/* Camera Photo Thumbnail */}
                    <div className="w-16 h-12 rounded-md overflow-hidden bg-black shrink-0 border border-subtle relative flex items-center justify-center">
                      {att?.checkInPhoto ? (
                        <img
                          src={att.checkInPhoto}
                          alt="Webcam Check-In"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Camera size={18} className="text-muted opacity-40" />
                      )}
                      {att?.checkInPhoto && (
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-white text-center font-mono py-0.5">
                          {formatTime(att.checkInTime)}
                        </span>
                      )}
                    </div>

                    {/* Metrics Text */}
                    <div className="text-xs space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1 text-muted text-[11px]">
                        <Clock size={11} />
                        <span>Check-In:</span>
                        <strong className="text-primary font-mono">{formatTime(att?.checkInTime)}</strong>
                      </div>
                      {isCheckedOut && (
                        <div className="flex items-center gap-1 text-muted text-[11px]">
                          <CheckCircle2 size={11} className="text-blue-500" />
                          <span>Check-Out:</span>
                          <strong className="text-primary font-mono">{formatTime(att?.checkOutTime)}</strong>
                        </div>
                      )}
                      <div className="text-[11px] text-muted">
                        Active Duration: <strong className="text-primary font-mono">{att?.workHours ? `${att.workHours}h` : isCheckedIn ? 'In Progress' : '--'}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Summary Snippet or Notes */}
                  {summary ? (
                    <div className="text-[11px] text-muted mt-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Worklogs: <strong className="text-primary">{summary.stats?.worklogsCount || 0}</strong> ({summary.totalWorklogHours || 0}h)</span>
                        <span>Tasks Done: <strong className="text-emerald-500">{summary.stats?.tasksCompletedCount || 0}</strong></span>
                      </div>
                      {summary.notes && (
                        <p className="text-[11px] text-secondary italic line-clamp-1 mt-1">
                          "{summary.notes}"
                        </p>
                      )}
                    </div>
                  ) : att?.notes ? (
                    <p className="text-[11px] text-secondary italic line-clamp-1 mt-1">
                      "{att.notes}"
                    </p>
                  ) : null}
                </div>

                {/* Bottom Action Hint */}
                <div className="mt-3 pt-2.5 border-t border-subtle flex items-center justify-between text-xs text-muted group-hover:text-blue transition-colors">
                  <span className="text-[11px] font-medium">Click to inspect full day activity</span>
                  <ChevronRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Daily Activity Inspector Modal */}
      <DailyActivityInspectorModal
        userId={inspectUserId}
        date={selectedDate}
        isOpen={!!inspectUserId}
        onClose={() => setInspectUserId(null)}
      />
    </div>
  );
}
