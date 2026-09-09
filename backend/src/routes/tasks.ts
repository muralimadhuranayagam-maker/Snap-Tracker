import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { AppError } from '../middleware/errorHandler';
import { createNotification, notifyTaskAssigned, notifyReviewRequested } from '../services/notifications';
import { broadcast, WSEventTypes } from '../services/websocket';
import { detectBlockersFromText, predictDeadlineRisk, calculateTaskPriorityScore } from '../services/ai';

const router = Router();
router.use(authenticate);

// ─── Valid state transitions (state machine) ──────────────────────────────────
const EMPLOYEE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  BACKLOG: ['TODO'],
  TODO: ['IN_PROGRESS'],
  IN_PROGRESS: ['BLOCKED', 'IN_REVIEW'],
  BLOCKED: ['IN_PROGRESS'],
  IN_REVIEW: ['IN_PROGRESS'], // can send back to WIP
};

const ADMIN_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  BACKLOG: ['TODO', 'CANCELLED'],
  TODO: ['IN_PROGRESS', 'BACKLOG', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'IN_REVIEW', 'TODO', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  IN_REVIEW: ['APPROVED', 'IN_PROGRESS', 'CANCELLED'],
  APPROVED: ['DONE', 'IN_REVIEW'],
  DONE: ['IN_PROGRESS'], // reopen
};

function validateTransition(currentStatus: string, newStatus: string, roleName: string): boolean {
  if (roleName === 'SUPER_ADMIN') return true; // Super admin can do anything
  const allowed = roleName === 'EMPLOYEE'
    ? EMPLOYEE_ALLOWED_TRANSITIONS[currentStatus] || []
    : ADMIN_ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
}

// Generate human-readable task ID (e.g. FDE-1024)
async function generateTaskId(departmentCode: string): Promise<string> {
  const prefix = departmentCode || 'GEN';
  const count = await prisma.task.count({
    where: { taskId: { startsWith: prefix + '-' } }
  });
  return `${prefix}-${1001 + count}`;
}

// ─── TASK INCLUDES (reusable) ─────────────────────────────────────────────────
const TASK_INCLUDE = {
  status: true,
  priority: true,
  taskType: true,
  department: true,
  project: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, code: true } },
  ticket: { select: { id: true, ticketId: true, title: true, status: true } },
  approvals: { include: { requester: { select: { id: true, name: true } } } },
  milestone: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, email: true, avatar: true } },
  reporter: { select: { id: true, name: true, email: true, avatar: true } },
  reviewer: { select: { id: true, name: true, email: true, avatar: true } },
  labels: { include: { label: true } },
  _count: {
    select: {
      subtasks: true,
      comments: true,
      attachments: true,
      worklogs: true,
    }
  },
  subtasks: {
    where: { isDeleted: false },
    include: {
      status: { select: { name: true } },
      priority: { select: { name: true, color: true } },
      assignee: { select: { id: true, name: true, avatar: true } },
    }
  },
  blockingDeps: {
    include: {
      target: {
        select: { id: true, taskId: true, title: true, status: { select: { name: true } } }
      }
    }
  },
  blockedByDeps: {
    include: {
      source: {
        select: { id: true, taskId: true, title: true, status: { select: { name: true } } }
      }
    }
  },
} as const;

