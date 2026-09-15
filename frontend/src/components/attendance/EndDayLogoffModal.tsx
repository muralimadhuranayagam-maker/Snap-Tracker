import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, Clock, FileText, AlertCircle, ShieldAlert, Sparkles, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface EndDayLogoffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function EndDayLogoffModal({ isOpen, onClose, onSuccess }: EndDayLogoffModalProps) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  // Fetch today's current attendance info
  const { data: attendanceData, isLoading: isLoadingAttendance } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: async () => {
      const res = await api.get('/attendance/today');
      return res.data;
    },
    enabled: isOpen,
  });

  const checkOutMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/check-out', { notes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Shift concluded! Full daily activity transmitted to Admins & Super Admins.', {
        duration: 5000,
        icon: '🚀',
      });
      setNotes('');
      onClose();
      if (onSuccess) onSuccess();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Failed to submit daily logoff.';
      toast.error(msg);
    },
  });

  if (!isOpen) return null;

  const attendance = attendanceData?.attendance;
  const liveHours = attendanceData?.liveHours || 0;
  const isCheckedIn = attendanceData?.isCheckedIn;

  const formatTime = (dateStr?: string | null) => {
    if (!dateStr) return '--:--';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return '--:--';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-card text-card-foreground w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border bg-muted/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <LogOut className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">Evening Shift Logoff</h2>
              <p className="text-xs text-muted-foreground">Submit daily activity report & conclude shift</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {!isCheckedIn && !isLoadingAttendance ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold">No Active Shift Found</p>
                <p className="text-xs mt-0.5 opacity-90">
                  You haven't checked in with morning camera verification today. You must check in first to initiate an active shift.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Shift Metrics Card */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-muted/50 border border-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Check-In Time</div>
                    <div className="text-sm font-semibold text-foreground">
                      {isLoadingAttendance ? '...' : formatTime(attendance?.checkInTime)}
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-muted/50 border border-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Shift Duration</div>
                    <div className="text-sm font-semibold text-foreground">
                      {isLoadingAttendance ? '...' : `${liveHours} hours`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Automatic Activity Aggregation Notice */}
              <div className="p-4 rounded-xl bg-secondary/50 border border-border/80 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                  <ShieldAlert className="w-4 h-4 text-primary" />
                  <span>Automatic Daily Activity Aggregation</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Upon logoff, SnapServe automatically compiles all tasks worked on, worklogs recorded, tickets resolved, and system actions into a verified executive summary sent directly to Admin & Super Admin.
                </p>
              </div>

              {/* End of Day Notes / Highlights */}
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    Daily Accomplishments & Handover Notes (Optional)
                  </span>
                  <span className="text-[10px] text-muted-foreground font-normal">Included in executive report</span>
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Summary of completed milestones, key decisions, or upcoming blockers for tomorrow..."
                  rows={3}
                  className="w-full text-xs rounded-xl border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isCheckedIn || checkOutMutation.isPending}
            onClick={() => checkOutMutation.mutate()}
            className="px-4 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm hover:shadow transition-all flex items-center gap-2"
          >
            {checkOutMutation.isPending ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Aggregating Day Activity...
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Submit Activity & End Shift
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
