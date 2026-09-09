import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { 
  Settings, Users, Building, Shield, UserPlus, 
  Search, X, Check 
} from 'lucide-react';
import toast from 'react-hot-toast';

export function SettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'departments'>('users');
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);

  // Form state
  const [newUser, setNewUser] = useState({
    name: '', email: '', password: '', 
    title: '', phone: '', roleId: '', departmentId: ''
  });

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  // Fetch Users
  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['settings-users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    }
  });

  // Fetch Departments
  const { data: departments, isLoading: loadingDepts } = useQuery({
    queryKey: ['settings-departments'],
    queryFn: async () => {
      const res = await api.get('/departments');
      return res.data;
    }
  });

  // Fetch Roles
  const { data: roles } = useQuery({
    queryKey: ['settings-roles'],
    queryFn: async () => {
      const res = await api.get('/settings/roles');
      return res.data;
    }
  });

  const createUserMutation = useMutation({
    mutationFn: (userData: any) => api.post('/users', userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-users'] });
      toast.success('User created successfully');
      setIsAddUserModalOpen(false);
      setNewUser({ name: '', email: '', password: '', title: '', phone: '', roleId: '', departmentId: '' });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create user');
    }
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(newUser);
  };

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Settings size={24} className="text-muted" /> 
            Settings & Administration
          </h1>
          <p className="page-subtitle">Manage organization structure and user access.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
        
        {/* Sidebar Nav */}
        <div className="lg:w-64 shrink-0 flex flex-col gap-2">
          <button 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-primary text-white shadow-md' : 'bg-surface hover:bg-surface-hover text-muted hover:text-primary border border-transparent'}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} /> User Management
          </button>
          <button 
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'departments' ? 'bg-primary text-white shadow-md' : 'bg-surface hover:bg-surface-hover text-muted hover:text-primary border border-transparent'}`}
            onClick={() => setActiveTab('departments')}
          >
            <Building size={18} /> Departments
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 card overflow-hidden flex flex-col">
          
          {activeTab === 'users' && (
            <>
              <div className="card-header border-b border-subtle pb-4 flex justify-between items-center">
                <h2 className="font-semibold text-lg text-primary">System Users</h2>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                    <input type="text" placeholder="Search users..." className="input pl-9 h-9 text-sm w-64" />
                  </div>
                  {isSuperAdmin && (
                    <button 
                      className="btn btn-primary h-9"
                      onClick={() => setIsAddUserModalOpen(true)}
                    >
                      <UserPlus size={16} /> Add User
                    </button>
                  )}
                </div>
              </div>
              
              <div className="table-wrapper flex-1">
                {loadingUsers ? (
                  <div className="flex justify-center p-8"><div className="spinner"></div></div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Role</th>
                        <th>Department</th>
                        <th>Active Tasks</th>
                        <th>Status</th>
                        {isSuperAdmin && <th className="text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {users?.map((u: any) => (
                        <tr key={u.id} className="hover:bg-surface-hover transition-colors group">
                          <td>
                            <div className="flex items-center gap-3">
                              <div className="avatar avatar-sm bg-accent">
                                {u.avatar ? <img src={u.avatar} /> : u.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-medium text-primary text-sm">{u.name}</div>
                                <div className="text-xs text-muted">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge bg-surface border border-subtle flex items-center gap-1 w-fit">
                              <Shield size={10} className={u.role.name === 'SUPER_ADMIN' ? 'text-amber' : u.role.name === 'ADMIN' ? 'text-blue' : 'text-muted'} />
                              {u.role.name.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            {u.department ? (
                              <span className="badge" style={{ backgroundColor: `${u.department.color}20`, color: u.department.color, borderColor: `${u.department.color}30`, borderWidth: 1 }}>
                                {u.department.name}
                              </span>
                            ) : <span className="text-muted italic text-xs">None</span>}
                          </td>
                          <td>
                            <span className="font-mono text-sm">{u.activeTaskCount}</span>
                          </td>
                          <td>
                            {u.isActive ? (
                              <span className="flex items-center gap-1 text-xs text-green font-medium"><Check size={12} /> Active</span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-red font-medium"><X size={12} /> Inactive</span>
                            )}
                          </td>
                          {isSuperAdmin && (
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity tr-hover-show">
                                <button 
                                  className="btn-icon btn-ghost w-8 h-8 rounded text-muted hover:text-blue hover:bg-blue-subtle"
                                  title="Edit User"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // TODO: Open edit modal
                                    toast('Edit user coming soon', { icon: '🔧' });
                                  }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                </button>
                                {u.isActive && u.id !== user?.id && (
                                  <button 
                                    className="btn-icon btn-ghost w-8 h-8 rounded text-muted hover:text-red hover:bg-red-subtle"
                                    title="Deactivate User"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm(`Are you sure you want to deactivate ${u.name}?`)) {
                                        api.delete(`/users/${u.id}`).then(() => {
                                          queryClient.invalidateQueries({ queryKey: ['settings-users'] });
                                          toast.success('User deactivated');
                                        }).catch(err => {
                                          toast.error(err.response?.data?.error || 'Failed to deactivate');
                                        });
                                      }
                                    }}
                                  >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {activeTab === 'departments' && (
            <>
              <div className="card-header border-b border-subtle pb-4 flex justify-between items-center">
                <h2 className="font-semibold text-lg text-primary">Departments</h2>
              </div>
              <div className="table-wrapper flex-1">
                {loadingDepts ? (
                  <div className="flex justify-center p-8"><div className="spinner"></div></div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Department Name</th>
                        <th>Code</th>
                        <th>Members</th>
                        <th>Total Tasks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {departments?.map((d: any) => (
                        <tr key={d.id}>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }}></div>
                              <span className="font-medium text-primary">{d.name}</span>
                            </div>
                          </td>
                          <td><span className="font-mono text-xs text-muted">{d.code}</span></td>
                          <td><span className="font-mono text-sm">{d._count.users}</span></td>
                          <td><span className="font-mono text-sm">{d._count.tasks}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-subtle rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-subtle flex justify-between items-center">
              <h2 className="font-semibold text-lg text-primary flex items-center gap-2">
                <UserPlus size={18} /> Add New User
              </h2>
              <button 
                className="text-muted hover:text-primary transition-colors"
                onClick={() => setIsAddUserModalOpen(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto custom-scrollbar">
              <form id="addUserForm" onSubmit={handleCreateUser} className="flex flex-col gap-4">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Full Name</label>
                    <input required type="text" className="input text-sm" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Email</label>
                    <input required type="email" className="input text-sm" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Temporary Password</label>
                  <input required type="password" minLength={8} className="input text-sm" placeholder="Min 8 characters" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Role</label>
                    <select required className="input text-sm py-2" value={newUser.roleId} onChange={e => setNewUser({...newUser, roleId: e.target.value})}>
                      <option value="">Select Role...</option>
                      {roles?.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name.replace('_', ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Department</label>
                    <select className="input text-sm py-2" value={newUser.departmentId} onChange={e => setNewUser({...newUser, departmentId: e.target.value})}>
                      <option value="">Select Dept...</option>
                      {departments?.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Job Title</label>
                    <input type="text" className="input text-sm" placeholder="e.g. Sales Rep" value={newUser.title} onChange={e => setNewUser({...newUser, title: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label className="text-xs font-medium text-muted uppercase tracking-wider mb-1 block">Phone</label>
                    <input type="text" className="input text-sm" value={newUser.phone} onChange={e => setNewUser({...newUser, phone: e.target.value})} />
                  </div>
                </div>

              </form>
            </div>

            <div className="p-4 border-t border-subtle bg-surface-hover rounded-b-xl flex justify-end gap-3">
              <button 
                type="button" 
                className="btn btn-secondary"
                onClick={() => setIsAddUserModalOpen(false)}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                form="addUserForm"
                className="btn btn-primary"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
