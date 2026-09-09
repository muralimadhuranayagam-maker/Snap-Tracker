import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/api';
import toast from 'react-hot-toast';
import { Activity } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }
    
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAuth(data.user, data.token);
      toast.success(`Welcome back, ${data.user.name}`);
      navigate('/');
    } catch (err: any) {
      toast.error(err?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const autofill = (e: string, p: string) => {
    setEmail(e);
    setPassword(p);
  };

  return (
    <div className="login-page">
      <div 
        className="login-bg-blob" 
        style={{ background: 'var(--accent)', width: 600, height: 600, top: '-200px', left: '-200px', opacity: 0.15 }}
      />
      <div 
        className="login-bg-blob" 
        style={{ background: 'var(--purple)', width: 500, height: 500, bottom: '-100px', right: '-100px', opacity: 0.1 }}
      />
      
      <div className="login-card z-10">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, var(--accent), var(--purple))' }}>
            <Activity size={24} strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SnapServe</h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="input-group">
            <label className="input-label">Email Address</label>
            <input 
              type="email" 
              className="input" 
              placeholder="name@snapserve.io" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
            />
          </div>
          
          <div className="input-group">
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">Password</label>
              <a href="#" className="text-xs text-accent font-medium">Forgot?</a>
            </div>
            <input 
              type="password" 
              className="input" 
              placeholder="••••••••" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary w-full mt-2 py-3" 
            disabled={loading}
          >
            {loading ? <div className="spinner spinner-sm"></div> : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-subtle">
          <div className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 text-center">Quick Login (Demo)</div>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-secondary btn-sm" onClick={() => autofill('superadmin1@snapserve.io', 'Admin@1234')}>Super Admin</button>
            <button className="btn btn-secondary btn-sm" onClick={() => autofill('admin1@snapserve.io', 'Admin@1234')}>Admin</button>
            <button className="btn btn-secondary btn-sm" onClick={() => autofill('rahul.kumar@snapserve.io', 'Employee@1234')}>FDE Employee</button>
            <button className="btn btn-secondary btn-sm" onClick={() => autofill('david.cohen@snapserve.io', 'Employee@1234')}>Sales Employee</button>
          </div>
        </div>
      </div>
    </div>
  );
}
