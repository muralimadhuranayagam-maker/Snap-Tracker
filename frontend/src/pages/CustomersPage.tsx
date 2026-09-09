import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { 
  Building, 
  Plus, 
  Search, 
  FolderKanban, 
  Ticket, 
  CheckSquare, 
  ArrowRight
} from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

export function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAdmin = user && ['SUPER_ADMIN', 'ADMIN'].includes(user.role);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // New Customer Form State
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [tier, setTier] = useState('ENTERPRISE');
  const [industry, setIndustry] = useState('');
  const [arr, setArr] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', search, tierFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (tierFilter) params.append('tier', tierFilter);
      return api.get(`/customers?${params.toString()}`).then(r => r.data);
    },
    refetchInterval: 15_000,
  });

  const createCustomerMutation = useMutation({
    mutationFn: (data: any) => api.post('/customers', data),
    onSuccess: () => {
      toast.success('Customer account created');
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      setIsCreateModalOpen(false);
      setName('');
      setCode('');
      setArr('');
      setIndustry('');
      setContactName('');
      setContactEmail('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to create customer');
    }
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    createCustomerMutation.mutate({
      name,
      code,
      tier,
      industry,
      arr,
      primaryContactName: contactName,
      primaryContactEmail: contactEmail,
    });
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Customers</h1>
            <span className="badge bg-elevated font-mono text-xs text-muted">{customers.length} total</span>
          </div>
          <p className="text-xs text-muted mt-0.5">
            Client accounts shared across Sales, Forward Deployed Engineering, and Support.
          </p>
        </div>

        {isAdmin && (
          <button 
            className="btn btn-primary btn-sm flex items-center gap-1.5 shadow-sm"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={14} />
            <span>Add Customer</span>
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="card p-3 bg-surface border-subtle flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search size={14} className="text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder="Search customers by name, code, or industry..."
            className="input w-full pl-8 text-xs"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select 
          className="input text-xs py-1.5"
          value={tierFilter}
          onChange={e => setTierFilter(e.target.value)}
        >
          <option value="">All Tiers</option>
          <option value="ENTERPRISE">ENTERPRISE</option>
          <option value="GROWTH">GROWTH</option>
          <option value="STANDARD">STANDARD</option>
        </select>
      </div>

      {/* Customer Cards Grid */}
      {isLoading ? (
        <div className="py-16 text-center">
          <div className="spinner spinner-md mx-auto" />
          <div className="text-xs text-muted mt-2">Loading customers...</div>
        </div>
      ) : customers.length === 0 ? (
        <div className="py-16 text-center text-muted text-xs">
          <Building size={28} className="mx-auto mb-2 opacity-40" />
          No customer accounts found.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {customers.map((c: any) => (
            <div 
              key={c.id}
              className="card p-5 bg-surface border-subtle hover:border-accent/40 transition cursor-pointer flex flex-col justify-between"
              onClick={() => navigate(`/customers/${c.id}`)}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="badge bg-green-subtle text-green text-[10px] font-mono">
                    {c.code}
                  </span>
                  <span className="badge bg-elevated text-[10px]">{c.tier}</span>
                </div>

                <div>
                  <h3 className="text-base font-semibold text-primary">{c.name}</h3>
                  <p className="text-xs text-muted mt-0.5">{c.industry || 'Enterprise Technology'}</p>
                </div>

                {/* Health Score & ARR */}
                <div className="p-2.5 rounded-lg bg-elevated/60 border border-subtle flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-muted block">Account Health</span>
                    <span className="font-bold text-green">{c.healthScore}%</span>
                  </div>
                  {c.arr && (
                    <div className="text-right">
                      <span className="text-[10px] text-muted block">ARR</span>
                      <span className="font-mono font-semibold text-primary">
                        ${(c.arr / 1000).toFixed(0)}k
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-subtle flex items-center justify-between text-xs text-muted">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1" title="Projects">
                    <FolderKanban size={13} className="text-blue" />
                    <span>{c._count?.projects || 0}</span>
                  </span>
                  <span className="flex items-center gap-1" title="Tickets">
                    <Ticket size={13} className="text-amber" />
                    <span>{c._count?.tickets || 0}</span>
                  </span>
                  <span className="flex items-center gap-1" title="Tasks">
                    <CheckSquare size={13} className="text-accent" />
                    <span>{c._count?.tasks || 0}</span>
                  </span>
                </div>

                <span className="text-accent flex items-center gap-1 text-xs font-medium">
                  Details <ArrowRight size={12} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Customer Modal */}
      {isCreateModalOpen && (
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header flex items-center justify-between pb-3 border-b border-subtle">
              <h3 className="font-semibold text-base text-primary flex items-center gap-2">
                <Building size={16} className="text-green" />
                Add Customer Account
              </h3>
              <button className="btn-icon btn-ghost" onClick={() => setIsCreateModalOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-secondary block mb-1">Company Name *</label>
                  <input 
                    type="text" 
                    className="input w-full text-xs" 
                    placeholder="e.g. Acme Cloud Corp"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1">Code *</label>
                  <input 
                    type="text" 
                    className="input w-full text-xs font-mono uppercase" 
                    placeholder="ACM"
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1">Tier</label>
                  <select 
                    className="input w-full text-xs"
                    value={tier}
                    onChange={e => setTier(e.target.value)}
                  >
                    <option value="ENTERPRISE">ENTERPRISE</option>
                    <option value="GROWTH">GROWTH</option>
                    <option value="STANDARD">STANDARD</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1">Industry</label>
                  <input 
                    type="text" 
                    className="input w-full text-xs" 
                    placeholder="e.g. FinTech, Cloud"
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-secondary block mb-1">Annual Recurring Revenue ($ ARR)</label>
                <input 
                  type="number" 
                  className="input w-full text-xs" 
                  placeholder="e.g. 180000"
                  value={arr}
                  onChange={e => setArr(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1">Primary Contact Name</label>
                  <input 
                    type="text" 
                    className="input w-full text-xs" 
                    placeholder="Jane Doe"
                    value={contactName}
                    onChange={e => setContactName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-secondary block mb-1">Primary Contact Email</label>
                  <input 
                    type="email" 
                    className="input w-full text-xs" 
                    placeholder="jane@customer.com"
                    value={contactEmail}
                    onChange={e => setContactEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
                <button type="button" className="btn btn-ghost text-xs" onClick={() => setIsCreateModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary text-xs"
                  disabled={createCustomerMutation.isPending}
                >
                  {createCustomerMutation.isPending ? 'Saving...' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
