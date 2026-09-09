import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { X, Check, Bell, ExternalLink, Clock } from 'lucide-react';
import { api } from '../../services/api';
import { formatDistanceToNow } from 'date-fns';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data),
    enabled: isOpen,
    refetchInterval: 15_000,
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const markSingleReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  if (!isOpen) return null;

  const unreadCount = notifications.filter((n: any) => !n.isRead).length;

  const handleItemClick = (n: any) => {
    if (!n.isRead) {
      markSingleReadMutation.mutate(n.id);
    }
    if (n.actionUrl) {
      navigate(n.actionUrl);
      onClose();
    }
  };

  return (
    <div className="modal-overlay z-50 justify-end" onClick={onClose}>
      <div 
        className="w-full max-w-md h-full bg-surface border-l border-subtle flex flex-col shadow-2xl animate-in slide-in-from-right"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-accent" />
            <h3 className="font-semibold text-base text-primary">Notifications</h3>
            {unreadCount > 0 && (
              <span className="badge bg-accent text-white text-[11px] px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button 
                className="btn btn-ghost btn-sm text-xs text-muted hover:text-primary flex items-center gap-1"
                onClick={() => markAllReadMutation.mutate()}
              >
                <Check size={14} /> Mark all read
              </button>
            )}
            <button className="btn-icon btn-ghost" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-subtle">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-muted text-sm">
              No notifications yet. You're all caught up!
            </div>
          ) : (
            notifications.map((n: any) => (
              <div 
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`p-4 hover:bg-elevated/50 transition cursor-pointer flex gap-3 ${
                  !n.isRead ? 'bg-accent-subtle/30' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${!n.isRead ? 'bg-accent' : 'bg-transparent'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-medium text-xs text-primary truncate">
                      {n.title}
                    </div>
                    <span className="text-[10px] text-muted flex items-center gap-1 shrink-0">
                      <Clock size={10} />
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-secondary line-clamp-2">{n.message}</p>
                  {n.actionUrl && (
                    <div className="mt-2 flex items-center gap-1 text-[11px] text-accent font-medium">
                      <span>View details</span>
                      <ExternalLink size={10} />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