// GET /api/tasks
router.get('/', async (req, res, next) => {
  try {
    const {
      departmentId, projectId, assigneeId, statusId, priorityId,
      search, page = '1', limit = '50', overdue, blocked, milestoneId,
      parentId, isArchived,
    } = req.query;

    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {
      isDeleted: false,
      ...(isArchived === 'true' ? { isArchived: true } : { isArchived: false }),
    };

    // RBAC scoping: employees can only see tasks in their department
    if (!isSuperAdmin && !isAdmin) {
      where.OR = [
        { assigneeId: user.id },
        { reporterId: user.id },
        { departmentId: user.departmentId },
      ];
    }

    if (departmentId) where.departmentId = departmentId;
    if (projectId) where.projectId = projectId;
    if (milestoneId) where.milestoneId = milestoneId;
    if (assigneeId) where.assigneeId = assigneeId;
    if (statusId) where.statusId = statusId;
    if (priorityId) where.priorityId = priorityId;
    if (parentId) where.parentId = parentId;
    else if (!req.query.includeSubtasks) where.parentId = null; // top-level only

    if (overdue === 'true') {
      where.dueDate = { lt: new Date() };
      where.status = { name: { notIn: ['DONE', 'CANCELLED'] } };
    }
    if (blocked === 'true') {
      where.status = { name: 'BLOCKED' };
    }

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { taskId: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [{ priority: { level: 'desc' } }, { dueDate: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: parseInt(limit as string),
      }),
      prisma.task.count({ where }),
    ]);

    res.json({
      tasks,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id
router.get('/:id', async (req, res, next) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, isDeleted: false },
      include: {
        ...TASK_INCLUDE,
        comments: {
          where: {
            parentId: null,
            // RBAC: employees can't see internal notes from other depts
            ...(req.user!.roleName === 'EMPLOYEE' ? { isInternal: false } : {}),
          },
          include: {
            user: { select: { id: true, name: true, avatar: true } },
            replies: {
              include: {
                user: { select: { id: true, name: true, avatar: true } },
                reactions: true,
              }
            },
            reactions: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: {
          include: { },
          orderBy: { createdAt: 'desc' },
        },
        worklogs: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { logDate: 'desc' },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      }
    });

    if (!task) throw new AppError('Task not found', 404);

    // RBAC check
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    if (!isSuperAdmin && !isAdmin) {
      const hasAccess =
        task.assigneeId === user.id ||
        task.reporterId === user.id ||
        task.reviewerId === user.id ||
        task.departmentId === user.departmentId;

      if (!hasAccess) throw new AppError('Access denied', 403);
    }

    // Enrich with AI data
    const [riskResult, priorityScore] = await Promise.all([
      predictDeadlineRisk(task.id),
      calculateTaskPriorityScore(task.id),
    ]);

    res.json({
      ...task,
      aiRisk: riskResult,
      aiPriorityScore: priorityScore,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks
router.post('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    const {
      title, description, departmentId, projectId, milestoneId,
      taskTypeId, priorityId, statusId, assigneeId, reviewerId,
      startDate, dueDate, estimatedHours, labels, parentId,
    } = req.body;

    if (!title) throw new AppError('Task title is required', 400);

    if (assigneeId && !isSuperAdmin && !isAdmin) {
      throw new AppError('Only Admins and Super Admins can allocate tasks to users', 403);
    }

    // Find department to generate task ID
    let deptCode = 'GEN';
    if (departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: departmentId } });
      deptCode = dept?.code || 'GEN';
    } else if (!isSuperAdmin && !isAdmin) {
      // Employee tasks default to their department
      const dept = await prisma.department.findFirst({ where: { id: user.departmentId || '' } });
      deptCode = dept?.code || 'GEN';
    }

    // Get default status (BACKLOG)
    const defaultStatus = await prisma.taskStatus.findFirst({
      where: { name: 'BACKLOG' }
    });

    const taskId = await generateTaskId(deptCode);

    const task = await prisma.task.create({
      data: {
        taskId,
        title,
        description,
        departmentId: departmentId || user.departmentId,
        projectId,
        milestoneId,
        taskTypeId,
        priorityId,
        statusId: statusId || defaultStatus?.id,
        assigneeId,
        reporterId: user.id,
        reviewerId,
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
        parentId,
      },
      include: TASK_INCLUDE,
    });

    // Add labels
    if (labels && Array.isArray(labels)) {
      await Promise.all(labels.map((labelId: string) =>
        prisma.taskLabel.create({ data: { taskId: task.id, labelId } }).catch(() => {})
      ));
    }

    // History log
    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        userId: user.id,
        action: 'TASK_CREATED',
        newValue: JSON.stringify({ title, assigneeId }),
      }
    });

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: AuditActions.TASK_CREATED,
      entity: 'Task',
      entityId: task.id,
      newValue: { taskId, title },
      req,
    });

    // Notify assignee
    if (assigneeId && assigneeId !== user.id) {
      await notifyTaskAssigned(task.id, assigneeId, user.name);
    }

    // Broadcast
    broadcast({ type: WSEventTypes.TASK_CREATED, payload: { id: task.id, taskId: task.taskId, title } });

    // Run workflow engine
    const { executeWorkflows } = await import('../services/workflow');
    executeWorkflows('TASK_CREATED', task).catch(console.error);

    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    const task = await prisma.task.findFirst({
      where: { id: req.params.id, isDeleted: false },
      include: { status: true, priority: true, assignee: true }
    });

    if (!task) throw new AppError('Task not found', 404);

    // Check if user has permission to edit this task
    if (!isSuperAdmin && !isAdmin) {
      const canEdit = task.assigneeId === user.id || task.reporterId === user.id;
      if (!canEdit) throw new AppError('You can only edit tasks assigned to or reported by you', 403);
    }

    const {
      title, description, statusId, priorityId, assigneeId, reviewerId,
      dueDate, startDate, estimatedHours, departmentId, projectId, milestoneId,
      taskTypeId,
    } = req.body;

    const updateData: any = {};
    const historyEntries: Array<{ field: string; oldValue: any; newValue: any; action: string }> = [];

    if (title !== undefined) {
      updateData.title = title;
      historyEntries.push({ field: 'title', oldValue: task.title, newValue: title, action: 'TITLE_CHANGED' });
    }
    if (description !== undefined) updateData.description = description;
    if (milestoneId !== undefined) updateData.milestoneId = milestoneId;
    if (taskTypeId !== undefined) updateData.taskTypeId = taskTypeId;
    if (projectId !== undefined) updateData.projectId = projectId;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (estimatedHours !== undefined) updateData.estimatedHours = estimatedHours ? parseFloat(estimatedHours) : null;

    // Status change with state machine validation
    if (statusId !== undefined && statusId !== task.statusId) {
      const newStatus = await prisma.taskStatus.findUnique({ where: { id: statusId } });
      if (!newStatus) throw new AppError('Invalid status', 400);

      const currentStatus = task.status?.name || 'BACKLOG';
      if (!validateTransition(currentStatus, newStatus.name, user.roleName)) {
        throw new AppError(
          `Cannot transition from ${currentStatus} to ${newStatus.name}. You don't have permission for this transition.`,
          403
        );
      }

      // Check: parent task cannot be marked DONE if mandatory subtasks are incomplete
      if (newStatus.name === 'DONE') {
        const incompleteSubs = await prisma.task.count({
          where: {
            parentId: task.id,
            isDeleted: false,
            status: { name: { notIn: ['DONE', 'CANCELLED'] } }
          }
        });
        if (incompleteSubs > 0 && !isAdmin && !isSuperAdmin) {
          throw new AppError(`Cannot mark as DONE: ${incompleteSubs} subtask(s) are still incomplete`, 400);
        }

        updateData.completedAt = new Date();
      }

      if (newStatus.name === 'IN_REVIEW' && task.reviewerId) {
        await notifyReviewRequested(task.id, task.reviewerId, user.name);
      }

      updateData.statusId = statusId;
      historyEntries.push({ field: 'status', oldValue: task.status?.name, newValue: newStatus.name, action: 'STATUS_CHANGED' });

      broadcast({
        type: WSEventTypes.TASK_STATUS_CHANGED,
        payload: { taskId: task.taskId, oldStatus: task.status?.name, newStatus: newStatus.name }
      });
    }

    // Priority change (admin/super admin only)
    if (priorityId !== undefined && priorityId !== task.priorityId) {
      if (!isAdmin && !isSuperAdmin) throw new AppError('Only admins can change task priority', 403);
      const newPriority = await prisma.taskPriority.findUnique({ where: { id: priorityId } });
      updateData.priorityId = priorityId;
      historyEntries.push({ field: 'priority', oldValue: task.priority?.name, newValue: newPriority?.name, action: 'PRIORITY_CHANGED' });

      if (task.assigneeId) {
        await createNotification({
          userId: task.assigneeId,
          taskId: task.id,
          type: 'PRIORITY_CHANGED',
          title: 'Task priority changed',
          message: `${task.taskId} priority changed to ${newPriority?.name}`,
          actionUrl: `/tasks/${task.id}`,
        });
      }

      broadcast({
        type: WSEventTypes.TASK_PRIORITY_CHANGED,
        payload: { taskId: task.taskId, id: task.id, priorityId, priorityName: newPriority?.name }
      });
    }

    // Reassignment (admin/super admin only)
    if (assigneeId !== undefined && assigneeId !== task.assigneeId) {
      if (!isAdmin && !isSuperAdmin) throw new AppError('Only admins can reassign tasks', 403);
      updateData.assigneeId = assigneeId;
      historyEntries.push({ field: 'assignee', oldValue: task.assignee?.name, newValue: assigneeId, action: 'REASSIGNED' });

      if (assigneeId) {
        await notifyTaskAssigned(task.id, assigneeId, user.name);
      }

      broadcast({ type: WSEventTypes.TASK_ASSIGNED, payload: { taskId: task.taskId, id: task.id, newAssigneeId: assigneeId } });
      broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { assigneeId } });
    }

    if (reviewerId !== undefined) updateData.reviewerId = reviewerId;
    if (departmentId !== undefined && (isAdmin || isSuperAdmin)) updateData.departmentId = departmentId;

    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data: updateData,
      include: TASK_INCLUDE,
    });

    // Write history
    for (const entry of historyEntries) {
      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          userId: user.id,
          action: entry.action,
          field: entry.field,
          oldValue: String(entry.oldValue),
          newValue: String(entry.newValue),
        }
      });
    }

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: AuditActions.TASK_UPDATED,
      entity: 'Task',
      entityId: task.id,
      oldValue: { title: task.title, statusId: task.statusId },
      newValue: updateData,
      req,
    });

    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: updated.id, taskId: updated.taskId } });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id — Admin only (soft delete)
