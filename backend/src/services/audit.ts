import { prisma } from '../lib/prisma';
import { Request } from 'express';

interface AuditParams {
  userId?: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  oldValue?: any;
  newValue?: any;
  req?: Request;
  metadata?: any;
}

export async function createAuditLog(params: AuditParams) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userEmail: params.userEmail,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        oldValue: params.oldValue ? JSON.stringify(params.oldValue) : null,
        newValue: params.newValue ? JSON.stringify(params.newValue) : null,
        ipAddress: params.req ? getClientIP(params.req) : null,
        userAgent: params.req?.headers['user-agent'] || null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      }
    });
  } catch (err) {
    // Audit log failure should never break the main operation
    console.error('[AUDIT] Failed to write audit log:', err);
  }
}

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// Actions constants
export const AuditActions = {
  // Auth
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  PASSWORD_RESET: 'PASSWORD_RESET',

  // Users
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_DELETED: 'USER_DELETED',
  USER_ACTIVATED: 'USER_ACTIVATED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',

  // Tasks
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  TASK_REASSIGNED: 'TASK_REASSIGNED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',
  TASK_PRIORITY_CHANGED: 'TASK_PRIORITY_CHANGED',
  TASK_ARCHIVED: 'TASK_ARCHIVED',
  TASK_COMMENT_ADDED: 'TASK_COMMENT_ADDED',
  TASK_WORKLOG_ADDED: 'TASK_WORKLOG_ADDED',

  // Projects
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  PROJECT_MEMBER_ADDED: 'PROJECT_MEMBER_ADDED',
  PROJECT_MEMBER_REMOVED: 'PROJECT_MEMBER_REMOVED',

  // Settings
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  WORKFLOW_CREATED: 'WORKFLOW_CREATED',
  WORKFLOW_UPDATED: 'WORKFLOW_UPDATED',
  WORKFLOW_DELETED: 'WORKFLOW_DELETED',

  // AI
  AI_RECOMMENDATION_ACTED: 'AI_RECOMMENDATION_ACTED',
  AI_TASK_CREATED: 'AI_TASK_CREATED',
} as const;
