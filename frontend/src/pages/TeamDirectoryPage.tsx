import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import { Mail, Phone, Building2, Briefcase, CheckSquare } from 'lucide-react';

export function TeamDirectoryPage() {

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    }
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="spinner spinner-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="empty-state text-red">
        Failed to load team directory
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="page-header">
        <div>
          <h1 className="page-title">Team Directory</h1>
          <p className="page-subtitle">Find and collaborate with your colleagues across the company.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
        {users.map((member: any) => (
          <div key={member.id} className="card hover:border-primary/30 transition-colors">
            <div className="card-body flex flex-col items-center text-center pb-4">
              <div className="avatar avatar-lg mb-3 bg-accent text-primary">
                {member.avatar ? (
                  <img src={member.avatar} alt={member.name} />
                ) : (
                  member.name.charAt(0)
                )}
              </div>
              <h3 className="font-semibold text-lg">{member.name}</h3>
              <p className="text-muted text-sm flex items-center justify-center gap-1 mt-1">
                <Briefcase size={14} />
                {member.title || member.role?.name || 'Employee'}
              </p>
              
              <div className="w-full divider my-4"></div>
              
              <div className="w-full flex flex-col gap-2 text-sm text-left">
                <div className="flex items-center gap-2 text-muted">
                  <Building2 size={14} className="text-primary/70" />
                  <span>{member.department?.name || 'General'}</span>
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <Mail size={14} className="text-primary/70" />
                  <a href={`mailto:${member.email}`} className="hover:text-primary transition-colors">
                    {member.email}
                  </a>
                </div>
                {member.phone && (
                  <div className="flex items-center gap-2 text-muted">
                    <Phone size={14} className="text-primary/70" />
                    <span>{member.phone}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="card-footer bg-surface-hover justify-between">
              <span className="text-xs font-medium text-muted">Active Workload</span>
              <div className="flex items-center gap-1 text-xs font-semibold bg-accent px-2 py-0.5 rounded">
                <CheckSquare size={12} />
                {member.activeTaskCount || 0} tasks
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