router.delete('/:id', requireAdminOrAbove, async (req, res, next) => {
  try {
    const task = await prisma.task.findFirst({
      where: { id: req.params.id, isDeleted: false }
    });

    if (!task) throw new AppError('Task not found', 404);

    await prisma.task.update({
      where: { id: req.params.id },
      data: { isDeleted: true }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: AuditActions.TASK_DELETED,
      entity: 'Task',
      entityId: task.id,
      oldValue: { taskId: task.taskId, title: task.title },
      req,
    });

    broadcast({ type: WSEventTypes.TASK_DELETED, payload: { id: task.id, taskId: task.taskId } });
    if (task.assigneeId) {
      broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { assigneeId: task.assigneeId } });
    }

    res.json({ message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/:id/dependencies
router.post('/:id/dependencies', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { targetId, type = 'BLOCKS' } = req.body;
    if (!targetId) throw new AppError('Target task ID required', 400);

    const [sourceTask, targetTask] = await Promise.all([
      prisma.task.findUnique({ where: { id: req.params.id } }),
      prisma.task.findUnique({ where: { id: targetId } }),
    ]);

    if (!sourceTask) throw new AppError('Source task not found', 404);
    if (!targetTask) throw new AppError('Target task not found', 404);
    if (sourceTask.id === targetTask.id) throw new AppError('Task cannot depend on itself', 400);

    const dep = await prisma.taskDependency.create({
      data: {
        sourceId: sourceTask.id,
        targetId: targetTask.id,
        type,
      },
      include: {
        source: { select: { id: true, taskId: true, title: true } },
        target: { select: { id: true, taskId: true, title: true } },
      }
    });

    // Notify assignee of the blocked/dependent task
    if (targetTask.assigneeId) {
      await createNotification({
        userId: targetTask.assigneeId,
        type: 'DEPENDENCY_ADDED',
        title: `Dependency: ${sourceTask.taskId} blocks your task`,
        message: `Task ${sourceTask.taskId} ("${sourceTask.title}") is marked as blocking ${targetTask.taskId}.`,
        actionUrl: `/tasks/${targetTask.id}`,
      });
    }

    // Audit log
    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'TASK_DEPENDENCY_ADDED',
      entity: 'Task',
      entityId: sourceTask.id,
      metadata: { sourceTaskId: sourceTask.taskId, targetTaskId: targetTask.taskId, type },
      req,
    });

    broadcast({ type: WSEventTypes.TASK_DEPENDENCY_ADDED, payload: dep });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: sourceTask.id } });

    res.status(201).json(dep);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id/dependencies/:depId
