import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { 
  Mail, 
  Phone, 
  Building2, 
  Briefcase, 
  CheckSquare, 
  Edit2, 
  Camera, 
  Trash2, 
  X, 
  Search, 
  ShieldCheck, 
  Check, 
  User as UserIcon,
  Sparkles,
  UserPlus,
  Key,
  Copy
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── INITIALS & COLOR GENERATOR ───────────────────────────────────────────────
export function getInitials(name: string): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
  'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
  'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
  'linear-gradient(135deg, #10b981 0%, #047857 100%)',
  'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0e7490 100%)',
  'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) {
    hash = (name || '').charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index];
}

function getRoleBadge(roleName: string) {
  const r = roleName?.toUpperCase();
  switch (r) {
    case 'SUPER_ADMIN':
      return { 
        label: 'Super Admin', 
        style: {
          background: 'rgba(168, 85, 247, 0.14)',
          color: '#d8b4fe',
          border: '1px solid rgba(168, 85, 247, 0.35)',
        }
      };
    case 'ADMIN':
      return { 
        label: 'Admin', 
        style: {
          background: 'rgba(59, 130, 246, 0.14)',
          color: '#93c5fd',
          border: '1px solid rgba(59, 130, 246, 0.35)',
        }
      };
    case 'FDE':
      return { 
        label: 'FDE Engineer', 
        style: {
          background: 'rgba(16, 185, 129, 0.14)',
          color: '#6ee7b7',
          border: '1px solid rgba(16, 185, 129, 0.35)',
        }
      };
    case 'SALES':
      return { 
        label: 'Sales', 
        style: {
          background: 'rgba(245, 158, 11, 0.14)',
          color: '#fcd34d',
          border: '1px solid rgba(245, 158, 11, 0.35)',
        }
      };
    case 'MARKETING':
      return { 
        label: 'Marketing', 
        style: {
          background: 'rgba(236, 72, 153, 0.14)',
          color: '#f472b6',
          border: '1px solid rgba(236, 72, 153, 0.35)',
        }
      };
    default:
      return { 
        label: roleName?.replace('_', ' ') || 'Member', 
        style: {
          background: 'rgba(255, 255, 255, 0.08)',
          color: '#e4e4e7',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }
      };
  }
}

