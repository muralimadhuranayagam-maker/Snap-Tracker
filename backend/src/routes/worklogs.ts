import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// GET /api/worklogs?taskId=...
router.get('/', async (req, res, next) => {
  try {
    const { taskId, userId } = req.query;
    const user = req.user!;
    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(user.roleName);

    const where: any = {};
    if (taskId) where.taskId = taskId;

    // Employees can only see their own worklogs
    if (!isAdminOrAbove) where.userId = user.id;
    else if (userId) where.userId = userId;

    const worklogs = await prisma.taskWorklog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        task: { select: { id: true, taskId: true, title: true } },
      },
      orderBy: { logDate: 'desc' },
    });

    res.json(worklogs);
  } catch (err) {
    next(err);
  }
});

// POST /api/worklogs
router.post('/', async (req, res, next) => {
  try {
    const { taskId, hours, description, logDate } = req.body;
    if (!taskId || !hours) throw new AppError('taskId and hours are required', 400);

    const task = await prisma.task.findFirst({ where: { id: taskId, isDeleted: false } });
    if (!task) throw new AppError('Task not found', 404);

    const worklog = await prisma.taskWorklog.create({
      data: {
        taskId,
        userId: req.user!.id,
        hours: parseFloat(hours),
        description,
        logDate: logDate ? new Date(logDate) : new Date(),
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      }
    });

    // Update task actualHours
    const totalLogged = await prisma.taskWorklog.aggregate({
      where: { taskId },
      _sum: { hours: true }
    });

    await prisma.task.update({
      where: { id: taskId },
      data: { actualHours: totalLogged._sum.hours || 0 }
    });

    await prisma.taskHistory.create({
      data: {
        taskId,
        userId: req.user!.id,
        action: 'TASK_WORKLOG_ADDED',
        newValue: `${hours}h - ${description || 'no description'}`,
      }
    });

    broadcast({ type: WSEventTypes.TASK_WORKLOG_ADDED, payload: { taskId, worklog } });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: taskId } });
    broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { taskId, userId: req.user!.id } });

    res.status(201).json(worklog);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/worklogs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const worklog = await prisma.taskWorklog.findUnique({ where: { id: req.params.id } });
    if (!worklog) throw new AppError('Worklog not found', 404);
    if (worklog.userId !== req.user!.id && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName)) {
      throw new AppError('You can only delete your own worklogs', 403);
    }

    await prisma.taskWorklog.delete({ where: { id: req.params.id } });

    // Recalculate actual hours
    const totalLogged = await prisma.taskWorklog.aggregate({
      where: { taskId: worklog.taskId },
      _sum: { hours: true }
    });
    await prisma.task.update({
      where: { id: worklog.taskId },
      data: { actualHours: totalLogged._sum.hours || 0 }
    });

    broadcast({ type: WSEventTypes.TASK_WORKLOG_DELETED, payload: { taskId: worklog.taskId, id: req.params.id } });
    broadcast({ type: WSEventTypes.TASK_UPDATED, payload: { id: worklog.taskId } });
    broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { taskId: worklog.taskId, userId: worklog.userId } });

    res.json({ message: 'Worklog deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
