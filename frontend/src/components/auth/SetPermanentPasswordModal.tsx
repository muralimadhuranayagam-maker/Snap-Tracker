import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import { ShieldCheck, Lock, Eye, EyeOff, Check, X, ArrowRight, LogOut } from 'lucide-react';

export function SetPermanentPasswordModal() {
  const { user, updateUser, logout } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Password validation rules
  const hasMinLength = newPassword.length >= 8;
  const isDifferentFromCurrent = !currentPassword || newPassword !== currentPassword;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = hasMinLength && isDifferentFromCurrent && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!hasMinLength) {
      setErrorMessage('New password must be at least 8 characters long');
      return;
    }
    if (!passwordsMatch) {
      setErrorMessage('Permanent password and confirmation do not match');
      return;
    }
    if (currentPassword && newPassword === currentPassword) {
      setErrorMessage('New permanent password must be different from your temporary password');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/set-permanent-password', {
        currentPassword: currentPassword || undefined,
        newPassword,
      });

      updateUser({ mustChangePassword: false });
      toast.success('Permanent password set successfully! Welcome to SnapServe.');
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || 'Failed to set permanent password';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ 
        backgroundColor: 'rgba(5, 5, 8, 0.88)', 
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)'
      }}
    >
      <div 
        className="w-full max-w-lg rounded-2xl p-6 sm:p-8 relative shadow-2xl animate-in zoom-in-95 duration-200"
        style={{
          background: 'linear-gradient(180deg, rgba(26, 26, 36, 0.98) 0%, rgba(18, 18, 24, 0.98) 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(99, 102, 241, 0.15)'
        }}
      >
        {/* Top Header Badge */}
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <ShieldCheck size={14} className="text-indigo-400" />
            <span>First-Time Login Security</span>
          </div>
          <span className="text-[11px] text-muted font-mono">SnapServe Auth</span>
        </div>

        {/* Title and Explanation */}
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mb-2">
            Set Your Permanent Password
          </h2>
          <p className="text-xs text-muted leading-relaxed">
            Welcome to SnapServe, <span className="text-white font-semibold">{user?.name}</span>! Your account was created with a temporary password. To safeguard your account and company deliverables, please create a new permanent password.
          </p>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2.5">
            <X size={15} className="shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Temporary Password */}
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">
              Current Temporary Password
            </label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter the password you just logged in with (e.g. Welcome@123)"
                className="input text-xs w-full py-2.5 pl-3 pr-10 bg-black/40 border border-subtle rounded-xl text-primary focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <p className="text-[11px] text-muted mt-1">
              Verify your temporary initial credential.
            </p>
          </div>

          {/* New Permanent Password */}
          <div>
            <label className="block text-xs font-medium text-white mb-1.5">
              New Permanent Password *
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a strong permanent password"
                className="input text-xs w-full py-2.5 pl-3 pr-10 bg-black/40 border border-subtle rounded-xl text-primary focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                tabIndex={-1}
              >
                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Confirm Permanent Password */}
          <div>
            <label className="block text-xs font-medium text-white mb-1.5">
              Confirm Permanent Password *
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your permanent password"
                className="input text-xs w-full py-2.5 pl-3 pr-10 bg-black/40 border border-subtle rounded-xl text-primary focus:border-accent"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Live Requirements Indicator */}
          <div className="p-3 rounded-xl bg-black/30 border border-subtle/50 space-y-1.5">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
              Security Requirements
            </div>
            <div className="flex items-center gap-2 text-xs">
              {hasMinLength ? (
                <Check size={13} className="text-emerald-400 shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-subtle flex items-center justify-center shrink-0" />
              )}
              <span className={hasMinLength ? 'text-emerald-400 font-medium' : 'text-muted'}>
                At least 8 characters
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {passwordsMatch ? (
                <Check size={13} className="text-emerald-400 shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-subtle flex items-center justify-center shrink-0" />
              )}
              <span className={passwordsMatch ? 'text-emerald-400 font-medium' : 'text-muted'}>
                Both passwords match exactly
              </span>
            </div>
            {currentPassword && (
              <div className="flex items-center gap-2 text-xs">
                {isDifferentFromCurrent ? (
                  <Check size={13} className="text-emerald-400 shrink-0" />
                ) : (
                  <div className="w-3.5 h-3.5 rounded-full border border-subtle flex items-center justify-center shrink-0" />
                )}
                <span className={isDifferentFromCurrent ? 'text-emerald-400 font-medium' : 'text-amber-400'}>
                  Different from temporary password
                </span>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex flex-col gap-3">
            <button
              type="submit"
              disabled={loading || !isFormValid}
              className="btn btn-primary w-full py-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="spinner spinner-sm" />
                  <span>Updating Password...</span>
                </>
              ) : (
                <>
                  <Lock size={14} />
                  <span>Save Permanent Password & Continue</span>
                  <ArrowRight size={14} />
                </>
              )}
            </button>

            {/* Switch Account / Logout */}
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={logout}
                className="text-[11px] text-muted hover:text-white transition inline-flex items-center gap-1"
              >
                <LogOut size={12} />
                <span>Not {user?.name}? Log out to switch account</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
