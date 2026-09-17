import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import {
  CalendarDays, Plus, CheckCircle2, XCircle, Clock,
  FileText, TrendingUp, CalendarCheck, CalendarX, RefreshCw,
  Check, X,
} from 'lucide-react';

// ─── Helpers ───────────────────────────────────────────────────────────────
function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
      <CheckCircle2 size={11} /> Approved
    </span>
  );
  if (status === 'REJECTED') return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
      <XCircle size={11} /> Rejected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
      <Clock size={11} /> Pending
    </span>
  );
}

// ─── Apply Leave Modal ──────────────────────────────────────────────────────
function ApplyLeaveModal({
  onClose,
  leaveTypes,
  approvers,
  onSuccess,
}: {
  onClose: () => void;
  leaveTypes: any[];
  approvers: any[];
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    leaveTypeId: leaveTypes[0]?.id || '',
    startDate: '',
    endDate: '',
    reason: '',
    approverId: approvers[0]?.id || '',
  });
  const [submitting, setSubmitting] = useState(false);

  const totalDays = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const diff = new Date(form.endDate).getTime() - new Date(form.startDate).getTime();
    if (diff < 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }, [form.startDate, form.endDate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.leaveTypeId || !form.startDate || !form.endDate || !form.reason.trim() || !form.approverId) {
      toast.error('Please fill all fields');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      toast.error('End date must be after start date');
      return;
    }
    try {
      setSubmitting(true);
      await api.post('/leaves', form);
      toast.success('Leave request submitted successfully!');
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err?.error || err?.response?.data?.error || 'Failed to submit leave request');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div
        style={{ width: '100%', maxWidth: '540px', background: '#121216', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', overflow: 'hidden' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
              <CalendarDays size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>Apply for Leave</h2>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>Submit a new leave request</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Leave Type */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Leave Type *</label>
            <select
              value={form.leaveTypeId}
              onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))}
              className="input"
              style={{ width: '100%' }}
            >
              {leaveTypes.map((t: any) => (
                <option key={t.id} value={t.id}>{t.label}{t.maxDaysPerYear > 0 ? ` (max ${t.maxDaysPerYear} days/year)` : ''}</option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Start Date *</label>
              <input type="date" className="input" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} style={{ width: '100%' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>End Date *</label>
              <input type="date" className="input" value={form.endDate} min={form.startDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} style={{ width: '100%' }} />
            </div>
          </div>

          {totalDays > 0 && (
            <div style={{ padding: '10px 14px', borderRadius: '10px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', fontSize: '13px', color: '#a5b4fc' }}>
              📅 Duration: <strong>{totalDays} {totalDays === 1 ? 'day' : 'days'}</strong>
            </div>
          )}

          {/* Reason */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Reason *</label>
            <textarea
              className="input"
              rows={3}
              placeholder="Briefly explain the reason for your leave..."
              value={form.reason}
              onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          {/* Approver */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Select Approver *</label>
            <select
              value={form.approverId}
              onChange={e => setForm(p => ({ ...p, approverId: e.target.value }))}
              className="input"
              style={{ width: '100%' }}
            >
              {approvers.map((a: any) => (
                <option key={a.id} value={a.id}>{a.name} — Super Admin</option>
              ))}
            </select>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Only Super Admins can approve leave requests.</p>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '4px' }}>
            <button type="button" onClick={onClose} className="btn btn-ghost" disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {submitting ? 'Submitting...' : 'Submit Leave Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Action Note Modal (for approve/reject) ─────────────────────────────────
function ActionNoteModal({ action, leave, onConfirm, onClose }: { action: 'approve' | 'reject'; leave: any; onConfirm: (note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={onClose}>
      <div style={{ width: '100%', maxWidth: '420px', background: '#121216', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: action === 'approve' ? '#4ade80' : '#f87171' }}>
          {action === 'approve' ? '✅ Approve Leave' : '❌ Reject Leave'} — {leave?.user?.name}
        </h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
          {formatDate(leave.startDate)} → {formatDate(leave.endDate)} ({leave.totalDays} days) · {leave.leaveType?.label}
        </p>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>Note (optional)</label>
          <textarea className="input" rows={3} placeholder="Add a note for the employee..." value={note} onChange={e => setNote(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-ghost">Cancel</button>
          <button
            onClick={() => onConfirm(note)}
            className="btn btn-primary"
            style={{ background: action === 'approve' ? '#16a34a' : '#dc2626', borderColor: action === 'approve' ? '#16a34a' : '#dc2626' }}
          >
            {action === 'approve' ? 'Approve' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main LeavePage ─────────────────────────────────────────────────────────
export function LeavePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [activeAdminTab, setActiveAdminTab] = useState<'pending' | 'all'>('pending');
  const [actionModal, setActionModal] = useState<{ action: 'approve' | 'reject'; leave: any } | null>(null);

  // Fetch leave types
  const { data: leaveTypes = [] } = useQuery({ queryKey: ['leave-types'], queryFn: () => api.get('/leaves/types').then(r => r.data) });
  // Fetch approvers (super admins)
  const { data: approvers = [] } = useQuery({ queryKey: ['leave-approvers'], queryFn: () => api.get('/leaves/approvers').then(r => r.data) });
  // Fetch my attendance summary
  const { data: attendanceSummary = [] } = useQuery({ queryKey: ['leave-attendance-summary'], queryFn: () => api.get('/leaves/attendance-summary').then(r => r.data) });
  // Fetch my leave requests
  const { data: myLeaves = [], refetch: refetchMyLeaves } = useQuery({ queryKey: ['my-leaves'], queryFn: () => api.get('/leaves/my').then(r => r.data) });
  // Admin: all leaves
  const { data: adminLeaves = [], refetch: refetchAdminLeaves } = useQuery({
    queryKey: ['admin-leaves'],
    queryFn: () => api.get('/leaves/admin/all').then(r => r.data),
    enabled: isSuperAdmin,
  });

  const pendingLeaves = adminLeaves.filter((l: any) => l.status === 'PENDING');

  // Approve/reject mutations
  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.patch(`/leaves/${id}/approve`, { note }),
    onSuccess: () => { toast.success('Leave approved!'); refetchAdminLeaves(); setActionModal(null); },
    onError: (err: any) => toast.error(err?.error || 'Failed to approve'),
  });
  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.patch(`/leaves/${id}/reject`, { note }),
    onSuccess: () => { toast.success('Leave rejected.'); refetchAdminLeaves(); setActionModal(null); },
    onError: (err: any) => toast.error(err?.error || 'Failed to reject'),
  });

  const handleAction = (note: string) => {
    if (!actionModal) return;
    const { action, leave } = actionModal;
    if (action === 'approve') approveMutation.mutate({ id: leave.id, note });
    else rejectMutation.mutate({ id: leave.id, note });
  };

  const leavesToShow = activeAdminTab === 'pending' ? pendingLeaves : adminLeaves;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '48px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* ─── Page Header ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', padding: '20px 24px', borderRadius: '18px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ padding: '12px', borderRadius: '14px', background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>
            <CalendarDays size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>Leave Management</h1>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {isSuperAdmin ? 'Manage leave requests for all employees' : 'Apply for leaves and track your leave history'}
            </p>
          </div>
        </div>
        {!isSuperAdmin && (
          <button
            onClick={() => setShowApplyModal(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px' }}
          >
            <Plus size={15} /> Apply for Leave
          </button>
        )}
      </div>

      {/* ─── EMPLOYEE VIEW ─── */}
      {!isSuperAdmin && (
        <>
          {/* Monthly Attendance Summary */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <TrendingUp size={18} style={{ color: 'var(--color-primary)' }} />
              <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>Monthly Working Days Summary</h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Month</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Days Present</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Leaves Taken</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Net Working Days</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceSummary.length > 0 ? attendanceSummary.map((row: any) => (
                    <tr key={row.key} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/2 transition-colors">
                      <td style={{ padding: '13px 20px', fontWeight: 600 }}>{row.month}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#4ade80' }}>
                          <CalendarCheck size={13} /> {row.presentDays}
                        </span>
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: row.leaveDays > 0 ? '#fb923c' : 'var(--text-muted)' }}>
                          <CalendarX size={13} /> {row.leaveDays}
                        </span>
                      </td>
                      <td style={{ padding: '13px 20px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>{row.netWorkingDays}</span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No attendance records found. Mark your attendance to see monthly working days.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* My Leave Requests */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText size={18} style={{ color: 'var(--color-primary)' }} />
                <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0 }}>My Leave Requests</h2>
              </div>
              <button
                onClick={() => setShowApplyModal(true)}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 14px', fontSize: '12px' }}
              >
                <Plus size={13} /> Apply Leave
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Leave Type</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>From</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>To</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Days</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Approver</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {myLeaves.length > 0 ? myLeaves.map((leave: any) => (
                    <tr key={leave.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/2 transition-colors">
                      <td style={{ padding: '13px 20px' }}>
                        <span style={{ fontWeight: 600 }}>{leave.leaveType?.label}</span>
                      </td>
                      <td style={{ padding: '13px 20px', fontFamily: 'monospace', fontSize: '12px' }}>{formatDate(leave.startDate)}</td>
                      <td style={{ padding: '13px 20px', fontFamily: 'monospace', fontSize: '12px' }}>{formatDate(leave.endDate)}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center', fontWeight: 700 }}>{leave.totalDays}</td>
                      <td style={{ padding: '13px 20px', color: 'var(--text-muted)' }}>{leave.approver?.name}</td>
                      <td style={{ padding: '13px 20px', textAlign: 'center' }}><StatusBadge status={leave.status} /></td>
                      <td style={{ padding: '13px 20px', color: 'var(--text-muted)', fontSize: '12px', fontStyle: leave.approverNote ? 'normal' : 'italic' }}>
                        {leave.approverNote || '—'}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        No leave requests yet. Click "Apply Leave" to submit your first request.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ─── SUPER ADMIN VIEW ─── */}
      {isSuperAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
            {[
              { label: 'Total Requests', value: adminLeaves.length, color: '#a5b4fc' },
              { label: 'Pending', value: pendingLeaves.length, color: '#fbbf24' },
              { label: 'Approved', value: adminLeaves.filter((l: any) => l.status === 'APPROVED').length, color: '#4ade80' },
              { label: 'Rejected', value: adminLeaves.filter((l: any) => l.status === 'REJECTED').length, color: '#f87171' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '14px', padding: '16px 20px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>{s.label}</div>
                <div style={{ fontSize: '26px', fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tab Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.04)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-default)', width: 'fit-content' }}>
            {(['pending', 'all'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveAdminTab(tab)}
                style={{
                  padding: '7px 18px', borderRadius: '9px', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '12px', textTransform: 'capitalize', transition: 'all 0.15s',
                  background: activeAdminTab === tab ? '#ffffff' : 'transparent',
                  color: activeAdminTab === tab ? '#000000' : 'var(--text-muted)',
                }}
              >
                {tab === 'pending' ? `⏳ Pending (${pendingLeaves.length})` : '📋 All Requests'}
              </button>
            ))}
          </div>

          {/* Leave Requests Table */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '18px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-subtle)' }}>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Employee</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Leave Type</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Duration</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Reason</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Status</th>
                    {activeAdminTab === 'pending' && (
                      <th style={{ padding: '12px 20px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase' }}>Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {leavesToShow.length > 0 ? leavesToShow.map((leave: any) => (
                    <tr key={leave.id} style={{ borderBottom: '1px solid var(--border-subtle)' }} className="hover:bg-white/2 transition-colors">
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(99,102,241,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 700, color: '#818cf8', flexShrink: 0, backgroundImage: leave.user?.avatar ? `url("${leave.user.avatar}")` : 'none', backgroundSize: 'cover' }}>
                            {!leave.user?.avatar && (leave.user?.name?.charAt(0) || 'U')}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{leave.user?.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{leave.user?.department?.name || 'General'}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <span style={{ fontWeight: 600 }}>{leave.leaveType?.label}</span>
                      </td>
                      <td style={{ padding: '14px 20px' }}>
                        <div style={{ fontSize: '12px', fontFamily: 'monospace' }}>{formatDate(leave.startDate)}</div>
                        <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>→ {formatDate(leave.endDate)}</div>
                        <div style={{ fontSize: '11px', color: '#a5b4fc', marginTop: '2px' }}>{leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}</div>
                      </td>
                      <td style={{ padding: '14px 20px', maxWidth: '200px' }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as any}>{leave.reason}</span>
                      </td>
                      <td style={{ padding: '14px 20px', textAlign: 'center' }}><StatusBadge status={leave.status} /></td>
                      {activeAdminTab === 'pending' && (
                        <td style={{ padding: '14px 20px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button
                              onClick={() => setActionModal({ action: 'approve', leave })}
                              style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #16a34a', background: 'rgba(22,163,74,0.1)', color: '#4ade80', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Check size={12} /> Approve
                            </button>
                            <button
                              onClick={() => setActionModal({ action: 'reject', leave })}
                              style={{ padding: '5px 12px', borderRadius: '8px', border: '1px solid #dc2626', background: 'rgba(220,38,38,0.1)', color: '#f87171', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <X size={12} /> Reject
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={activeAdminTab === 'pending' ? 6 : 5} style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        {activeAdminTab === 'pending' ? '🎉 No pending leave requests!' : 'No leave requests found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showApplyModal && leaveTypes.length > 0 && approvers.length > 0 && (
        <ApplyLeaveModal
          onClose={() => setShowApplyModal(false)}
          leaveTypes={leaveTypes}
          approvers={approvers}
          onSuccess={() => { refetchMyLeaves(); queryClient.invalidateQueries({ queryKey: ['my-leaves'] }); }}
        />
      )}
      {actionModal && (
        <ActionNoteModal
          action={actionModal.action}
          leave={actionModal.leave}
          onConfirm={handleAction}
          onClose={() => setActionModal(null)}
        />
      )}
    </div>
  );
}
