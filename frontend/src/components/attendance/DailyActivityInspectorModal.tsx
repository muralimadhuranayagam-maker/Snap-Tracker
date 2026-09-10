import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Camera, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle, 
  User, 
  FileText, 
  Briefcase, 
  Ticket as TicketIcon, 
  Activity, 
  CheckCircle,
  ShieldCheck
} from 'lucide-react';
import api from '../../lib/api';

interface DailyActivityInspectorModalProps {
  userId: string | null;
  date?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DailyActivityInspectorModal({
  userId,
  date,
  isOpen,
  onClose,
}: DailyActivityInspectorModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(
    date || new Date().toISOString().split('T')[0]
  );
  const [activeTab, setActiveTab] = useState<'worklogs' | 'tasks' | 'tickets' | 'audit'>('worklogs');

  const { data, isLoading, error } = useQuery({
    queryKey: ['daily-activity-summary', userId, selectedDate],
    queryFn: async () => {
      if (!userId) return null;
      const res = await api.get(`/attendance/user/${userId}/daily-summary`, {
        params: { date: selectedDate },
      });
      return res.data;
    },
    enabled: isOpen && !!userId,
  });

  if (!isOpen || !userId) return null;

  const summary = data?.summary;
  const attendance = data?.attendance;
  const user = data?.user;

  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return '--:--';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '--:--';
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'CHECKED_IN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Currently In Shift
          </span>
        );
      case 'CHECKED_OUT':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
            Shift Concluded & Logged Off
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
            <AlertCircle className="w-3.5 h-3.5" />
            Not Started
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-card text-card-foreground w-full max-w-4xl max-h-[90vh] rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-border bg-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full overflow-hidden border-2 border-primary/20 bg-muted flex items-center justify-center text-foreground font-bold">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
              ) : (
                <User className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold tracking-tight text-foreground">{user?.name || 'Employee Daily Activity'}</h2>
                {getStatusBadge(attendance?.status)}
              </div>
              <p className="text-xs text-muted-foreground">
                {user?.title || user?.role?.name || 'Staff'} • {user?.department?.name || 'All Departments'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Date Selector */}
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1.5 shadow-sm text-xs">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent text-xs text-foreground focus:outline-none cursor-pointer"
              />
            </div>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground">Loading employee attendance snapshot & daily activity...</p>
            </div>
          ) : error || !data ? (
            <div className="p-8 text-center bg-destructive/10 border border-destructive/20 rounded-2xl text-destructive">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-80" />
              <p className="font-semibold text-sm">Failed to load daily activity report</p>
              <p className="text-xs mt-1 opacity-80">Check network connection or ensure user exists.</p>
            </div>
          ) : (
            <>
              {/* Top Row: Verified Webcam Photo & Shift Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Verified Camera Snapshot */}
                <div className="md:col-span-1 rounded-2xl border border-border bg-muted/20 p-3.5 flex flex-col items-center justify-between text-center relative overflow-hidden">
                  <div className="w-full flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Camera className="w-3.5 h-3.5 text-primary" />
                      Morning Photo
                    </span>
                    {attendance?.checkInPhoto && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-500/20 flex items-center gap-1">
                        <ShieldCheck className="w-3 h-3" />
                        Verified
                      </span>
                    )}
                  </div>

                  {attendance?.checkInPhoto ? (
                    <div className="w-full aspect-video rounded-xl overflow-hidden border border-border bg-black shadow-inner relative group">
                      <img
                        src={attendance.checkInPhoto}
                        alt={`Morning Snapshot for ${user?.name}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 text-left">
                        <p className="text-[10px] text-white/90 font-mono">
                          {formatTime(attendance?.checkInTime)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full aspect-video rounded-xl border border-dashed border-border bg-muted/50 flex flex-col items-center justify-center p-4 text-muted-foreground">
                      <Camera className="w-8 h-8 mb-1 opacity-40" />
                      <p className="text-xs font-medium">No Camera Photo</p>
                      <p className="text-[10px] opacity-75">Not checked in on this date</p>
                    </div>
                  )}

                  <div className="w-full mt-2 pt-2 border-t border-border/60 text-[11px] text-muted-foreground flex items-center justify-between">
                    <span>Check-In:</span>
                    <span className="font-semibold text-foreground">{formatTime(attendance?.checkInTime)}</span>
                  </div>
                </div>

                {/* Shift Metrics & Summary Card */}
                <div className="md:col-span-2 rounded-2xl border border-border bg-card p-4 flex flex-col justify-between">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-muted/40 border border-border">
                      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-primary" /> Active Shift
                      </div>
                      <div className="text-xl font-bold text-foreground mt-1">
                        {summary?.totalActiveHours ? `${summary.totalActiveHours}h` : '0h'}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {attendance?.checkInTime ? formatTime(attendance.checkInTime) : '--'} → {attendance?.checkOutTime ? formatTime(attendance.checkOutTime) : (attendance ? 'Now' : '--')}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/40 border border-border">
                      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5 text-blue-500" /> Logged Hours
                      </div>
                      <div className="text-xl font-bold text-foreground mt-1">
                        {summary?.totalWorklogHours ? `${summary.totalWorklogHours}h` : '0h'}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {summary?.stats?.worklogsCount || 0} task entries
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-muted/40 border border-border">
                      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Completed
                      </div>
                      <div className="text-xl font-bold text-foreground mt-1">
                        {summary?.stats?.tasksCompletedCount || 0}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Tasks resolved today
                      </div>
                    </div>
                  </div>

                  {/* Notes / Handover Section */}
                  {summary?.notes ? (
                    <div className="mt-3 p-3 rounded-xl bg-secondary/40 border border-border text-xs space-y-1">
                      <div className="font-semibold text-foreground flex items-center gap-1.5 text-[11px]">
                        <FileText className="w-3 h-3 text-primary" />
                        Daily Logoff Notes / Executive Handover:
                      </div>
                      <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed italic">
                        "{summary.notes}"
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 p-2.5 rounded-xl bg-muted/30 border border-dashed border-border text-center text-xs text-muted-foreground">
                      No end-of-day summary notes submitted for this date.
                    </div>
                  )}

                  {/* Activity Stats Pills */}
                  <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-[11px]">
                      Tasks Updated: <strong className="text-foreground">{summary?.stats?.tasksUpdatedCount || 0}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-[11px]">
                      Tickets Handled: <strong className="text-foreground">{summary?.stats?.ticketsCount || 0}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-[11px]">
                      Comments Made: <strong className="text-foreground">{summary?.stats?.commentsCount || 0}</strong>
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-muted text-muted-foreground font-medium text-[11px]">
                      Audit Trail: <strong className="text-foreground">{summary?.stats?.auditActionsCount || 0} actions</strong>
                    </span>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="border-b border-border flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('worklogs')}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'worklogs'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Worklogs ({summary?.worklogs?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('tasks')}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'tasks'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  Tasks Touched ({summary?.tasksUpdated?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('tickets')}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'tickets'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <TicketIcon className="w-3.5 h-3.5" />
                  Tickets ({summary?.tickets?.length || 0})
                </button>
                <button
                  onClick={() => setActiveTab('audit')}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                    activeTab === 'audit'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  Audit Timeline ({summary?.auditActions?.length || 0})
                </button>
              </div>

              {/* Tab Content */}
              <div>
                {/* 1. Worklogs Tab */}
                {activeTab === 'worklogs' && (
                  <div className="space-y-2.5">
                    {summary?.worklogs && summary.worklogs.length > 0 ? (
                      summary.worklogs.map((w: any) => (
                        <div
                          key={w.id}
                          className="p-3.5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors flex items-start justify-between gap-4"
                        >
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-muted text-foreground">
                                {w.taskId}
                              </span>
                              <span className="text-xs font-semibold text-foreground">
                                {w.taskTitle}
                              </span>
                              {w.status && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                                  {w.status}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {w.description || 'No work description provided.'}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-sm font-bold text-primary">{w.hours}h</div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {formatTime(w.loggedAt)}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                        No worklogs recorded by employee on this date.
                      </div>
                    )}
                  </div>
                )}

                {/* 2. Tasks Touched Tab */}
                {activeTab === 'tasks' && (
                  <div className="space-y-2">
                    {summary?.tasksUpdated && summary.tasksUpdated.length > 0 ? (
                      summary.tasksUpdated.map((t: any) => (
                        <div
                          key={t.id}
                          className="p-3 rounded-xl border border-border bg-card flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-muted text-foreground">
                              {t.taskId}
                            </span>
                            <span className="text-xs font-medium text-foreground">{t.title}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-secondary font-medium text-secondary-foreground">
                              {t.status || 'Updated'}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                        No tasks assigned or modified today.
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Tickets Tab */}
                {activeTab === 'tickets' && (
                  <div className="space-y-2">
                    {summary?.tickets && summary.tickets.length > 0 ? (
                      summary.tickets.map((tk: any) => (
                        <div
                          key={tk.id}
                          className="p-3 rounded-xl border border-border bg-card flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 rounded font-mono text-[10px] font-semibold bg-primary/10 text-primary">
                              {tk.ticketId}
                            </span>
                            <span className="text-xs font-medium text-foreground">{tk.title}</span>
                          </div>
                          <span className="text-[11px] px-2 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                            {tk.status}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                        No tickets touched today.
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Audit Trail Tab */}
                {activeTab === 'audit' && (
                  <div className="space-y-1.5">
                    {summary?.auditActions && summary.auditActions.length > 0 ? (
                      summary.auditActions.map((a: any) => (
                        <div
                          key={a.id}
                          className="px-3.5 py-2 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            <span className="text-primary font-semibold">{a.action}</span>
                            <span className="text-muted-foreground">on</span>
                            <span className="text-foreground font-medium">{a.entity}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatTime(a.createdAt)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center bg-muted/20 rounded-xl border border-dashed border-border text-xs text-muted-foreground">
                        No audit actions logged for today.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border bg-muted/30 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Cryptographically logged and verified in SnapServe Audit Core</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-xl transition-colors"
          >
            Close Report
          </button>
        </div>
      </div>
    </div>
  );
}
