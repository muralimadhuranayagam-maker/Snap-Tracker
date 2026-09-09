import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

export interface WSEvent {
  type: string;
  payload: any;
  timestamp?: string;
}

interface WebSocketContextType {
  isConnected: boolean;
  lastEvent: WSEvent | null;
  sendMessage: (data: any) => void;
}

const WebSocketContext = createContext<WebSocketContextType>({
  isConnected: false,
  lastEvent: null,
  sendMessage: () => {},
});

export const useWebSocket = () => useContext(WebSocketContext);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const queryClient = useQueryClient();
  const { token, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const connect = useCallback(() => {
    if (!token || !isAuthenticated) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const defaultHost = `${window.location.hostname}:4000`;
      const wsUrl = import.meta.env.VITE_WS_URL || `${protocol}//${defaultHost}`;
      const socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);

      socket.onopen = () => {
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event) => {
        try {
          const data: WSEvent = JSON.parse(event.data);
          setLastEvent(data);

          const { type, payload } = data;

          // React Query Real-Time Invalidation & Live Dispatch
          if (type.startsWith('TASK_')) {
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
            queryClient.invalidateQueries({ queryKey: ['mywork'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['workload'] });
            if (payload?.id) {
              queryClient.invalidateQueries({ queryKey: ['task', payload.id] });
            }
            if (payload?.taskId) {
              queryClient.invalidateQueries({ queryKey: ['task', payload.taskId] });
            }
          } else if (type.startsWith('TICKET_')) {
            queryClient.invalidateQueries({ queryKey: ['tickets'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['mywork'] });
            if (payload?.id) {
              queryClient.invalidateQueries({ queryKey: ['ticket', payload.id] });
            }
            if (payload?.ticketId) {
              queryClient.invalidateQueries({ queryKey: ['ticket', payload.ticketId] });
            }
          } else if (type.startsWith('APPROVAL_')) {
            queryClient.invalidateQueries({ queryKey: ['approvals'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['mywork'] });
            if (type === 'APPROVAL_REQUESTED') {
              toast(`New approval request: ${payload?.title || 'Approval required'}`, { icon: '📋' });
            }
          } else if (type.startsWith('NOTIFICATION_')) {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
            if (type === 'NOTIFICATION_NEW' && payload?.title) {
              toast(payload.message ? `${payload.title}: ${payload.message}` : payload.title, { icon: '🔔' });
            }
          } else if (type.startsWith('WORKLOAD_')) {
            queryClient.invalidateQueries({ queryKey: ['workload'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          } else if (type.startsWith('PROJECT_')) {
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            if (payload?.id) {
              queryClient.invalidateQueries({ queryKey: ['project', payload.id] });
            }
          } else if (type.startsWith('CUSTOMER_')) {
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            if (payload?.id) {
              queryClient.invalidateQueries({ queryKey: ['customer', payload.id] });
            }
          } else if (type.startsWith('USER_') || type.startsWith('DEPARTMENT_')) {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            queryClient.invalidateQueries({ queryKey: ['team'] });
            queryClient.invalidateQueries({ queryKey: ['departments'] });
          } else if (type === 'SETTINGS_UPDATED') {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
          }
        } catch {
          // Ignore parse errors on ping/handshake messages
        }
      };

      socket.onerror = () => {
        // Will close and trigger onclose handler
      };

      socket.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        // Auto reconnect with backoff
        if (isAuthenticated && token) {
          const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 10000);
          reconnectAttemptsRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      wsRef.current = socket;
    } catch {
      setIsConnected(false);
    }
  }, [token, isAuthenticated, queryClient]);

  useEffect(() => {
    connect();

    const handleOnline = () => {
      reconnectAttemptsRef.current = 0;
      connect();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)) {
        connect();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastEvent, sendMessage }}>
      {children}
    </WebSocketContext.Provider>
  );
};
