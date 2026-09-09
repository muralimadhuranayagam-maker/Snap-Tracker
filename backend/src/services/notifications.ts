import { prisma } from '../lib/prisma';
import { broadcastToUser, broadcastToAdmins, WSEventTypes } from './websocket';

export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_REASSIGNED'
  | 'TASK_MENTIONED'
  | 'COMMENT_ADDED'
  | 'DEADLINE_APPROACHING'
  | 'TASK_OVERDUE'
  | 'TASK_BLOCKED'
  | 'REVIEW_REQUESTED'
  | 'TASK_APPROVED'
  | 'TASK_REJECTED'
  | 'PRIORITY_CHANGED'
  | 'PROJECT_AT_RISK'
  | 'TASK_ESCALATED'
  | 'AI_RECOMMENDATION'
  | 'TICKET_ASSIGNED'
  | 'APPROVAL_REQUESTED'
  | 'DEPENDENCY_ADDED'
  | 'DEPENDENCY_RESOLVED'
  | 'SLA_WARNING'
  | 'SLA_BREACH';

interface CreateNotificationParams {
  userId: string;
  taskId?: string;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: any;
}

export async function createNotification(params: CreateNotificationParams) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId: params.userId,
        taskId: params.taskId,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      }
    });

    // Broadcast real-time notification
    broadcastToUser(params.userId, {
      type: WSEventTypes.NOTIFICATION_NEW,
      payload: notification,
    });

    return notification;
  } catch (err) {
    console.error('[NOTIFICATION] Failed to create notification:', err);
  }
}

export async function notifyTaskAssigned(taskId: string, assigneeId: string, assignerName: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { taskId: true, title: true }
  });
  if (!task) return;

  await createNotification({
    userId: assigneeId,
    taskId,
    type: 'TASK_ASSIGNED',
    title: 'New task assigned to you',
    message: `${assignerName} assigned "${task.title}" (${task.taskId}) to you`,
    actionUrl: `/tasks/${taskId}`,
  });
}

export async function notifyMention(
  taskId: string,
  mentionedUserId: string,
  menterName: string,
  commentPreview: string
) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { taskId: true, title: true }
  });
  if (!task) return;

  await createNotification({
    userId: mentionedUserId,
    taskId,
    type: 'TASK_MENTIONED',
    title: `${menterName} mentioned you`,
    message: `In ${task.taskId}: "${commentPreview.slice(0, 100)}..."`,
    actionUrl: `/tasks/${taskId}`,
  });
}

export async function notifyReviewRequested(taskId: string, reviewerId: string, requesterName: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { taskId: true, title: true }
  });
  if (!task) return;

  await createNotification({
    userId: reviewerId,
    taskId,
    type: 'REVIEW_REQUESTED',
    title: 'Review requested',
    message: `${requesterName} requested your review on "${task.title}" (${task.taskId})`,
    actionUrl: `/tasks/${taskId}`,
  });
}

// Run escalation checks (called by a periodic job)
export async function runEscalationChecks() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Tasks due in 24h — notify assignee
  const dueSoon = await prisma.task.findMany({
    where: {
      dueDate: { gte: now, lte: in24h },
      isDeleted: false,
      assigneeId: { not: null },
      status: {
        name: { notIn: ['DONE', 'CANCELLED'] }
      }
    },
    include: { assignee: true, status: true }
  });

  for (const task of dueSoon) {
    if (task.assigneeId) {
      await createNotification({
        userId: task.assigneeId,
        taskId: task.id,
        type: 'DEADLINE_APPROACHING',
        title: 'Task due in 24 hours',
        message: `"${task.title}" (${task.taskId}) is due soon`,
        actionUrl: `/tasks/${task.id}`,
      });
    }
  }

  // Overdue tasks — notify assignee + admins
  const overdue = await prisma.task.findMany({
    where: {
      dueDate: { lt: now },
      isDeleted: false,
      status: {
        name: { notIn: ['DONE', 'CANCELLED'] }
      }
    },
    include: {
      assignee: true,
      priority: true,
      status: true
    }
  });

  const admins = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } }
    },
    select: { id: true }
  });

  for (const task of overdue) {
    if (task.assigneeId) {
      await createNotification({
        userId: task.assigneeId,
        taskId: task.id,
        type: 'TASK_OVERDUE',
        title: 'Task overdue',
        message: `"${task.title}" (${task.taskId}) is past its due date`,
        actionUrl: `/tasks/${task.id}`,
      });
    }

    // Notify admins for critical overdue tasks
    const isCritical = task.priority?.name === 'CRITICAL' || task.priority?.name === 'URGENT';
    if (isCritical) {
      for (const admin of admins) {
        await createNotification({
          userId: admin.id,
          taskId: task.id,
          type: 'TASK_ESCALATED',
          title: 'Critical task overdue',
          message: `CRITICAL: "${task.title}" (${task.taskId}) is overdue and needs immediate attention`,
          actionUrl: `/tasks/${task.id}`,
        });
      }

      broadcastToAdmins({
        type: WSEventTypes.NOTIFICATION_NEW,
        payload: { type: 'TASK_ESCALATED', taskId: task.id, taskCode: task.taskId }
      });
    }
  }
}
