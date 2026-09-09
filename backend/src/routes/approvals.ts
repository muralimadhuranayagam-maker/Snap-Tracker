import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createAuditLog } from '../services/audit';
import { createNotification } from '../services/notifications';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// ─── GET /api/approvals ──────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const { status, type } = req.query;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    const where: any = {};
    if (status) where.status = status as string;
    if (type) where.type = type as string;

    // RBAC: Non-admins only see approvals they requested or where they are approver
    if (!isSuperAdmin && !isAdmin) {
      where.OR = [
        { requesterId: user.id },
        { approverId: user.id }
      ];
    }

    const approvals = await prisma.approval.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, email: true, avatar: true } },
        approver: { select: { id: true, name: true, email: true, avatar: true } },
        task: {
          select: {
            id: true,
            taskId: true,
            title: true,
            status: { select: { name: true, color: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(approvals);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/approvals ─────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const { title, description, type, taskId, entityType, entityId } = req.body;

    if (!title || !type) throw new AppError('Title and approval type are required', 400);

    const approval = await prisma.approval.create({
      data: {
        title,
        description,
        type,
        requesterId: user.id,
        taskId: taskId || null,
        entityType: entityType || (taskId ? 'Task' : null),
        entityId: entityId || taskId || null,
        status: 'PENDING'
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, taskId: true, title: true } }
      }
    });

    // Notify admins about new pending approval
    const admins = await prisma.user.findMany({
      where: { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } }, isActive: true },
      select: { id: true }
    });

    for (const admin of admins) {
      await createNotification({
        userId: admin.id,
        type: 'APPROVAL_REQUESTED',
        title: `Approval Request: ${title}`,
        message: `${user.name} submitted an approval request for ${type.replace('_', ' ')}.`,
        actionUrl: '/approvals'
      });
    }

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'APPROVAL_REQUESTED',
      entity: 'Approval',
      entityId: approval.id,
      newValue: { title, type, requester: user.name },
      req,
    });

    broadcast({ type: WSEventTypes.APPROVAL_REQUESTED, payload: approval });

    res.status(201).json(approval);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/approvals/:id/decision ───────────────────────────────────────
router.patch('/:id/decision', requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = req.user!;
    const decision = req.body.decision || req.body.status;
    const notes = req.body.notes;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      throw new AppError('Decision must be either APPROVED or REJECTED', 400);
    }

    const existing = await prisma.approval.findUnique({
      where: { id: req.params.id },
      include: { task: true }
    });
    if (!existing) throw new AppError('Approval not found', 404);
    if (existing.status !== 'PENDING') {
      throw new AppError(`Approval is already in ${existing.status} status`, 400);
    }

    const updated = await prisma.approval.update({
      where: { id: req.params.id },
      data: {
        status: decision,
        approverId: user.id,
        notes: notes || null,
        decisionAt: new Date()
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        task: true
      }
    });

    // If linked to a task and approved, transition task if task completion
    if (existing.taskId && decision === 'APPROVED' && existing.type === 'TASK_COMPLETION') {
      const doneStatus = await prisma.taskStatus.findFirst({ where: { name: 'DONE' } });
      if (doneStatus) {
        await prisma.task.update({
          where: { id: existing.taskId },
          data: {
            statusId: doneStatus.id,
            completedAt: new Date()
          }
        });
      }
    }

    // Notify requester
    await createNotification({
      userId: existing.requesterId,
      type: decision === 'APPROVED' ? 'TASK_APPROVED' : 'TASK_REJECTED',
      title: `Approval ${decision}: ${existing.title}`,
      message: `Your request was ${decision.toLowerCase()} by ${user.name}. ${notes ? `Note: "${notes}"` : ''}`,
      actionUrl: '/approvals'
    });

    // Audit log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: `APPROVAL_${decision}`,
      entity: 'Approval',
      entityId: updated.id,
      oldValue: { status: 'PENDING' },
      newValue: { status: decision, approver: user.name, notes },
      req,
    });

    broadcast({ type: WSEventTypes.APPROVAL_DECIDED, payload: updated });
    if (existing.taskId && decision === 'APPROVED' && existing.type === 'TASK_COMPLETION') {
      broadcast({ type: WSEventTypes.TASK_STATUS_CHANGED, payload: { taskId: existing.task?.taskId, id: existing.taskId, newStatus: 'DONE' } });
      broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: existing.taskId } });
      broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { taskId: existing.taskId } });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
