import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { AppError } from '../middleware/errorHandler';
import { createNotification, notifyTaskAssigned, notifyReviewRequested, notifySuperAdminsReviewRequested } from '../services/notifications';
import { broadcast, WSEventTypes } from '../services/websocket';
import { detectBlockersFromText, predictDeadlineRisk, calculateTaskPriorityScore } from '../services/ai';

const router = Router();
router.use(authenticate);

// Ensure upload directory exists for task review file attachments
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname);
    if (!ext) {
      if (file.mimetype.startsWith('audio/webm')) ext = '.webm';
      else if (file.mimetype.startsWith('audio/wav')) ext = '.wav';
      else if (file.mimetype.startsWith('audio/mp3') || file.mimetype.startsWith('audio/mpeg')) ext = '.mp3';
      else if (file.mimetype.startsWith('video/mp4')) ext = '.mp4';
      else if (file.mimetype.startsWith('image/png')) ext = '.png';
      else if (file.mimetype.startsWith('image/jpeg')) ext = '.jpg';
      else ext = '.bin';
    }
    cb(null, `${uuidv4()}${ext}`);
  },
});

const taskUpload = multer({
  storage: diskStorage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// ─── Valid state transitions (state machine) ──────────────────────────────────
function validateTransition(currentStatus: string, newStatus: string, roleName: string): { allowed: boolean; reason?: string } {
  if (currentStatus === newStatus) return { allowed: true };
  const isSuperAdmin = roleName === 'SUPER_ADMIN';
  const isAdmin = roleName === 'ADMIN';

  // Strict rule: Only Super Admin / Admin can mark as DONE (Completed)
  if (newStatus === 'DONE') {
    if (!isSuperAdmin && !isAdmin) {
      return {
        allowed: false,
        reason: 'Tasks cannot be moved directly to Completed. They must be submitted for review and approved by a Super Admin.'
      };
    }
  }

  // Strict rule: Only Super Admin / Admin can move tasks out of IN_REVIEW
  if (currentStatus === 'IN_REVIEW') {
    if (!isSuperAdmin && !isAdmin) {
      return {
        allowed: false,
        reason: 'Tasks in review can only be approved or rejected by a Super Admin.'
      };
    }
  }

  return { allowed: true };
}

// Generate human-readable task ID (e.g. FDE-1024)
async function generateTaskId(departmentCode: string): Promise<string> {
  const prefix = departmentCode || 'GEN';
  const count = await prisma.task.count({
    where: { taskId: { startsWith: prefix + '-' } }
  });
  return `${prefix}-${1001 + count}`;
}

// ─── LIVE WORKED HOURS CALCULATION HELPER ────────────────────────────────────
export function calculateLiveTaskHours(task: any) {
  if (!task) return task;
  let actual = Number(task.actualHours || 0);
  const statusName = task.status?.name;

  if (statusName === 'IN_PROGRESS') {
    const startTs = task.startDate ? new Date(task.startDate).getTime() : new Date(task.updatedAt || task.createdAt).getTime();
    const elapsedHours = Math.max(0, (Date.now() - startTs) / (1000 * 60 * 60));
    const sessionHours = elapsedHours > 0 && elapsedHours < 0.1 ? 0.1 : elapsedHours;
    actual = Number((actual + sessionHours).toFixed(1));
  } else if (statusName === 'IN_REVIEW' && actual === 0) {
    const startTs = task.startDate ? new Date(task.startDate).getTime() : new Date(task.createdAt).getTime();
    const endTs = new Date(task.updatedAt).getTime();
    const elapsedHours = Math.max(0.1, (endTs - startTs) / (1000 * 60 * 60));
    actual = Number(elapsedHours.toFixed(1));
  }

  return {
    ...task,
    actualHours: actual,
    savedActualHours: Number(task.actualHours || 0),
  };
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
      tasks: tasks.map(calculateLiveTaskHours),
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

// GET /api/tasks/logs/status-history — status change logs for all tasks
router.get('/logs/status-history', async (req, res, next) => {
  try {
    const { search, limit = '200' } = req.query;

    const historyLogs = await prisma.taskHistory.findMany({
      where: {
        action: 'STATUS_CHANGED',
      },
      include: {
        task: {
          select: {
            id: true,
            taskId: true,
            title: true,
          }
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
    });

    const userIds = [...new Set(historyLogs.map(l => l.userId).filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, avatar: true, title: true }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const totalCount = historyLogs.length;
    const formattedLogs = historyLogs.map((log, index) => {
      const logSeq = totalCount - index;
      const logNumber = `LOG-${String(1000 + logSeq).padStart(4, '0')}`;
      const userInfo = log.userId ? userMap.get(log.userId) : null;

      const oldStatus = log.oldValue || 'UNKNOWN';
      const newStatus = log.newValue || 'UNKNOWN';
      const userName = userInfo?.name || 'System User';

      return {
        id: log.id,
        logNumber,
        taskId: log.task?.id || log.taskId,
        taskDisplayId: log.task?.taskId || 'TASK',
        taskTitle: log.task?.title || 'Untitled Task',
        userId: log.userId,
        userName,
        userEmail: userInfo?.email || '',
        userAvatar: userInfo?.avatar || null,
        userTitle: userInfo?.title || '',
        action: log.action,
        oldStatus,
        newStatus,
        description: `${userName} changed status of task ${log.task?.taskId || ''} from ${oldStatus.replace('_', ' ')} to ${newStatus === 'DONE' ? 'COMPLETED' : newStatus.replace('_', ' ')}`,
        createdAt: log.createdAt,
      };
    });

    let filteredLogs = formattedLogs;
    if (search && typeof search === 'string' && search.trim() !== '') {
      const q = search.toLowerCase();
      filteredLogs = formattedLogs.filter(l =>
        l.logNumber.toLowerCase().includes(q) ||
        l.taskDisplayId.toLowerCase().includes(q) ||
        l.taskTitle.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q)
      );
    }

    res.json({
      logs: filteredLogs,
      total: filteredLogs.length,
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
      ...calculateLiveTaskHours(task),
      aiRisk: riskResult,
      aiPriorityScore: priorityScore,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks — Available to all authenticated users
router.post('/', async (req, res, next) => {
  try {
    const user = req.user!;

    const {
      title, description, departmentId, projectId, milestoneId,
      taskTypeId, priorityId, statusId, assigneeId, reviewerId,
      startDate, dueDate, estimatedHours, labels, parentId,
    } = req.body;

    if (!title) throw new AppError('Task title is required', 400);

    // Find department to generate task ID
    let targetDeptId = departmentId || user.departmentId;
    let deptCode = 'GEN';
    if (targetDeptId) {
      const dept = await prisma.department.findUnique({ where: { id: targetDeptId } });
      deptCode = dept?.code || 'GEN';
    }

    // Get default status (BACKLOG)
    const defaultStatus = await prisma.taskStatus.findFirst({
      where: { name: 'BACKLOG' }
    });

    const targetStatusId = statusId || defaultStatus?.id;
    let finalStartDate = startDate ? new Date(startDate) : null;
    if (!finalStartDate && statusId) {
      const selectedStatus = await prisma.taskStatus.findUnique({ where: { id: statusId } });
      if (selectedStatus?.name === 'IN_PROGRESS') {
        finalStartDate = new Date();
      }
    }

    const taskId = await generateTaskId(deptCode);

    const task = await prisma.task.create({
      data: {
        taskId,
        title,
        description,
        departmentId: targetDeptId,
        projectId,
        milestoneId,
        taskTypeId,
        priorityId,
        statusId: targetStatusId,
        assigneeId: assigneeId || user.id,
        reporterId: user.id,
        reviewerId,
        startDate: finalStartDate,
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
    if (assigneeId) {
      await notifyTaskAssigned(task.id, assigneeId, user.name);
    }

    // Broadcast
    broadcast({ type: WSEventTypes.TASK_CREATED, payload: { id: task.id, taskId: task.taskId, title } });

    // Run workflow engine
    const { executeWorkflows } = await import('../services/workflow');
    executeWorkflows('TASK_CREATED', task).catch(console.error);

    res.status(201).json(calculateLiveTaskHours(task));
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

    const {
      title, description, statusId, priorityId, assigneeId, reviewerId,
      dueDate, startDate, estimatedHours, departmentId, projectId, milestoneId,
      taskTypeId,
    } = req.body;

    // Check if user has permission to edit this task
    if (!isSuperAdmin && !isAdmin) {
      const isStatusOnlyUpdate = statusId !== undefined;
      const canEdit = isStatusOnlyUpdate || task.assigneeId === user.id || task.reporterId === user.id;
      if (!canEdit) throw new AppError('You can only edit tasks assigned to or reported by you', 403);
    }

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

      const currentStatusName = task.status?.name || 'BACKLOG';
      const validation = validateTransition(currentStatusName, newStatus.name, user.roleName);
      if (!validation.allowed) {
        throw new AppError(validation.reason || 'Invalid status transition', 403);
      }

      // Transition TO IN_PROGRESS: record active work start time
      if (newStatus.name === 'IN_PROGRESS') {
        if (startDate === undefined) {
          updateData.startDate = new Date();
        }
      }

      // Transition AWAY FROM IN_PROGRESS: accumulate worked hours into actualHours
      if (currentStatusName === 'IN_PROGRESS' && newStatus.name !== 'IN_PROGRESS') {
        const startTs = task.startDate ? new Date(task.startDate).getTime() : new Date(task.updatedAt).getTime();
        const elapsedHours = Math.max(0, (Date.now() - startTs) / (1000 * 60 * 60));
        const sessionHours = elapsedHours > 0 && elapsedHours < 0.1 ? 0.1 : elapsedHours;
        const newActual = Number(((task.actualHours || 0) + sessionHours).toFixed(2));
        updateData.actualHours = newActual;
      }

      if (newStatus.name === 'DONE') {
        updateData.completedAt = new Date();

        // Mark any pending TASK_COMPLETION approval as APPROVED
        const pendingApproval = await prisma.approval.findFirst({
          where: { taskId: task.id, type: 'TASK_COMPLETION', status: 'PENDING' }
        });
        if (pendingApproval) {
          await prisma.approval.update({
            where: { id: pendingApproval.id },
            data: {
              status: 'APPROVED',
              approverId: user.id,
              decisionAt: new Date(),
              notes: req.body.notes || 'Approved directly',
            }
          });
        }

        // Notify assignee when task is approved/marked DONE
        if (task.assigneeId && task.assigneeId !== user.id) {
          await createNotification({
            userId: task.assigneeId,
            taskId: task.id,
            type: 'TASK_APPROVED',
            title: `Task Approved: ${task.title}`,
            message: `Your task was approved as completed by ${user.name}.`,
            actionUrl: `/tasks/${task.id}`,
          });
        }
      }

      // If rejecting from IN_REVIEW -> IN_PROGRESS by Admin/Super Admin
      if (currentStatusName === 'IN_REVIEW' && newStatus.name === 'IN_PROGRESS') {
        const rejectionReason = req.body.rejectionReason || req.body.notes || 'Returned to In Progress';
        await prisma.taskComment.create({
          data: {
            taskId: task.id,
            userId: user.id,
            content: `[REVIEW REJECTED by ${user.name}] Reason: ${rejectionReason}. Task returned to In Progress.`,
          }
        });

        const pendingApproval = await prisma.approval.findFirst({
          where: { taskId: task.id, type: 'TASK_COMPLETION', status: 'PENDING' }
        });
        if (pendingApproval) {
          await prisma.approval.update({
            where: { id: pendingApproval.id },
            data: {
              status: 'REJECTED',
              approverId: user.id,
              decisionAt: new Date(),
              notes: rejectionReason,
            }
          });
        }

        if (task.assigneeId) {
          await createNotification({
            userId: task.assigneeId,
            taskId: task.id,
            type: 'TASK_REJECTED',
            title: `Task Review Rejected: ${task.title}`,
            message: `Your task was rejected by ${user.name}: "${rejectionReason}". Returned to In Progress.`,
            actionUrl: `/tasks/${task.id}`,
          });
        }
      }

      if (newStatus.name === 'IN_REVIEW') {
        await notifySuperAdminsReviewRequested(task.id, user.name, req.body.comment || req.body.description);

        const existingPending = await prisma.approval.findFirst({
          where: { taskId: task.id, type: 'TASK_COMPLETION', status: 'PENDING' }
        });
        if (!existingPending) {
          const primarySuperAdmin = await prisma.user.findFirst({
            where: { role: { name: 'SUPER_ADMIN' }, isActive: true },
            select: { id: true }
          });
          await prisma.approval.create({
            data: {
              title: `Task Review: ${task.title}`,
              description: req.body.comment || `Task ${task.taskId} submitted for review by ${user.name}`,
              type: 'TASK_COMPLETION',
              requesterId: user.id,
              approverId: task.reviewerId || primarySuperAdmin?.id || null,
              taskId: task.id,
              entityType: 'Task',
              entityId: task.id,
              status: 'PENDING'
            }
          });
        }
      }

      updateData.statusId = statusId;
      historyEntries.push({ field: 'status', oldValue: task.status?.name, newValue: newStatus.name, action: 'STATUS_CHANGED' });

      broadcast({
        type: WSEventTypes.TASK_STATUS_CHANGED,
        payload: { taskId: task.taskId, id: task.id, oldStatus: task.status?.name, newStatus: newStatus.name, assigneeId: task.assigneeId }
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

    res.json(calculateLiveTaskHours(updated));
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
        if (action === 'ASSIGN' && value) {
          updateData.assigneeId = value;
          notifyTaskAssigned(id, value, req.user!.name).catch(console.error);
        }
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

// POST /api/tasks/:id/submit-review — Submit task for review with comments & files
router.post('/:id/submit-review', taskUpload.array('files', 10), async (req, res, next) => {
  try {
    const user = req.user!;
    const taskId = req.params.id;
    const commentText = req.body.comment || '';
    const files = (req.files as Express.Multer.File[]) || [];

    const task = await prisma.task.findFirst({
      where: { id: taskId, isDeleted: false },
      include: { status: true, assignee: true, reviewer: true }
    });
    if (!task) throw new AppError('Task not found', 404);

    const inReviewStatus = await prisma.taskStatus.findFirst({
      where: { name: 'IN_REVIEW' }
    });
    if (!inReviewStatus) throw new AppError('IN_REVIEW status not configured', 500);

    // Save uploaded files as TaskAttachments
    const savedAttachments: any[] = [];
    for (const file of files) {
      const att = await prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          name: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          url: `/uploads/${file.filename}`,
          uploadedById: user.id,
        }
      });
      savedAttachments.push(att);
      await prisma.taskHistory.create({
        data: {
          taskId: task.id,
          userId: user.id,
          action: 'ATTACHMENT_ADDED',
          newValue: file.originalname,
        }
      });
    }

    // Format review comment with attachment links
    let fileSummary = '';
    if (savedAttachments.length > 0) {
      fileSummary = '\n\n**Attached Files:**\n' + 
        savedAttachments.map(a => `- [${a.originalName}](${a.url}) (${(a.size / 1024).toFixed(1)} KB)`).join('\n');
    }

    const fullCommentContent = `**[SUBMITTED FOR REVIEW]**\n${commentText || 'Task submitted for review.'}${fileSummary}`;
    const comment = await prisma.taskComment.create({
      data: {
        taskId: task.id,
        userId: user.id,
        content: fullCommentContent,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } }
      }
    });

    // Calculate session duration if task was in IN_PROGRESS
    let sessionHours = 0;
    if (task.status?.name === 'IN_PROGRESS') {
      const startTs = task.startDate ? new Date(task.startDate).getTime() : new Date(task.updatedAt).getTime();
      const elapsedHours = Math.max(0, (Date.now() - startTs) / (1000 * 60 * 60));
      sessionHours = elapsedHours > 0 && elapsedHours < 0.1 ? 0.1 : elapsedHours;
    }
    const updatedActualHours = Number(((task.actualHours || 0) + sessionHours).toFixed(2));

    // Update task status to IN_REVIEW
    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        statusId: inReviewStatus.id,
        actualHours: updatedActualHours,
      },
      include: TASK_INCLUDE,
    });

    // Task History
    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        userId: user.id,
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: task.status?.name || 'UNKNOWN',
        newValue: 'IN_REVIEW',
      }
    });

    // Super Admin recipient
    const primarySuperAdmin = await prisma.user.findFirst({
      where: { role: { name: 'SUPER_ADMIN' }, isActive: true },
      select: { id: true }
    });

    // Create or update pending Approval record
    const approval = await prisma.approval.create({
      data: {
        title: `Task Review: ${task.title}`,
        description: commentText || `Task ${task.taskId} submitted for review by ${user.name}`,
        type: 'TASK_COMPLETION',
        requesterId: user.id,
        approverId: task.reviewerId || primarySuperAdmin?.id || null,
        taskId: task.id,
        entityType: 'Task',
        entityId: task.id,
        status: 'PENDING'
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        approver: { select: { id: true, name: true, email: true } },
        task: { select: { id: true, taskId: true, title: true } }
      }
    });

    // Notify Super Admins
    await notifySuperAdminsReviewRequested(task.id, user.name, commentText);

    // Audit log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'TASK_SUBMITTED_FOR_REVIEW',
      entity: 'Task',
      entityId: task.id,
      newValue: { status: 'IN_REVIEW', comment: commentText, fileCount: files.length },
      req,
    });

    // Realtime broadcasts
    broadcast({
      type: WSEventTypes.TASK_STATUS_CHANGED,
      payload: { taskId: task.taskId, id: task.id, oldStatus: task.status?.name, newStatus: 'IN_REVIEW', assigneeId: task.assigneeId }
    });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: task.id } });
    broadcast({ type: WSEventTypes.APPROVAL_REQUESTED, payload: approval });
    broadcast({ type: WSEventTypes.TASK_COMMENTED, payload: comment });

    res.json({
      success: true,
      task: calculateLiveTaskHours(updatedTask),
      approval,
      comment,
      attachments: savedAttachments,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/:id/approve — Super Admin approve task to Completed
router.post('/:id/approve', requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = req.user!;
    const taskId = req.params.id;
    const notes = req.body.notes || 'Approved as completed';

    const task = await prisma.task.findFirst({
      where: { id: taskId, isDeleted: false },
      include: { status: true, assignee: true }
    });
    if (!task) throw new AppError('Task not found', 404);

    const doneStatus = await prisma.taskStatus.findFirst({ where: { name: 'DONE' } });
    if (!doneStatus) throw new AppError('DONE status not found', 500);

    let sessionHours = 0;
    if (task.status?.name === 'IN_PROGRESS') {
      const startTs = task.startDate ? new Date(task.startDate).getTime() : new Date(task.updatedAt).getTime();
      const elapsedHours = Math.max(0, (Date.now() - startTs) / (1000 * 60 * 60));
      sessionHours = elapsedHours > 0 && elapsedHours < 0.1 ? 0.1 : elapsedHours;
    }
    const updatedActualHours = Number(((task.actualHours || 0) + sessionHours).toFixed(2));

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        statusId: doneStatus.id,
        completedAt: new Date(),
        actualHours: updatedActualHours,
      },
      include: TASK_INCLUDE,
    });

    // Update pending approval
    const pendingApproval = await prisma.approval.findFirst({
      where: { taskId: task.id, type: 'TASK_COMPLETION', status: 'PENDING' }
    });
    if (pendingApproval) {
      await prisma.approval.update({
        where: { id: pendingApproval.id },
        data: {
          status: 'APPROVED',
          approverId: user.id,
          decisionAt: new Date(),
          notes,
        }
      });
    }

    // Comment
    await prisma.taskComment.create({
      data: {
        taskId: task.id,
        userId: user.id,
        content: `[APPROVED by ${user.name}] Task completed. ${notes ? `Note: ${notes}` : ''}`,
      }
    });

    // History
    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        userId: user.id,
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: task.status?.name || 'IN_REVIEW',
        newValue: 'DONE',
      }
    });

    // Notify assignee and requester (employee gets notified with celebration sound)
    const notifyUserIds = new Set<string>();
    if (task.assigneeId) notifyUserIds.add(task.assigneeId);
    if (pendingApproval?.requesterId) notifyUserIds.add(pendingApproval.requesterId);

    for (const targetUserId of notifyUserIds) {
      if (targetUserId !== user.id) {
        await createNotification({
          userId: targetUserId,
          taskId: task.id,
          type: 'TASK_APPROVED',
          title: `Task Approved: ${task.title}`,
          message: `Your task was approved as completed by ${user.name}.`,
          actionUrl: `/tasks/${task.id}`,
        });
      }
    }

    broadcast({ type: WSEventTypes.TASK_STATUS_CHANGED, payload: { taskId: task.taskId, id: task.id, newStatus: 'DONE', assigneeId: task.assigneeId } });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: task.id } });
    broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { taskId: task.id } });

    res.json(calculateLiveTaskHours(updatedTask));
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks/:id/reject — Super Admin reject task back to In Progress
router.post('/:id/reject', requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = req.user!;
    const taskId = req.params.id;
    const reason = req.body.reason || req.body.notes;

    if (!reason?.trim()) {
      throw new AppError('A rejection reason/comment is required when rejecting a task.', 400);
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, isDeleted: false },
      include: { status: true, assignee: true }
    });
    if (!task) throw new AppError('Task not found', 404);

    const inProgressStatus = await prisma.taskStatus.findFirst({ where: { name: 'IN_PROGRESS' } });
    if (!inProgressStatus) throw new AppError('IN_PROGRESS status not found', 500);

    const updatedTask = await prisma.task.update({
      where: { id: task.id },
      data: {
        statusId: inProgressStatus.id,
        startDate: new Date(),
      },
      include: TASK_INCLUDE,
    });

    // Update pending approval to REJECTED
    const pendingApproval = await prisma.approval.findFirst({
      where: { taskId: task.id, type: 'TASK_COMPLETION', status: 'PENDING' }
    });
    if (pendingApproval) {
      await prisma.approval.update({
        where: { id: pendingApproval.id },
        data: {
          status: 'REJECTED',
          approverId: user.id,
          decisionAt: new Date(),
          notes: reason,
        }
      });
    }

    // Comment explaining rejection
    await prisma.taskComment.create({
      data: {
        taskId: task.id,
        userId: user.id,
        content: `[REVIEW REJECTED by ${user.name}] Reason: ${reason}. Task returned to In Progress.`,
      }
    });

    // History
    await prisma.taskHistory.create({
      data: {
        taskId: task.id,
        userId: user.id,
        action: 'STATUS_CHANGED',
        field: 'status',
        oldValue: task.status?.name || 'IN_REVIEW',
        newValue: 'IN_PROGRESS',
      }
    });

    // Notify assignee and requester (employee gets notified with warning sound)
    const notifyUserIds = new Set<string>();
    if (task.assigneeId) notifyUserIds.add(task.assigneeId);
    if (pendingApproval?.requesterId) notifyUserIds.add(pendingApproval.requesterId);

    for (const targetUserId of notifyUserIds) {
      if (targetUserId !== user.id) {
        await createNotification({
          userId: targetUserId,
          taskId: task.id,
          type: 'TASK_REJECTED',
          title: `Task Review Rejected: ${task.title}`,
          message: `Task returned to In Progress by ${user.name}: "${reason}"`,
          actionUrl: `/tasks/${task.id}`,
        });
      }
    }

    broadcast({ type: WSEventTypes.TASK_STATUS_CHANGED, payload: { taskId: task.taskId, id: task.id, newStatus: 'IN_PROGRESS', assigneeId: task.assigneeId } });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: task.id } });

    res.json(calculateLiveTaskHours(updatedTask));
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