router.delete('/:id/dependencies/:depId', requireAdminOrAbove, async (req, res, next) => {
  try {
    const dep = await prisma.taskDependency.findUnique({
      where: { id: req.params.depId },
      include: {
        source: { select: { id: true, taskId: true } },
        target: { select: { id: true, taskId: true, assigneeId: true } },
      }
    });

    if (!dep) throw new AppError('Dependency not found', 404);

    await prisma.taskDependency.delete({ where: { id: req.params.depId } });

    if (dep.target?.assigneeId) {
      await createNotification({
        userId: dep.target.assigneeId,
        type: 'DEPENDENCY_RESOLVED',
        title: `Blocker Cleared: ${dep.source?.taskId}`,
        message: `The dependency on ${dep.source?.taskId} has been removed.`,
        actionUrl: `/tasks/${dep.target.id}`,
      });
    }

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'TASK_DEPENDENCY_REMOVED',
      entity: 'Task',
      entityId: req.params.id,
      metadata: { depId: req.params.depId },
      req,
    });

    broadcast({ type: WSEventTypes.TASK_DEPENDENCY_REMOVED, payload: { depId: req.params.depId, taskId: req.params.id } });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: req.params.id } });

    res.json({ message: 'Dependency removed' });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/bulk — bulk operations
router.post('/bulk', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { taskIds, action, value } = req.body;
    if (!taskIds || !Array.isArray(taskIds) || !action) {
      throw new AppError('taskIds array and action are required', 400);
    }

    const results: string[] = [];

    for (const id of taskIds) {
      try {
        const updateData: any = {};
        if (action === 'ASSIGN' && value) updateData.assigneeId = value;
        if (action === 'CHANGE_STATUS' && value) updateData.statusId = value;
        if (action === 'CHANGE_PRIORITY' && value) updateData.priorityId = value;
        if (action === 'CHANGE_DUE_DATE' && value) updateData.dueDate = new Date(value);
        if (action === 'ARCHIVE') updateData.isArchived = true;

        await prisma.task.update({ where: { id }, data: updateData });
        results.push(id);
      } catch {
        // Skip failed tasks
      }
    }

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'BULK_' + action,
      entity: 'Task',
      metadata: { taskIds: results, value },
      req,
    });

    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { bulk: true, action, taskIds: results } });
    broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { taskIds: results } });

    res.json({ updated: results.length, taskIds: results });
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/statuses — get all statuses and types
router.get('/meta/statuses', async (_req, res, next) => {
  try {
    const [statuses, priorities, types, labels] = await Promise.all([
      prisma.taskStatus.findMany({ orderBy: { order: 'asc' } }),
      prisma.taskPriority.findMany({ orderBy: { level: 'asc' } }),
      prisma.taskType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.label.findMany({ orderBy: { name: 'asc' } }),
    ]);
    res.json({ statuses, priorities, types, labels });
  } catch (err) {
    next(err);
  }
});

export default router;
