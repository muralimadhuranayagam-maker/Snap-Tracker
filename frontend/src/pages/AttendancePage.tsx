import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from '../context/WebSocketContext';
import { useAttendanceSession } from '../context/AttendanceSessionContext';
import { globalActivityTracker } from '../services/activityTracker';
import {
  Clock,
  Play,
  Square,
  CameraOff,
  Video,
  Wifi,
  CheckCircle2,
  Calendar,
  ScanFace,
  UtensilsCrossed,
  PauseCircle,
  Coffee,
  AlertTriangle,
  ShieldCheck,
  Activity,
  Info,
  Search,
  X,
  History,
  Handshake
} from 'lucide-react';
import toast from 'react-hot-toast';

// Format seconds into HH:MM:SS
function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function AttendancePage() {
  const { user: currentUser } = useAuthStore();
  const { isConnected } = useWebSocket();
  const queryClient = useQueryClient();

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const [activeTab, setActiveTab] = useState<'my_attendance' | 'admin_activity'>(isSuperAdmin ? 'admin_activity' : 'my_attendance');

  // Shared background camera and face presence session
  const {
    isVideoActive,
    isFaceDetected,
    faceConfidence,
    gracePeriodCountdown,
    gracePeriodConfig,
    setGracePeriodConfig,
    cameraError,
    startCamera,
    stopCamera,
    attachVisibleVideo,
  } = useAttendanceSession();

  // Privacy Consent Modal & Workday End Confirmation
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showEndConfirmModal, setShowEndConfirmModal] = useState(false);

  // Multi-tab collision state
  const [multiTabConflict, setMultiTabConflict] = useState(false);

  // Super Admin Inspection Modal
  const [selectedAdminEmployeeId, setSelectedAdminEmployeeId] = useState<string | null>(null);
  const [adminDateFilter, setAdminDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);
  const [adminSearchQuery, setAdminSearchQuery] = useState('');
  const [adminStatusFilter, setAdminStatusFilter] = useState<string>('ALL');

  // Employee history filter
  const [historyRange, setHistoryRange] = useState<'daily' | 'weekly' | 'monthly'>('monthly');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // ─── 1. FETCH TODAY'S ATTENDANCE STATUS ──────────────────────────────────
  const { data: todayData, refetch: refetchToday } = useQuery({
    queryKey: ['attendance-today'],
    queryFn: async () => {
      const res = await api.get('/attendance/today');
      return res.data;
    },
    refetchInterval: 8000,
  });

  const record = todayData?.record;
  const currentState = todayData?.currentState || 'OFF_DUTY';
  const isMarked = Boolean(record);
  const isCompleted = record?.isCompleted || currentState === 'WORKDAY_COMPLETED';

  // Live timer accumulators
  const [liveWorkingSec, setLiveWorkingSec] = useState(0);
  const [liveBreakSec, setLiveBreakSec] = useState(0);
  const [liveLunchSec, setLiveLunchSec] = useState(0);
  const [liveMeetingSec, setLiveMeetingSec] = useState(0);
  const [liveMissingSec, setLiveMissingSec] = useState(0);
  const [liveTotalSec, setLiveTotalSec] = useState(0);

  useEffect(() => {
    if (todayData?.computed) {
      setLiveWorkingSec(todayData.computed.verifiedWorkingSeconds);
      setLiveBreakSec(todayData.computed.breakSeconds);
      setLiveLunchSec(todayData.computed.lunchSeconds);
      setLiveMeetingSec(todayData.computed.meetingSeconds || 0);
      setLiveMissingSec(todayData.computed.faceMissingSeconds);
      setLiveTotalSec(todayData.computed.totalAttendanceSeconds);
    }
  }, [todayData]);

  // Real-time second accumulator (interpolates from authoritative backend baseline)
  useEffect(() => {
    const timer = setInterval(() => {
      if (currentState === 'WORKING' && isFaceDetected) {
        setLiveWorkingSec((prev) => prev + 1);
      } else if (currentState === 'FACE_NOT_DETECTED') {
        setLiveMissingSec((prev) => prev + 1);
      } else if (currentState === 'ON_BREAK') {
        setLiveBreakSec((prev) => prev + 1);
      } else if (currentState === 'ON_LUNCH') {
        setLiveLunchSec((prev) => prev + 1);
      } else if (currentState === 'IN_MEETING') {
        setLiveMeetingSec((prev) => prev + 1);
        setLiveWorkingSec((prev) => prev + 1); // Crucial: Meeting duration adds directly to verified working hours!
      }

      if (record?.clockIn && !isCompleted) {
        setLiveTotalSec((prev) => prev + 1);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [currentState, isFaceDetected, record?.clockIn, isCompleted]);

  // Attach live video preview to visible video element on AttendancePage
  useEffect(() => {
    if (videoRef.current) {
      attachVisibleVideo(videoRef.current);
    }
  }, [attachVisibleVideo, isVideoActive]);

  // ─── 2. MULTI-TAB SESSION PROTECTION ──────────────────────────────────────
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('snapserve_attendance_session');
      broadcastChannelRef.current = channel;

      channel.onmessage = (event) => {
        if (event.data?.type === 'ACTIVE_TAB_PING' && isVideoActive) {
          channel.postMessage({ type: 'ACTIVE_TAB_PONG', userId: currentUser?.id });
        } else if (event.data?.type === 'ACTIVE_TAB_PONG') {
          setMultiTabConflict(true);
        }
      };

      if (isVideoActive) {
        channel.postMessage({ type: 'ACTIVE_TAB_PING', userId: currentUser?.id });
      }

      return () => {
        channel.close();
      };
    } catch {}
  }, [isVideoActive, currentUser?.id]);

  // ─── 3. STATE MACHINE MUTATIONS ───────────────────────────────────────────

  // Mark Attendance
  const markAttendanceMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/mark');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Attendance marked for today!');
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to mark attendance');
    },
  });

  // Start Working (after camera permission confirmed)
  const startWorkingMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/start-work');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Work session active! Face-presence monitoring running.');
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
      globalActivityTracker.start();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to start working');
      stopCamera();
    },
  });

  // Break Start
  const breakStartMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/break-start');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Break started. Camera & working timer paused.');
      stopCamera();
      globalActivityTracker.stop();
      refetchToday();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to start break');
    },
  });

  // Break End (Resume Working)
  const breakEndMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/break-end');
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Break ended! Resuming work session.');
      // Immediately update local cache to WORKING state so guards don't race
      queryClient.setQueryData(['attendance-today'], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentState: 'WORKING',
          record: {
            ...prev.record,
            currentState: 'WORKING',
          },
        };
      });
      const ok = await startCamera();
      if (ok) {
        globalActivityTracker.start();
      }
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to resume from break');
    },
  });

  // Lunch Start
  const lunchStartMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/lunch-start');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Lunch break started. Camera & working timer paused.');
      stopCamera();
      globalActivityTracker.stop();
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to start lunch');
    },
  });

  // Lunch End (Resume Working)
  const lunchEndMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/lunch-end');
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Lunch ended! Resuming work session.');
      queryClient.setQueryData(['attendance-today'], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentState: 'WORKING',
          record: {
            ...prev.record,
            currentState: 'WORKING',
          },
        };
      });
      const ok = await startCamera();
      if (ok) {
        globalActivityTracker.start();
      }
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to resume from lunch');
    },
  });

  // Meeting Start
  const meetingStartMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/meeting-start');
      return res.data;
    },
    onSuccess: () => {
      toast.success('Meeting started! Camera turned off. Duration is added to official working hours.');
      stopCamera();
      globalActivityTracker.stop();
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to start meeting');
    },
  });

  // Meeting End (Resume Working)
  const meetingEndMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/meeting-end');
      return res.data;
    },
    onSuccess: async () => {
      toast.success('Meeting ended! Meeting duration added to verified working hours.');
      queryClient.setQueryData(['attendance-today'], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentState: 'WORKING',
          record: {
            ...prev.record,
            currentState: 'WORKING',
          },
        };
      });
      const ok = await startCamera();
      if (ok) {
        globalActivityTracker.start();
      }
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to end meeting');
    },
  });

  // End Workday
  const endWorkdayMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/attendance/end-workday');
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Workday completed!');
      stopCamera();
      globalActivityTracker.stop();
      setShowEndConfirmModal(false);
      refetchToday();
      queryClient.invalidateQueries({ queryKey: ['attendance-my-history'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to end workday');
    },
  });

  // Ensure camera is unconditionally stopped during pause states (Break, Lunch, Meeting, Completed, Off Duty)
  useEffect(() => {
    const isPausedState = ['ON_BREAK', 'ON_LUNCH', 'IN_MEETING', 'WORKDAY_COMPLETED', 'OFF_DUTY', 'ATTENDANCE_MARKED'].includes(currentState);
    if (isPausedState && isVideoActive) {
      stopCamera();
    }
  }, [currentState, isVideoActive, stopCamera]);

  const handleTakeBreak = () => {
    queryClient.setQueryData(['attendance-today'], (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentState: 'ON_BREAK',
        record: { ...prev.record, currentState: 'ON_BREAK' },
      };
    });
    stopCamera();
    breakStartMutation.mutate();
  };

  const handleStartLunch = () => {
    queryClient.setQueryData(['attendance-today'], (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentState: 'ON_LUNCH',
        record: { ...prev.record, currentState: 'ON_LUNCH' },
      };
    });
    stopCamera();
    lunchStartMutation.mutate();
  };

  const handleStartMeeting = () => {
    queryClient.setQueryData(['attendance-today'], (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentState: 'IN_MEETING',
        record: { ...prev.record, currentState: 'IN_MEETING' },
      };
    });
    stopCamera();
    meetingStartMutation.mutate();
  };

  const handleConfirmEndWorkday = () => {
    queryClient.setQueryData(['attendance-today'], (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        currentState: 'WORKDAY_COMPLETED',
        record: { ...prev.record, currentState: 'WORKDAY_COMPLETED', isCompleted: true },
      };
    });
    stopCamera();
    endWorkdayMutation.mutate();
  };

  // Only on initial mount: If employee was already in WORKING state from a prior session, initialize camera
  const hasInitialAutoStartedRef = useRef(false);
  useEffect(() => {
    if (!hasInitialAutoStartedRef.current && currentState === 'WORKING' && !isVideoActive && !isSuperAdmin) {
      hasInitialAutoStartedRef.current = true;
      startCamera().catch(() => {});
    }
  }, [currentState, isVideoActive, isSuperAdmin, startCamera]);

  const handleAllowCameraAndStartWorking = async () => {
    setShowConsentModal(false);
    const cameraGranted = await startCamera();
    if (cameraGranted) {
      startWorkingMutation.mutate();
    }
  };

  const handleStartOrResumeWorking = async () => {
    if (currentState === 'OFF_DUTY') {
      markAttendanceMutation.mutate(undefined, {
        onSuccess: async () => {
          const ok = await startCamera();
          if (ok) {
            startWorkingMutation.mutate();
          }
        },
      });
      return;
    }
    if (currentState === 'ATTENDANCE_MARKED') {
      const ok = await startCamera();
      if (ok) {
        startWorkingMutation.mutate();
      }
      return;
    }
    if (currentState === 'ON_BREAK') {
      breakEndMutation.mutate();
      return;
    }
    if (currentState === 'ON_LUNCH') {
      lunchEndMutation.mutate();
      return;
    }
    if (currentState === 'IN_MEETING') {
      meetingEndMutation.mutate();
      return;
    }
    // For WORKING or FACE_NOT_DETECTED: ensure camera is on and active
    const ok = await startCamera();
    if (ok) {
      startWorkingMutation.mutate();
    }
  };

  // ─── 4. HISTORY & SUPER ADMIN QUERIES ─────────────────────────────────────
  const { data: myHistoryData } = useQuery({
    queryKey: ['attendance-my-history', historyRange],
    queryFn: async () => {
      const res = await api.get(`/attendance/my-history?range=${historyRange}`);
      return res.data;
    },
    refetchInterval: 10000,
  });

  const { data: adminOverviewData } = useQuery({
    queryKey: ['admin-overview', adminDateFilter],
    queryFn: async () => {
      const res = await api.get(`/attendance/admin/overview?date=${adminDateFilter}`);
      return res.data;
    },
    enabled: isSuperAdmin,
    refetchInterval: 10000,
  });

  const { data: adminActivityData } = useQuery({
    queryKey: ['admin-activity', adminDateFilter],
    queryFn: async () => {
      const res = await api.get(`/attendance/admin/activity?date=${adminDateFilter}`);
      return res.data;
    },
    enabled: isSuperAdmin,
    refetchInterval: 10000,
  });

  const { data: selectedEmployeeDetails } = useQuery({
    queryKey: ['admin-employee-details', selectedAdminEmployeeId, adminDateFilter],
    queryFn: async () => {
      const res = await api.get(`/attendance/admin/employee/${selectedAdminEmployeeId}?date=${adminDateFilter}`);
      return res.data;
    },
    enabled: Boolean(isSuperAdmin && selectedAdminEmployeeId),
  });

  const filteredAdminEmployees = useMemo(() => {
    if (!adminActivityData?.employees) return [];
    return adminActivityData.employees.filter((item: any) => {
      const matchesSearch =
        item.user.name.toLowerCase().includes(adminSearchQuery.toLowerCase()) ||
        item.user.email.toLowerCase().includes(adminSearchQuery.toLowerCase());
      const matchesStatus =
        adminStatusFilter === 'ALL' || item.currentState === adminStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [adminActivityData, adminSearchQuery, adminStatusFilter]);

  // State badge styling
  const getStateBadge = (state: string) => {
    switch (state) {
      case 'WORKING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Working
          </span>
        );
      case 'IN_MEETING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            In Meeting (Working Time)
          </span>
        );
      case 'FACE_NOT_DETECTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
            <AlertTriangle size={13} className="text-amber-400" />
            Face Missing (Timer Paused)
          </span>
        );
      case 'ON_BREAK':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Coffee size={13} />
            On Break
          </span>
        );
      case 'ON_LUNCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <UtensilsCrossed size={13} />
            On Lunch
          </span>
        );
      case 'WORKDAY_COMPLETED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-500/10 text-gray-400 border border-gray-500/30">
            <CheckCircle2 size={13} />
            Workday Completed
          </span>
        );
      case 'ATTENDANCE_MARKED':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <CheckCircle2 size={13} />
            Attendance Marked
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border/40">
            Off Duty
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-card border border-border/40 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <ScanFace size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Attendance & Work Session Tracker</h1>
              <span
                className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                }`}
              >
                <Wifi size={12} className={isConnected ? 'animate-pulse' : ''} />
                {isConnected ? 'Real-Time Connected' : 'Reconnecting...'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isSuperAdmin
                ? 'Super Admin view: Mark attendance & monitor organization activity. Camera tracking exempt.'
                : 'Working hours are calculated from Face-Presence Detection & Meetings. Remains active across background tabs.'}
            </p>
          </div>
        </div>

        {/* Super Admin Navigation Toggle */}
        {isSuperAdmin && (
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/40">
            <button
              onClick={() => setActiveTab('my_attendance')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'my_attendance'
                  ? 'bg-white text-black shadow-md shadow-white/10 ring-1 ring-white/30'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              My Attendance
            </button>
            <button
              onClick={() => setActiveTab('admin_activity')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'admin_activity'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-purple-400 hover:text-purple-300'
              }`}
            >
              <Activity size={13} />
              Activity Monitoring
            </button>
          </div>
        )}
      </div>

      {/* Multi-Tab Conflict Warning */}
      {multiTabConflict && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-3">
          <AlertTriangle size={20} className="shrink-0" />
          <div className="text-xs">
            <span className="font-semibold">Multiple active attendance tabs detected:</span> Please use a single browser tab for camera face presence tracking.
          </div>
        </div>
      )}

      {/* Camera Error Warning */}
      {!isSuperAdmin && cameraError && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle size={18} className="shrink-0" />
            <span>{cameraError}</span>
          </div>
          <button
            onClick={() => startCamera()}
            className="px-3 py-1 text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded-lg transition-colors"
          >
            Retry Camera
          </button>
        </div>
      )}

      {/* Working but camera off notice */}
      {!isSuperAdmin && currentState === 'WORKING' && !isVideoActive && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle size={18} className="shrink-0" />
            <span>Work session is active, but your face camera is currently inactive. Please turn on your camera to verify face presence and record official hours.</span>
          </div>
          <button
            onClick={() => startCamera()}
            className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
          >
            <Video size={13} />
            Turn On Camera
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION A: SUPER ADMIN ONLY VIEW                                    */}
      {/* (Only mark attendance alone! Camera tracking is NOT needed)        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isSuperAdmin && activeTab === 'my_attendance' && (
        <div className="space-y-6">
          <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
                <Calendar size={26} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Super Admin Attendance</div>
                <div className="text-lg font-bold text-foreground flex items-center gap-2 mt-0.5">
                  <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {isMarked ? (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Attendance Marked
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Not Marked Yet
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Camera tracking is exempt for Super Admin. Click below to register your daily attendance.
                </p>
              </div>
            </div>

            <div>
              {!isMarked ? (
                <button
                  onClick={() => markAttendanceMutation.mutate()}
                  disabled={markAttendanceMutation.isPending}
                  className="px-5 py-3 rounded-xl font-bold text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2 shadow-md"
                >
                  <CheckCircle2 size={16} />
                  {markAttendanceMutation.isPending ? 'Marking...' : 'Mark Today Attendance'}
                </button>
              ) : (
                <div className="px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  Present for Today
                </div>
              )}
            </div>
          </div>

          {/* Quick link to Activity Monitoring */}
          <div className="p-5 rounded-2xl bg-card border border-border/40 shadow-sm flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-foreground">Organization Activity & Presence Monitoring</h3>
              <p className="text-xs text-muted-foreground">Monitor real-time face verification, mouse/keyboard metrics, and attendance for all employees.</p>
            </div>
            <button
              onClick={() => setActiveTab('admin_activity')}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-all flex items-center gap-1.5 shadow-sm"
            >
              <Activity size={14} />
              Open Activity Dashboard
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION B: REGULAR EMPLOYEE ATTENDANCE & FACE WORK SESSION         */}
      {/* (Used by all employees: Camera stays on across tabs, Meeting added) */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {!isSuperAdmin && (
        <div className="space-y-6">
          {/* Daily Attendance Bar */}
          <div className="bg-card border border-border/40 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-muted/60 text-foreground border border-border/40">
                <Calendar size={22} className="text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground font-medium">Today's Attendance</div>
                <div className="text-base font-bold text-foreground flex items-center gap-2">
                  <span>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  {isMarked ? (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <CheckCircle2 size={12} /> Attendance Marked
                    </span>
                  ) : (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      Not Marked Yet
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs text-muted-foreground font-medium">Current Status</div>
                <div className="mt-0.5">{getStateBadge(currentState)}</div>
              </div>

              {!isMarked && (
                <button
                  onClick={() => markAttendanceMutation.mutate()}
                  disabled={markAttendanceMutation.isPending}
                  className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle2 size={15} />
                  {markAttendanceMutation.isPending ? 'Marking...' : 'Mark Today Attendance'}
                </button>
              )}
            </div>
          </div>

          {/* Main Working & Face Verification Split Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Official Time Counters & State Controls */}
            <div className="lg:col-span-2 bg-card border border-border/40 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={20} className="text-primary" />
                  <span className="font-bold text-base">Verified Work Session</span>
                </div>
                {getStateBadge(currentState)}
              </div>

              {/* Large Face-Verified Working Timer */}
              <div className="text-center py-6 px-4 rounded-xl bg-muted/20 border border-border/30 relative overflow-hidden">
                <div className="text-xs font-semibold tracking-wider uppercase text-muted-foreground flex items-center justify-center gap-1.5">
                  <ScanFace size={14} className="text-emerald-400" />
                  Official Working Time (Face Presence & Meetings)
                </div>

                <div className="text-5xl sm:text-6xl font-extrabold font-mono tracking-tight text-foreground mt-3">
                  {formatDuration(liveWorkingSec)}
                </div>

                {/* Grace Period / Status Subtitle */}
                <div className="mt-3 text-xs font-medium min-h-[20px]">
                  {currentState === 'WORKING' && isFaceDetected && (
                    <span className="text-emerald-400 font-semibold inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Face Detected & working time accumulating (persists across tabs)
                    </span>
                  )}
                  {currentState === 'WORKING' && !isFaceDetected && gracePeriodCountdown !== null && (
                    <span className="text-amber-400 font-semibold inline-flex items-center gap-1">
                      <AlertTriangle size={13} />
                      Face lost. Grace period: {gracePeriodCountdown}s before timer pauses...
                    </span>
                  )}
                  {currentState === 'FACE_NOT_DETECTED' && (
                    <span className="text-amber-400 font-semibold inline-flex items-center gap-1">
                      <PauseCircle size={13} />
                      Working timer paused: Human face not detected in front of camera
                    </span>
                  )}
                  {currentState === 'IN_MEETING' && (
                    <span className="text-indigo-400 font-semibold inline-flex items-center gap-1.5">
                      <Handshake size={14} />
                      In Meeting — Camera is off to free your webcam. Meeting duration is added to working hours!
                    </span>
                  )}
                  {currentState === 'ON_BREAK' && (
                    <span className="text-blue-400 font-semibold inline-flex items-center gap-1">
                      <Coffee size={13} />
                      On Break (Camera off, does not count toward working hours)
                    </span>
                  )}
                  {currentState === 'ON_LUNCH' && (
                    <span className="text-purple-400 font-semibold inline-flex items-center gap-1">
                      <UtensilsCrossed size={13} />
                      On Lunch (Camera off, does not count toward working hours)
                    </span>
                  )}
                  {currentState === 'WORKDAY_COMPLETED' && (
                    <span className="text-muted-foreground font-semibold inline-flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      Workday completed for today. Camera off.
                    </span>
                  )}
                </div>
              </div>

              {/* Secondary Official Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="text-[11px] text-muted-foreground font-medium">Total Attendance</div>
                  <div className="text-base font-bold font-mono text-foreground mt-1">
                    {formatDuration(liveTotalSec)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="text-[11px] text-muted-foreground font-medium">Meeting Time</div>
                  <div className="text-base font-bold font-mono text-indigo-400 mt-1">
                    {formatDuration(liveMeetingSec)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="text-[11px] text-muted-foreground font-medium">Break Duration</div>
                  <div className="text-base font-bold font-mono text-blue-400 mt-1">
                    {formatDuration(liveBreakSec)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="text-[11px] text-muted-foreground font-medium">Lunch Duration</div>
                  <div className="text-base font-bold font-mono text-purple-400 mt-1">
                    {formatDuration(liveLunchSec)}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <div className="text-[11px] text-muted-foreground font-medium">Face Missing</div>
                  <div className="text-base font-bold font-mono text-amber-400 mt-1">
                    {formatDuration(liveMissingSec)}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-3">
                {/* 1. OFF_DUTY */}
                {currentState === 'OFF_DUTY' && (
                  <button
                    onClick={() => markAttendanceMutation.mutate()}
                    disabled={markAttendanceMutation.isPending}
                    className="w-full py-3 rounded-xl font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center justify-center gap-2 shadow-sm"
                  >
                    <CheckCircle2 size={16} />
                    Mark Today's Attendance First
                  </button>
                )}

                {/* 2. ATTENDANCE_MARKED */}
                {currentState === 'ATTENDANCE_MARKED' && (
                  <button
                    onClick={handleStartOrResumeWorking}
                    disabled={startWorkingMutation.isPending}
                    className="w-full py-3.5 rounded-xl font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <Play size={16} />
                    Start Working
                  </button>
                )}

                {/* 3. ACTIVE WORK SESSION TOOLBAR (Working, Meeting, Break, Lunch, End Workday) */}
                {['WORKING', 'FACE_NOT_DETECTED', 'IN_MEETING', 'ON_BREAK', 'ON_LUNCH'].includes(currentState) && (
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="flex flex-wrap items-center gap-2.5 w-full">
                      {/* 1. Working Button */}
                      <button
                        onClick={handleStartOrResumeWorking}
                        disabled={startWorkingMutation.isPending}
                        className={`flex-1 min-w-[125px] py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                          (currentState === 'WORKING' || currentState === 'FACE_NOT_DETECTED')
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-600/30 ring-2 ring-emerald-400'
                            : 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-semibold'
                        }`}
                        title={(currentState === 'WORKING' || currentState === 'FACE_NOT_DETECTED') ? 'Work session active (Face tracking ON)' : 'Resume working (Turn on camera)'}
                      >
                        {(currentState === 'WORKING' || currentState === 'FACE_NOT_DETECTED') ? (
                          <span className="relative flex h-2 w-2 mr-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                        ) : (
                          <Play size={14} className="fill-emerald-400" />
                        )}
                        <span>{(currentState === 'WORKING' || currentState === 'FACE_NOT_DETECTED') ? 'Working Active' : 'Start Working'}</span>
                      </button>

                      {/* 2. Meeting Button */}
                      <button
                        onClick={currentState === 'IN_MEETING' ? () => meetingEndMutation.mutate() : handleStartMeeting}
                        disabled={meetingStartMutation.isPending || meetingEndMutation.isPending}
                        className={`flex-1 min-w-[115px] py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                          currentState === 'IN_MEETING'
                            ? 'bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400'
                            : 'bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 font-semibold'
                        }`}
                        title={currentState === 'IN_MEETING' ? 'Currently in meeting (Click to end meeting & resume working)' : 'Start meeting (Webcam off, hours calculated)'}
                      >
                        {currentState === 'IN_MEETING' ? (
                          <span className="relative flex h-2 w-2 mr-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                        ) : (
                          <Handshake size={14} />
                        )}
                        <span>{currentState === 'IN_MEETING' ? 'In Meeting' : 'Start Meeting'}</span>
                      </button>

                      {/* 3. Break Button */}
                      <button
                        onClick={currentState === 'ON_BREAK' ? () => breakEndMutation.mutate() : handleTakeBreak}
                        disabled={breakStartMutation.isPending || breakEndMutation.isPending}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                          currentState === 'ON_BREAK'
                            ? 'bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-lg shadow-blue-600/30 ring-2 ring-blue-400'
                            : 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/30 font-semibold'
                        }`}
                        title={currentState === 'ON_BREAK' ? 'Currently on break (Click to resume working)' : 'Take a break (Webcam off)'}
                      >
                        {currentState === 'ON_BREAK' ? (
                          <span className="relative flex h-2 w-2 mr-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                        ) : (
                          <Coffee size={14} />
                        )}
                        <span>{currentState === 'ON_BREAK' ? 'On Break' : 'Take Break'}</span>
                      </button>

                      {/* 4. Lunch Button */}
                      <button
                        onClick={currentState === 'ON_LUNCH' ? () => lunchEndMutation.mutate() : handleStartLunch}
                        disabled={lunchStartMutation.isPending || lunchEndMutation.isPending}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                          currentState === 'ON_LUNCH'
                            ? 'bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-600/30 ring-2 ring-purple-400'
                            : 'bg-purple-600/10 hover:bg-purple-600/20 text-purple-400 border border-purple-500/30 font-semibold'
                        }`}
                        title={currentState === 'ON_LUNCH' ? 'Currently on lunch (Click to resume working)' : 'Start lunch (Webcam off)'}
                      >
                        {currentState === 'ON_LUNCH' ? (
                          <span className="relative flex h-2 w-2 mr-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                          </span>
                        ) : (
                          <UtensilsCrossed size={14} />
                        )}
                        <span>{currentState === 'ON_LUNCH' ? 'On Lunch' : 'Start Lunch'}</span>
                      </button>

                      {/* 5. End Workday Button */}
                      <button
                        onClick={() => setShowEndConfirmModal(true)}
                        className="py-2.5 px-4 rounded-xl font-semibold text-xs bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        <Square size={14} />
                        End Workday
                      </button>
                    </div>

                    {/* Quick Resume Helper banner when currently in Meeting, Break, or Lunch */}
                    {currentState === 'IN_MEETING' && (
                      <button
                        onClick={() => meetingEndMutation.mutate()}
                        disabled={meetingEndMutation.isPending}
                        className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition-all flex items-center justify-center gap-2"
                      >
                        <Play size={14} className="fill-indigo-300" />
                        End Meeting & Resume Working (Turns Face Camera On)
                      </button>
                    )}

                    {currentState === 'ON_BREAK' && (
                      <button
                        onClick={() => breakEndMutation.mutate()}
                        disabled={breakEndMutation.isPending}
                        className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-blue-500/15 hover:bg-blue-500/25 text-blue-300 border border-blue-500/30 transition-all flex items-center justify-center gap-2"
                      >
                        <Play size={14} className="fill-blue-300" />
                        End Break & Resume Working (Turns Face Camera On)
                      </button>
                    )}

                    {currentState === 'ON_LUNCH' && (
                      <button
                        onClick={() => lunchEndMutation.mutate()}
                        disabled={lunchEndMutation.isPending}
                        className="w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 transition-all flex items-center justify-center gap-2"
                      >
                        <Play size={14} className="fill-purple-300" />
                        End Lunch & Resume Working (Turns Face Camera On)
                      </button>
                    )}
                  </div>
                )}

                {/* 4. WORKDAY_COMPLETED */}
                {currentState === 'WORKDAY_COMPLETED' && (
                  <div className="w-full py-3 text-center text-xs font-semibold text-muted-foreground bg-muted/20 rounded-xl border border-border/30">
                    ✓ Today's workday is finalized and completed.
                  </div>
                )}
              </div>
            </div>

            {/* Right: Camera / Face Presence Monitoring Card */}
            <div className="bg-card border border-border/40 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Video size={18} className="text-primary" />
                  <span className="font-bold text-sm">Face Verification Feed</span>
                </div>
                <span
                  className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded ${
                    isVideoActive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isVideoActive ? 'Camera Live' : 'Camera Off'}
                </span>
              </div>

              {/* Video Player Box */}
              <div className="relative w-full aspect-video rounded-xl bg-black/60 border border-border/40 overflow-hidden flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${
                    isVideoActive ? 'opacity-100' : 'hidden'
                  }`}
                />

                {!isVideoActive && (
                  <div className="text-center p-4 space-y-2">
                    <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center mx-auto text-muted-foreground">
                      <CameraOff size={22} />
                    </div>
                    <div className="text-xs font-semibold text-muted-foreground">
                      {currentState === 'IN_MEETING'
                        ? 'Camera Off (Freed for Meeting)'
                        : 'Camera Stream Inactive'}
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 max-w-[220px] mx-auto">
                      {currentState === 'IN_MEETING'
                        ? 'Your webcam is freed for Zoom/Google Meet. Meeting time is calculating as official working hours.'
                        : 'Camera stays on across tabs while working. Only turns off during Break, Lunch, Meeting, or End Workday.'}
                    </div>
                  </div>
                )}

                {/* Face Presence Overlay Indicator */}
                {isVideoActive && (
                  <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        isFaceDetected
                          ? 'bg-emerald-500/90 text-white'
                          : 'bg-amber-500/90 text-white'
                      }`}
                    >
                      {isFaceDetected ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                      {isFaceDetected ? 'Face Present' : 'Face Missing'}
                    </span>

                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/70 text-white">
                      Conf: {faceConfidence}%
                    </span>
                  </div>
                )}
              </div>

              {/* Privacy & Configuration Details */}
              <div className="space-y-2.5 text-xs text-muted-foreground border-t border-border/40 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px]">Continuous Tracking</span>
                  <span className="text-[11px] font-semibold text-emerald-400">Active Across All Tabs</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px]">Face Grace Period</span>
                  <div className="flex items-center gap-1">
                    <select
                      value={gracePeriodConfig}
                      onChange={(e) => setGracePeriodConfig(Number(e.target.value))}
                      className="bg-muted text-[11px] px-2 py-0.5 rounded border border-border/40 font-mono"
                    >
                      <option value={3}>3 seconds</option>
                      <option value={4}>4 seconds</option>
                      <option value={5}>5 seconds</option>
                      <option value={8}>8 seconds</option>
                    </select>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/20 text-[11px] text-primary/90 flex items-start gap-2">
                  <ShieldCheck size={14} className="shrink-0 mt-0.5" />
                  <span>
                    <strong>Privacy First:</strong> Video is analyzed locally in memory and never stored or uploaded.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Today's Audit Event Timeline */}
          <div className="bg-card border border-border/40 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <History size={18} className="text-primary" />
              <h2 className="font-bold text-base">Today's Session Audit Timeline</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30 space-y-1">
                <div className="text-[11px] text-muted-foreground">Attendance Marked</div>
                <div className="text-xs font-bold font-mono">
                  {record?.attendanceMarkedAt
                    ? new Date(record.attendanceMarkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30 space-y-1">
                <div className="text-[11px] text-muted-foreground">Work Session Started</div>
                <div className="text-xs font-bold font-mono text-emerald-400">
                  {record?.workStartedAt
                    ? new Date(record.workStartedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30 space-y-1">
                <div className="text-[11px] text-muted-foreground">Clock Out / End Workday</div>
                <div className="text-xs font-bold font-mono text-rose-400">
                  {record?.clockOut
                    ? new Date(record.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : isCompleted
                    ? 'Completed'
                    : 'In Progress'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30 space-y-1">
                <div className="text-[11px] text-muted-foreground">Intervals Count</div>
                <div className="text-xs font-bold font-mono">
                  {record?.intervals?.length || 0} intervals recorded
                </div>
              </div>
            </div>
          </div>

          {/* Personal Attendance History Table */}
          <div className="bg-card border border-border/40 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Calendar size={18} className="text-primary" />
                <h2 className="font-bold text-base">My Attendance History</h2>
              </div>

              <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60 shadow-inner">
                {(['daily', 'weekly', 'monthly'] as const).map((r) => {
                  const isSelected = historyRange === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setHistoryRange(r)}
                      className={`px-3.5 py-1.5 text-xs font-bold capitalize rounded-lg transition-all flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-white text-black shadow-md shadow-white/10 ring-1 ring-white/30'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5 font-medium'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-black/80" />}
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/40 font-semibold uppercase text-muted-foreground bg-muted/20">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Clock In</th>
                    <th className="py-3 px-4">Clock Out</th>
                    <th className="py-3 px-4 text-right">Face-Verified Working</th>
                    <th className="py-3 px-4 text-right">Meeting</th>
                    <th className="py-3 px-4 text-right">Break</th>
                    <th className="py-3 px-4 text-right">Lunch</th>
                    <th className="py-3 px-4 text-right">Face Missing</th>
                    <th className="py-3 px-4 text-right">Total Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {myHistoryData?.records && myHistoryData.records.length > 0 ? (
                    myHistoryData.records.map((r: any) => (
                      <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-medium">{r.date}</td>
                        <td className="py-3 px-4">{getStateBadge(r.currentState)}</td>
                        <td className="py-3 px-4 font-mono">
                          {r.clockIn ? new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatDuration(r.verifiedWorkingSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-400">
                          {formatDuration(r.meetingSeconds || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-blue-400">
                          {formatDuration(r.breakSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-400">
                          {formatDuration(r.lunchSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-400">
                          {formatDuration(r.faceMissingSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-semibold">
                          {formatDuration(r.totalAttendanceSeconds)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground">
                        No attendance records found for this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* SECTION C: SUPER_ADMIN ACTIVITY DASHBOARD                           */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {isSuperAdmin && activeTab === 'admin_activity' && (
        <div className="space-y-6">
          {/* Top Admin Summary Cards - 4 per row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
            {[
              { label: 'Total Employees', value: adminOverviewData?.metrics?.totalEmployees || 0, color: '#e2e8f0' },
              { label: 'Present', value: adminOverviewData?.metrics?.present || 0, color: '#22d3ee' },
              { label: 'Working', value: adminOverviewData?.metrics?.working || 0, color: '#4ade80' },
              { label: 'In Meeting', value: adminOverviewData?.metrics?.inMeeting || 0, color: '#818cf8' },
              { label: 'On Break', value: adminOverviewData?.metrics?.onBreak || 0, color: '#60a5fa' },
              { label: 'On Lunch', value: adminOverviewData?.metrics?.onLunch || 0, color: '#c084fc' },
              { label: 'Face Missing', value: adminOverviewData?.metrics?.faceNotDetected || 0, color: '#fbbf24' },
              { label: 'Completed', value: adminOverviewData?.metrics?.completed || 0, color: '#94a3b8' },
            ].map(stat => (
              <div key={stat.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
                <div style={{ fontSize: '24px', fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          {/* Filters Bar */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Search — grows to fill available space */}
            <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
              <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search employee name/email..."
                value={adminSearchQuery}
                onChange={(e) => setAdminSearchQuery(e.target.value)}
                style={{ width: '100%', paddingLeft: '32px', paddingRight: '12px', paddingTop: '7px', paddingBottom: '7px', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.04)', fontSize: '12px', color: 'inherit', outline: 'none' }}
              />
            </div>

            {/* Status filter */}
            <select
              value={adminStatusFilter}
              onChange={(e) => setAdminStatusFilter(e.target.value)}
              style={{ padding: '7px 12px', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.04)', fontSize: '12px', color: 'inherit', outline: 'none', flexShrink: 0 }}
            >
              <option value="ALL">All States</option>
              <option value="WORKING">Working</option>
              <option value="IN_MEETING">In Meeting</option>
              <option value="FACE_NOT_DETECTED">Face Missing</option>
              <option value="ON_BREAK">On Break</option>
              <option value="ON_LUNCH">On Lunch</option>
              <option value="WORKDAY_COMPLETED">Completed</option>
              <option value="OFF_DUTY">Off Duty / Absent</option>
            </select>

            {/* Date filter — pinned right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>Date:</span>
              <input
                type="date"
                value={adminDateFilter}
                onChange={(e) => setAdminDateFilter(e.target.value)}
                style={{ padding: '7px 12px', borderRadius: '10px', border: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.04)', fontSize: '12px', color: 'inherit', outline: 'none', fontFamily: 'monospace' }}
              />
            </div>
          </div>

          {/* SUPER_ADMIN Activity Monitoring Table */}
          <div className="bg-card border border-border/40 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-purple-400" />
                <h2 className="font-bold text-base">Employee Activity Monitoring (Super Admin Analytics)</h2>
              </div>
              <span className="text-[11px] text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-lg border border-border/30">
                Click any row to open individual employee audit breakdown
              </span>
            </div>

            {/* Disclaimer Banner */}
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center gap-2.5">
              <Info size={16} className="shrink-0" />
              <span>
                <strong>Super Admin Notice:</strong> Activity analytics (mouse movement, clicks, keyboard events) are separate informational indicators only and <strong>NEVER</strong> increase official face-verified working hours.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border/40 font-semibold uppercase text-muted-foreground bg-muted/20">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Face-Verified Working</th>
                    <th className="py-3 px-4 text-right">Meeting Time</th>
                    <th className="py-3 px-4 text-right">Mouse Activity</th>
                    <th className="py-3 px-4 text-right">Keyboard Activity</th>
                    <th className="py-3 px-4 text-right">Idle Time</th>
                    <th className="py-3 px-4 text-right">Clicks</th>
                    <th className="py-3 px-4 text-right">Key Events</th>
                    <th className="py-3 px-4 text-center">Connection</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filteredAdminEmployees && filteredAdminEmployees.length > 0 ? (
                    filteredAdminEmployees.map((emp: any) => (
                      <tr
                        key={emp.user.id}
                        onClick={() => setSelectedAdminEmployeeId(emp.user.id)}
                        className="hover:bg-muted/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                              {emp.user.name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{emp.user.name}</div>
                              <div className="text-[11px] text-muted-foreground">{emp.user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">{getStateBadge(emp.currentState)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                          {formatDuration(emp.verifiedWorkingSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-400">
                          {formatDuration(emp.meetingSeconds || 0)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-purple-400">
                          {formatDuration(emp.mouseActiveSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-blue-400">
                          {formatDuration(emp.keyboardActiveSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-amber-400">
                          {formatDuration(emp.idleSeconds)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-foreground font-semibold">
                          {emp.mouseClickCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-foreground font-semibold">
                          {emp.keyboardEventCount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                              emp.isOnline
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                                : 'bg-muted text-muted-foreground border border-border/40'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${emp.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-muted-foreground'}`} />
                            {emp.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-muted-foreground">
                        No employees found matching filter criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL 1: CAMERA PRIVACY CONSENT                                     */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showConsentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowConsentModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#121216',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              padding: '24px',
            }}
            className="space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-primary">
              <div className="p-3 rounded-xl bg-primary/10">
                <ScanFace size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Camera Access & Privacy Notice</h3>
                <p className="text-xs text-muted-foreground">Required for active face verification</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Camera access is required to verify active work sessions. Face detection is used only to determine whether a human face is visible in front of your device. Camera video is strictly analyzed locally in memory and is <span className="font-semibold text-white">never stored, recorded, or uploaded</span>.
            </p>

            <div className="p-3 rounded-xl bg-muted/40 border border-border/40 space-y-1.5 text-xs">
              <div className="flex items-center gap-2 text-white font-semibold">
                <ShieldCheck size={14} className="text-emerald-400" />
                <span>Zero Biometric Template Storage</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                Your facial identity is already established via your authenticated login. Face detection only checks face visibility.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowConsentModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAllowCameraAndStartWorking}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md shadow-emerald-600/20"
              >
                Allow Camera & Start Working
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL 2: CONFIRM END WORKDAY                                        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {showEndConfirmModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setShowEndConfirmModal(false)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '480px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#121216',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              padding: '24px',
            }}
            className="space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 rounded-xl bg-rose-500/10">
                <Square size={24} />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">End Workday Confirmation</h3>
                <p className="text-xs text-muted-foreground">Finalize today's attendance session</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to end your workday? All camera tracks and working intervals will be stopped. <span className="font-semibold text-white">You will not be able to start another working session today.</span>
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => setShowEndConfirmModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmEndWorkday}
                disabled={endWorkdayMutation.isPending}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all shadow-md shadow-rose-600/20"
              >
                {endWorkdayMutation.isPending ? 'Finalizing...' : 'End Workday'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────── */}
      {/* MODAL 3: SUPER_ADMIN INDIVIDUAL EMPLOYEE ACTIVITY BREAKDOWN        */}
      {/* ─────────────────────────────────────────────────────────────────── */}
      {selectedAdminEmployeeId && selectedEmployeeDetails && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => setSelectedAdminEmployeeId(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '820px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#121216',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8)',
              padding: '24px',
            }}
            className="space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-base">
                  {selectedEmployeeDetails.employee.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {selectedEmployeeDetails.employee.name}
                    {getStateBadge(selectedEmployeeDetails.officialAttendance.currentState)}
                  </h3>
                  <div className="text-xs text-muted-foreground">
                    {selectedEmployeeDetails.employee.email} • {selectedEmployeeDetails.employee.role?.name}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedAdminEmployeeId(null)}
                className="p-2 rounded-xl text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Split Sections: Official Work vs Admin Activity */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Box 1: Official Attendance (Authoritative) */}
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <ScanFace size={15} />
                  Official Attendance Summary
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Clock In:</span>
                    <span className="font-mono font-medium text-white">
                      {selectedEmployeeDetails.officialAttendance.clockIn
                        ? new Date(selectedEmployeeDetails.officialAttendance.clockIn).toLocaleTimeString()
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Clock Out:</span>
                    <span className="font-mono font-medium text-white">
                      {selectedEmployeeDetails.officialAttendance.clockOut
                        ? new Date(selectedEmployeeDetails.officialAttendance.clockOut).toLocaleTimeString()
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground font-semibold">Face-Verified Working:</span>
                    <span className="font-mono font-bold text-emerald-400">
                      {formatDuration(selectedEmployeeDetails.officialAttendance.verifiedWorkingSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Meeting Time:</span>
                    <span className="font-mono text-indigo-400">
                      {formatDuration(selectedEmployeeDetails.officialAttendance.meetingSeconds || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Break Time:</span>
                    <span className="font-mono text-blue-400">
                      {formatDuration(selectedEmployeeDetails.officialAttendance.breakSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Lunch Time:</span>
                    <span className="font-mono text-purple-400">
                      {formatDuration(selectedEmployeeDetails.officialAttendance.lunchSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Face Missing:</span>
                    <span className="font-mono text-amber-400">
                      {formatDuration(selectedEmployeeDetails.officialAttendance.faceMissingSeconds)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Box 2: Activity Monitoring (Informational) */}
              <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <Activity size={15} />
                  Activity Analytics (Super Admin Only)
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Mouse Active Duration:</span>
                    <span className="font-mono font-semibold text-purple-400">
                      {formatDuration(selectedEmployeeDetails.activityAnalytics.mouseActiveSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Keyboard Active Duration:</span>
                    <span className="font-mono font-semibold text-blue-400">
                      {formatDuration(selectedEmployeeDetails.activityAnalytics.keyboardActiveSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Mouse Clicks:</span>
                    <span className="font-mono font-bold text-white">
                      {selectedEmployeeDetails.activityAnalytics.mouseClickCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Keyboard Events:</span>
                    <span className="font-mono font-bold text-white">
                      {selectedEmployeeDetails.activityAnalytics.keyboardEventCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/20">
                    <span className="text-muted-foreground">Idle Duration:</span>
                    <span className="font-mono text-amber-400">
                      {formatDuration(selectedEmployeeDetails.activityAnalytics.idleSeconds)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-muted-foreground">Last Interaction:</span>
                    <span className="font-mono text-muted-foreground">
                      {selectedEmployeeDetails.activityAnalytics.lastActivityAt
                        ? new Date(selectedEmployeeDetails.activityAnalytics.lastActivityAt).toLocaleTimeString()
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Audit Timeline Events */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Audit Timeline Events ({selectedEmployeeDetails.timelineEvents?.length || 0})
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 rounded-xl bg-muted/20 border border-border/30">
                {selectedEmployeeDetails.timelineEvents && selectedEmployeeDetails.timelineEvents.length > 0 ? (
                  selectedEmployeeDetails.timelineEvents.map((evt: any) => (
                    <div key={evt.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/40">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        <span className="font-medium text-white">{evt.type.replace(/_/g, ' ')}</span>
                      </div>
                      {evt.metadata && (
                        <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">
                          {evt.metadata}
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-muted-foreground text-center py-4">No audit events for this date.</div>
                )}
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground italic border-t border-border/40 pt-3 text-center">
              "Activity analytics are informational only and do not determine official working hours."
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default AttendancePage;
