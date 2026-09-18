import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

interface WSClient {
  ws: WebSocket;
  userId: string;
  departmentId?: string;
  roleName: string;
}

const clients = new Map<string, WSClient>();

// Track disconnect grace timers per userId to auto-break if they don't reconnect
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECT_GRACE_SECONDS = 30;

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

      // Cancel any pending disconnect auto-break timer for this user (they reconnected in time)
      const existingTimer = disconnectTimers.get(decoded.userId);
      if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectTimers.delete(decoded.userId);
        console.log(`[WS] User ${decoded.userId} reconnected within grace period, cancelled auto-break`);
      }

      ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Real-time connected' }));

      ws.on('message', (messageRaw) => {
        try {
          const parsed = JSON.parse(messageRaw.toString());
          if (parsed.type?.startsWith('WEBRTC_') && parsed.targetUserId) {
            // Check if target user is currently connected to WebSocket
            const targetConnected = isUserConnected(parsed.targetUserId);

            if (!targetConnected && parsed.type === 'WEBRTC_REQUEST_SCREEN_STREAM') {
              ws.send(
                JSON.stringify({
                  type: 'WEBRTC_SCREEN_ERROR',
                  payload: {
                    senderId: parsed.targetUserId,
                    error: 'Employee is currently offline or not connected to real-time server.',
                  },
                })
              );
            } else {
              broadcastToUser(parsed.targetUserId, {
                type: parsed.type,
                payload: {
                  senderId: decoded.userId,
                  senderName: decoded.name || 'User',
                  ...parsed.payload,
                },
              });
            }
          }
        } catch (err) {
          console.error('[WS] Message parse error:', err);
        }
      });

      ws.on('close', () => {
        clients.delete(clientId);

        // Check if this user has ANY other active WebSocket connections
        // (multi-tab scenario: only trigger auto-break if ALL connections are gone)
        const userId = decoded.userId;
        if (!isUserConnected(userId)) {
          // Start disconnect grace timer — if user doesn't reconnect within 30s, auto-break
          const timer = setTimeout(async () => {
            disconnectTimers.delete(userId);
            // Double-check they're still disconnected
            if (!isUserConnected(userId)) {
              console.log(`[WS] User ${userId} disconnected for ${DISCONNECT_GRACE_SECONDS}s, triggering auto-break`);
              try {
                const { autoBreakOnDisconnect } = await import('../routes/attendance');
                await autoBreakOnDisconnect(userId);
              } catch (err) {
                console.error(`[WS] Failed to auto-break user ${userId}:`, err);
              }
            }
          }, DISCONNECT_GRACE_SECONDS * 1000);
          disconnectTimers.set(userId, timer);
        }
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

// Check if a specific user has an active WebSocket connection
export function isUserConnected(userId: string): boolean {
  let connected = false;
  clients.forEach((client) => {
    if (String(client.userId) === String(userId) && client.ws.readyState === WebSocket.OPEN) {
      connected = true;
    }
  });
  return connected;
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
  broadcast(event, (client) => String(client.userId) === String(userId));
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
  SIDEBAR_BADGES_UPDATED: 'SIDEBAR_BADGES_UPDATED',

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

  // Live Team Chat
  CHAT_MESSAGE_SENT: 'CHAT_MESSAGE_SENT',
  CHAT_MESSAGE_DELETED: 'CHAT_MESSAGE_DELETED',

  // Attendance & WebRTC Presence
  ATTENDANCE_CLOCKED_IN: 'ATTENDANCE_CLOCKED_IN',
  ATTENDANCE_CLOCKED_OUT: 'ATTENDANCE_CLOCKED_OUT',
  ATTENDANCE_HEARTBEAT: 'ATTENDANCE_HEARTBEAT',
  WEBRTC_SIGNAL_OFFER: 'WEBRTC_SIGNAL_OFFER',
  WEBRTC_SIGNAL_ANSWER: 'WEBRTC_SIGNAL_ANSWER',
  WEBRTC_SIGNAL_ICE: 'WEBRTC_SIGNAL_ICE',
  WEBRTC_PRESENCE_PONG: 'WEBRTC_PRESENCE_PONG',
} as const;