// ─── MAIN TEAM DIRECTORY PAGE ─────────────────────────────────────────────────
export function TeamDirectoryPage() {
  const { user: currentUser, checkAuth } = useAuthStore();
  const queryClient = useQueryClient();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdmin = currentUser?.role === 'ADMIN';
  const canAddUser = isSuperAdmin || isAdmin;

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('ALL');

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    email: '',
    title: '',
    phone: '',
    avatar: '',
    departmentId: '',
    roleId: '',
    password: 'Welcome@123'
  });
  const [isUploadingCreatePhoto, setIsUploadingCreatePhoto] = useState(false);
  const createFileInputRef = useRef<HTMLInputElement | null>(null);

  // Edit Modal state
  const [editingMember, setEditingMember] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    title: '',
    phone: '',
    avatar: '',
    departmentId: '',
    roleId: ''
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Temp Password state
  const [tempPasswordState, setTempPasswordState] = useState<{ member: any, password: string, expiresAt: number } | null>(null);

  // Generate Temp Password Mutation
  const tempPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post(`/users/${userId}/temp-password`);
      return res.data;
    },
    onSuccess: (data, userId) => {
      const member = users.find((u: any) => u.id === userId);
      setTempPasswordState({
        member,
        password: data.tempPassword,
        expiresAt: Date.now() + 5 * 60 * 1000 // 5 minutes
      });
      toast.success('Temporary password generated!');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to generate temporary password');
    }
  });
  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    }
  });

  // 2. Fetch Departments for dropdown
  const { data: departments = [] } = useQuery<any[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const res = await api.get('/departments');
      return res.data;
    }
  });

  // 3. Fetch Roles (available for Super Admin and Admin)
  const { data: roles = [] } = useQuery<any[]>({
    queryKey: ['settings-roles'],
    queryFn: async () => {
      const res = await api.get('/settings/roles');
      return res.data;
    },
    enabled: canAddUser,
  });

  // Roles that can be assigned (Admin cannot create a Super Admin)
  const assignableRoles = roles.filter((r: any) => isSuperAdmin || r.name !== 'SUPER_ADMIN');

  // Helper to synchronize all user data caches across all views
  const syncAllUserQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['team'] });
    queryClient.invalidateQueries({ queryKey: ['departments'] });
    queryClient.invalidateQueries({ queryKey: ['chat-users'] });
    queryClient.invalidateQueries({ queryKey: ['chat-channels'] });
    queryClient.invalidateQueries({ queryKey: ['users-assignees'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['settings-users'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
  };

  // 4. Create User Mutation
  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/users', payload);
      return res.data;
    },
    onSuccess: (newUser) => {
      toast.success(`Team member "${newUser.name}" created successfully!`);
      syncAllUserQueries();
      setIsCreateModalOpen(false);
      setCreateForm({
        name: '',
        email: '',
        title: '',
        phone: '',
        avatar: '',
        departmentId: '',
        roleId: '',
        password: 'Welcome@123'
      });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to create team member');
    }
  });

  // 5. Update User Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: async (_, variables) => {
      toast.success('Profile updated successfully');
      syncAllUserQueries();
      if (variables.id === currentUser?.id) {
        await checkAuth();
      }
      setEditingMember(null);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update profile');
    }
  });

  // Open Create Modal
  const handleOpenCreateModal = () => {
    const defaultRole = assignableRoles.find((r: any) => r.name === 'EMPLOYEE' || r.name === 'FDE') || assignableRoles[0];
    setCreateForm({
      name: '',
      email: '',
      title: '',
      phone: '',
      avatar: '',
      departmentId: departments[0]?.id || '',
      roleId: defaultRole?.id || '',
      password: 'Welcome@123'
    });
    setIsCreateModalOpen(true);
  };

  // Upload Profile Picture for Create User — stored as base64 in DB
  const handleCreateAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    try {
      setIsUploadingCreatePhoto(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/upload/avatar', formData);
      setCreateForm((prev) => ({ ...prev, avatar: res.data.url }));
      toast.success('Photo uploaded successfully');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err?.error || 'Failed to upload photo');
    } finally {
      setIsUploadingCreatePhoto(false);
      if (createFileInputRef.current) createFileInputRef.current.value = '';
    }
  };

  const handleRemoveCreatePhoto = () => {
    setCreateForm((prev) => ({ ...prev, avatar: '' }));
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.roleId) {
      toast.error('Full Name, Email, and Role are required');
      return;
    }

    createMutation.mutate({
      name: createForm.name.trim(),
      email: createForm.email.trim().toLowerCase(),
      roleId: createForm.roleId,
      departmentId: createForm.departmentId || null,
      title: createForm.title.trim() || null,
      phone: createForm.phone.trim() || null,
      avatar: createForm.avatar.trim() || null,
      password: createForm.password.trim() || 'Welcome@123',
    });
  };

  // Open Edit Profile Modal
  const handleOpenEdit = (member: any) => {
    setEditingMember(member);
    setEditForm({
      name: member.name || '',
      email: member.email || '',
      title: member.title || '',
      phone: member.phone || '',
      avatar: member.avatar || '',
      departmentId: member.department?.id || '',
      roleId: member.role?.id || '',
    });
  };

  // Upload Profile Picture File (Edit modal) — stored as base64 in DB
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    try {
      setIsUploadingPhoto(true);
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/upload/avatar', formData);
      setEditForm((prev) => ({ ...prev, avatar: res.data.url }));
      toast.success('Photo uploaded! Click "Save Changes" to apply.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || err?.error || 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = () => {
    setEditForm((prev) => ({ ...prev, avatar: '' }));
    toast('Photo removed. First & last name initials will be displayed.', { icon: 'ℹ️' });
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    const payload: any = {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      title: editForm.title.trim(),
      phone: editForm.phone.trim(),
      avatar: editForm.avatar.trim() || null,
    };

    if (isSuperAdmin) {
      if (editForm.departmentId) payload.departmentId = editForm.departmentId;
      if (editForm.roleId) payload.roleId = editForm.roleId;
    }

    updateMutation.mutate({ id: editingMember.id, data: payload });
  };

  // Filtered Users
  const filteredUsers = users.filter((member: any) => {
    const q = searchTerm.toLowerCase().trim();
    const matchesSearch = !q || (
      member.name?.toLowerCase().includes(q) ||
      member.email?.toLowerCase().includes(q) ||
      member.title?.toLowerCase().includes(q) ||
      member.phone?.toLowerCase().includes(q) ||
      member.department?.name?.toLowerCase().includes(q)
    );

    const matchesDept = selectedDept === 'ALL' || member.department?.id === selectedDept;

    return matchesSearch && matchesDept;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px]">
        <div className="spinner spinner-lg text-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state text-red-400 py-12 text-center">
        Failed to load team directory
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* ─── HEADER BAR ─── */}
      <div className="flex flex-col gap-4 pb-2 border-b border-subtle">
        {/* Title & Stats */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title text-2xl font-bold tracking-tight text-white">Team Directory</h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/20 text-accent font-semibold border border-accent/30">
                {users.length} Colleagues
              </span>
            </div>
            <p className="page-subtitle text-xs text-muted mt-1">
              Browse company members, view contact info, and manage team profiles.
            </p>
          </div>
        </div>

        {/* Search & Department Filters + Action Button */}
        <div className="flex items-center justify-between gap-3 flex-wrap w-full">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative min-w-[240px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name, role, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input text-xs py-2 pl-9 pr-3 w-full bg-surface border border-subtle rounded-xl text-primary focus:border-accent"
              />
              {searchTerm && (
                <button 
                  type="button" 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-white"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="input text-xs py-2 px-3 bg-surface border border-subtle rounded-xl text-primary focus:border-accent"
            >
              <option value="ALL">All Departments ({users.length})</option>
              {departments.map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          {/* Add Team Member Action (Super Admin & Admin only) */}
          {canAddUser && (
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="btn btn-primary text-xs flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold shadow-sm hover:shadow ml-auto"
              title="Add a new employee to the team directory"
            >
              <UserPlus size={14} />
              <span>Add Team Member</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── MEMBERS GRID ─── */}
      {filteredUsers.length === 0 ? (
        <div className="empty-state-card py-16">
          <UserIcon size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
          <h3 className="text-base font-semibold text-primary">No team members found</h3>
          <p className="text-xs text-muted mt-1">Try adjusting your search query or department filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filteredUsers.map((member: any) => {
            const roleInfo = getRoleBadge(member.role?.name || '');
            const isSelf = currentUser?.id === member.id;
            // Super admin can edit anyone; regular user can only edit their own profile
            const canEdit = isSuperAdmin || isSelf;
            const initials = getInitials(member.name);
            const avatarBg = getAvatarGradient(member.name);

            return (
              <div 
                key={member.id} 
                className={`team-member-card ${isSelf ? 'is-self' : ''}`}
              >
                <div className="team-card-header">
                  <div>
                    {isSelf && (
                      <span className="team-self-badge">
                        <Sparkles size={11} /> You
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isSuperAdmin && !isSelf && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Generate a temporary password for ${member.name}?`)) {
                            tempPasswordMutation.mutate(member.id);
                          }
                        }}
                        className="team-edit-btn"
                        title="Generate Temporary Password"
                        disabled={tempPasswordMutation.isPending}
                      >
                        <Key size={12} />
                        <span>Temp Pass</span>
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(member)}
                        className="team-edit-btn"
                        title={isSuperAdmin && !isSelf ? `Edit ${member.name}'s profile (Super Admin)` : 'Edit your profile'}
                      >
                        <Edit2 size={12} />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* ─── CARD MAIN BODY ─── */}
                <div className="team-card-body">
                  {/* Avatar with Status Dot */}
                  <div className="team-avatar-wrapper">
                    <div 
                      className="team-avatar-circle"
                      style={member.avatar ? {
                        backgroundImage: `url("${member.avatar}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat',
                        color: 'transparent',     // hide initials text when image loads
                      } : {
                        background: avatarBg,
                      }}
                    >
                      {initials}
                    </div>

                    {/* Online status indicator */}
                    <span 
                      className={`team-status-dot ${member.isActive ? 'active' : 'inactive'}`}
                      title={member.isActive ? 'Active Member' : 'Inactive'}
                    />
                  </div>

                  {/* Member Name */}
                  <h3 className="team-card-name" title={member.name}>
                    {member.name}
                  </h3>

                  {/* Role Badge */}
                  <div className="team-role-pill" style={roleInfo.style}>
                    <ShieldCheck size={12} style={{ flexShrink: 0 }} />
                    <span>{roleInfo.label}</span>
                  </div>

                  {/* Job Title Row with Briefcase Icon */}
                  <div className="team-title-row" title={member.title || 'Team Member'}>
                    <Briefcase size={12} style={{ flexShrink: 0, opacity: 0.65 }} />
                    <span className="truncate">{member.title || 'Team Member'}</span>
                  </div>

                  {/* ─── CONTACT & ORG TILES (PERFECTLY ALIGNED) ─── */}
                  <div className="team-info-box">
                    {/* Department */}
                    <div className="team-info-row">
                      <div className="team-info-icon-wrapper" title="Department">
                        <Building2 size={13} />
                      </div>
                      <span className="team-info-text truncate" title={member.department?.name || 'General Team'}>
                        {member.department?.name || 'General Team'}
                      </span>
                    </div>

                    {/* Email Address */}
                    <div className="team-info-row">
                      <div className="team-info-icon-wrapper" title="Email">
                        <Mail size={13} />
                      </div>
                      <a 
                        href={`mailto:${member.email}`} 
                        className="team-info-text team-info-link truncate"
                        title={member.email}
                      >
                        {member.email}
                      </a>
                    </div>

                    {/* Contact Number */}
                    <div className="team-info-row">
                      <div className="team-info-icon-wrapper" title="Contact Number">
                        <Phone size={13} />
                      </div>
                      {member.phone ? (
                        <a 
                          href={`tel:${member.phone}`} 
                          className="team-info-text team-info-link truncate font-mono"
                          title={member.phone}
                          style={{ fontSize: '11.5px' }}
                        >
                          {member.phone}
                        </a>
                      ) : (
                        <span className="team-info-text" style={{ fontStyle: 'italic', opacity: 0.5, fontSize: '11.5px' }}>
                          No contact number
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ─── CARD FOOTER (ACTIVE WORKLOAD) ─── */}
                <div className="team-card-footer">
                  <span className="team-workload-label">Active Workload</span>
                  <div className="team-workload-badge">
                    <CheckSquare size={12} style={{ flexShrink: 0 }} />
                    <span>{member.activeTaskCount || 0} tasks</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── EDIT PROFILE MODAL ─── */}
      {editingMember && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setEditingMember(null)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '520px',
              background: '#121216',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
            className="animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface/50">
              <div className="flex items-center gap-2">
                <Edit2 size={16} className="text-accent" />
                <h3 className="font-bold text-base text-white">
                  {isSuperAdmin && editingMember.id !== currentUser?.id
                    ? `Edit Profile: ${editingMember.name}`
                    : 'Edit Your Profile'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingMember(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEdit} className="p-6 flex flex-col gap-5 max-h-[80vh] overflow-y-auto">
              
              {/* 1. Profile Picture Section */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                {/* Live Preview Avatar */}
                <div 
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: editForm.avatar ? '#18181b' : getAvatarGradient(editForm.name || editingMember.name),
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    color: '#ffffff',
                    fontSize: '22px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    flexShrink: 0
                  }}
                >
                  {editForm.avatar ? (
                    <img src={editForm.avatar} alt="Preview" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    getInitials(editForm.name || editingMember.name)
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white mb-1">Profile Picture</div>
                  <p className="text-[11px] text-muted mb-2">
                    Upload a custom portrait, or remove it to show your first & last name initials ({getInitials(editForm.name || editingMember.name)}).
                  </p>

                  <div className="flex items-center gap-2 flex-wrap">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleAvatarFileChange} 
                      accept="image/*" 
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                      className="btn btn-sm btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <Camera size={13} />
                      <span>{isUploadingPhoto ? 'Uploading...' : 'Change Photo'}</span>
                    </button>

                    {editForm.avatar && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="btn btn-sm btn-ghost text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Personal Information */}
              <div className="modal-grid-2">
                <div className="modal-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Alex Thompson"
                    className="input"
                  />
                </div>

                <div className="modal-field">
                  <label>Job Title</label>
                  <input
                    type="text"
                    value={editForm.title}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Senior Frontend Engineer"
                    className="input"
                  />
                </div>
              </div>

              {/* 3. Contact Details */}
              <div className="modal-grid-2">
                <div className="modal-field">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    required
                    value={editForm.email}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="name@company.com"
                    className="input"
                  />
                </div>

                <div className="modal-field">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    value={editForm.phone}
                    onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="input"
                  />
                </div>
              </div>

              {/* 4. Organizational Details (Department & Role) */}
              <div className="modal-grid-2">
                <div className="modal-field">
                  <label>Department</label>
                  {isSuperAdmin ? (
                    <select
                      value={editForm.departmentId}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                      className="input"
                    >
                      <option value="">General / Unassigned</option>
                      {departments.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="modal-read-only-badge">
                      {editingMember.department?.name || 'General Team'} (Admin assigned)
                    </div>
                  )}
                </div>

                <div className="modal-field">
                  <label>Role</label>
                  {isSuperAdmin ? (
                    <select
                      value={editForm.roleId}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, roleId: e.target.value }))}
                      className="input"
                    >
                      {roles.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.name.replace('_', ' ')}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="modal-read-only-badge">
                      {editingMember.role?.name?.replace('_', ' ') || 'Member'} (Admin assigned)
                    </div>
                  )}
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingMember(null)}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending || isUploadingPhoto}
                  className="btn btn-primary text-xs px-5 py-2 flex items-center gap-2"
                >
                  {updateMutation.isPending ? (
                    <>
                      <div className="spinner spinner-sm" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── CREATE USER MODAL (BLURRED BG) ─── */}
      {isCreateModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#121216',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
            className="animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-surface/50">
              <div className="flex items-center gap-2.5">
                <div 
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(96, 165, 250, 0.3)'
                  }}
                >
                  <UserPlus size={17} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Add New Team Member</h3>
                  <p className="text-[11px] text-muted">Created profile will sync immediately to team chat, searches & tasks.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit} className="p-6 flex flex-col gap-4 max-h-[82vh] overflow-y-auto">
              
              {/* Profile Photo Upload & Live Fallback Preview */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                <div 
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: createForm.avatar ? '#18181b' : getAvatarGradient(createForm.name || 'New Member'),
                    border: '2px solid rgba(255, 255, 255, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    color: '#ffffff',
                    fontSize: '22px',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    flexShrink: 0
                  }}
                >
                  {createForm.avatar ? (
                    <img src={createForm.avatar} alt="Preview" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    getInitials(createForm.name || 'New Member')
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-white mb-0.5">Profile Picture (Optional)</div>
                  <p className="text-[11px] text-muted mb-2">
                    Upload a custom photo or leave empty to use capitalized initials ({getInitials(createForm.name || 'New Member')}).
                  </p>

                  <div className="flex items-center gap-2 flex-wrap">
                    <input 
                      type="file" 
                      ref={createFileInputRef} 
                      onChange={handleCreateAvatarChange} 
                      accept="image/*" 
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => createFileInputRef.current?.click()}
                      disabled={isUploadingCreatePhoto}
                      className="btn btn-sm btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <Camera size={13} />
                      <span>{isUploadingCreatePhoto ? 'Uploading...' : 'Upload Photo'}</span>
                    </button>

                    {createForm.avatar && (
                      <button
                        type="button"
                        onClick={handleRemoveCreatePhoto}
                        className="btn btn-sm btn-ghost text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-1"
                      >
                        <Trash2 size={13} />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Full Name & Role */}
              <div className="modal-grid-2">
                <div className="modal-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.name}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Rachel Adams"
                    className="input"
                  />
                </div>

                <div className="modal-field">
                  <label>Role *</label>
                  <select
                    required
                    value={createForm.roleId}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, roleId: e.target.value }))}
                    className="input"
                  >
                    <option value="" disabled>Select Role...</option>
                    {assignableRoles.map((r: any) => (
                      <option key={r.id} value={r.id}>{r.name.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Email & Contact Number */}
              <div className="modal-grid-2">
                <div className="modal-field">
                  <label>Email Address *</label>
                  <input
                    type="email"
                    required
                    value={createForm.email}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="rachel.adams@snapserve.io"
                    className="input"
                  />
                </div>

                <div className="modal-field">
                  <label>Contact Number</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, phone: e.target.value }))}
                    placeholder="e.g. +1 (555) 019-2834"
                    className="input"
                  />
                </div>
              </div>

              {/* Job Title & Department */}
              <div className="modal-grid-2">
                <div className="modal-field">
                  <label>Job Title</label>
                  <input
                    type="text"
                    value={createForm.title}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g. Full Stack Developer"
                    className="input"
                  />
                </div>

                <div className="modal-field">
                  <label>Department</label>
                  <select
                    value={createForm.departmentId}
                    onChange={(e) => setCreateForm((prev) => ({ ...prev, departmentId: e.target.value }))}
                    className="input"
                  >
                    <option value="">General / Unassigned</option>
                    {departments.map((d: any) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Initial Password */}
              <div className="modal-field">
                <label>Initial Login Password</label>
                <input
                  type="text"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Welcome@123"
                  className="input font-mono"
                />
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Default temporary password. The colleague will use this to sign in.
                </span>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10 mt-1">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="btn btn-secondary text-xs px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || isUploadingCreatePhoto}
                  className="btn btn-primary text-xs px-5 py-2 flex items-center gap-2"
                >
                  {createMutation.isPending ? (
                    <>
                      <div className="spinner spinner-sm" />
                      <span>Creating Member...</span>
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      <span>Create Member</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ─── TEMP PASSWORD MODAL ─── */}
      {tempPasswordState && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setTempPasswordState(null)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '400px',
              background: '#121216',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              padding: '24px',
              textAlign: 'center'
            }}
            onClick={(e) => e.stopPropagation()}
            className="animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="w-12 h-12 mx-auto bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mb-4">
              <Key size={24} />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">Temporary Password Generated</h3>
            <p className="text-sm text-muted mb-6">
              A temporary password has been generated for <strong>{tempPasswordState.member?.name}</strong>. 
              They will be required to set a permanent password upon login.
            </p>
            
            <div className="bg-surface border border-subtle rounded-xl p-4 mb-6 flex items-center justify-between">
              <span className="font-mono text-xl tracking-wider text-white select-all">
                {tempPasswordState.password}
              </span>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(tempPasswordState.password);
                  toast.success('Password copied to clipboard!');
                }}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-accent transition-colors"
                title="Copy to clipboard"
              >
                <Copy size={18} />
              </button>
            </div>
            
            <p className="text-xs text-amber-400/80 bg-amber-500/10 py-2 px-3 rounded-lg border border-amber-500/20 mb-6">
              ⚠️ This password is valid for 5 minutes. Please share it securely.
            </p>
            
            <button
              onClick={() => setTempPasswordState(null)}
              className="btn btn-primary w-full justify-center py-2.5 rounded-xl font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
export default TeamDirectoryPage;
