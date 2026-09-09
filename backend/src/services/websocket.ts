import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

interface WSClient {
  ws: WebSocket;
  userId: string;
  departmentId?: string;
  roleName: string;
}

const clients = new Map<string, WSClient>();

export function setupWebSocket(wss: WebSocketServer) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(1008, 'Token required');
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      const clientId = decoded.userId + '_' + Date.now();

      clients.set(clientId, {
        ws,
        userId: decoded.userId,
        departmentId: decoded.departmentId,
        roleName: decoded.roleName,
      });

      ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Real-time connected' }));

      ws.on('close', () => {
        clients.delete(clientId);
      });

      ws.on('error', (err) => {
        console.error('[WS] Error:', err);
        clients.delete(clientId);
      });
    } catch {
      ws.close(1008, 'Invalid token');
    }
  });
}

// Broadcast to all connected clients matching a filter
export function broadcast(event: WSEvent, filter?: (client: WSClient) => boolean) {
  if (!event.timestamp) {
    event.timestamp = new Date().toISOString();
  }
  const message = JSON.stringify(event);
  clients.forEach((client) => {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    if (filter && !filter(client)) return;
    client.ws.send(message);
  });
}

// Broadcast to specific user
export function broadcastToUser(userId: string, event: WSEvent) {
  broadcast(event, (client) => client.userId === userId);
}

// Broadcast to specific department
export function broadcastToDepartment(departmentId: string, event: WSEvent) {
  broadcast(event, (client) => client.departmentId === departmentId);
}

// Broadcast to admins and super admins
export function broadcastToAdmins(event: WSEvent) {
  broadcast(event, (client) => ['ADMIN', 'SUPER_ADMIN'].includes(client.roleName));
}

export interface WSEvent {
  type: string;
  payload: any;
  timestamp?: string;
}

export const WSEventTypes = {
  // Tasks
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_PRIORITY_CHANGED: 'TASK_PRIORITY_CHANGED',
  TASK_COMMENTED: 'TASK_COMMENTED',
  TASK_DEPENDENCY_ADDED: 'TASK_DEPENDENCY_ADDED',
  TASK_DEPENDENCY_REMOVED: 'TASK_DEPENDENCY_REMOVED',
  TASK_WORKLOG_ADDED: 'TASK_WORKLOG_ADDED',
  TASK_WORKLOG_DELETED: 'TASK_WORKLOG_DELETED',

  // Tickets
  TICKET_CREATED: 'TICKET_CREATED',
  TICKET_UPDATED: 'TICKET_UPDATED',
  TICKET_STATUS_CHANGED: 'TICKET_STATUS_CHANGED',
  TICKET_ASSIGNED: 'TICKET_ASSIGNED',
  TICKET_CONVERTED: 'TICKET_CONVERTED',
  TICKET_COMMENTED: 'TICKET_COMMENTED',

  // Approvals
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  APPROVAL_DECIDED: 'APPROVAL_DECIDED',

  // Workload & AI
  WORKLOAD_UPDATED: 'WORKLOAD_UPDATED',
  WORKLOAD_REBALANCED: 'WORKLOAD_REBALANCED',
  AI_RECOMMENDATION: 'AI_RECOMMENDATION',

  // Notifications
  NOTIFICATION_NEW: 'NOTIFICATION_NEW',
  NOTIFICATION_READ: 'NOTIFICATION_READ',
  NOTIFICATION_ALL_READ: 'NOTIFICATION_ALL_READ',

  // Projects & Customers
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  CUSTOMER_CREATED: 'CUSTOMER_CREATED',
  CUSTOMER_UPDATED: 'CUSTOMER_UPDATED',

  // Users & Settings
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
  DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
} as const;

