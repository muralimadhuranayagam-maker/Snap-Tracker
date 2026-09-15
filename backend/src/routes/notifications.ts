import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { broadcastToUser, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// GET /api/notifications/sidebar-badges
router.get('/sidebar-badges', async (req, res, next) => {
  try {
    const user = req.user!;

    let viewRows = await prisma.entityLastView.findMany({
      where: { userId: user.id }
    });
    const viewMap = new Map<string, string>();
    viewRows.forEach((r) => {
      viewMap.set(r.entity, r.lastViewedAt);
    });

    const tasksViewedAt = viewMap.get('tasks');
    const ticketsViewedAt = viewMap.get('tickets');
    const projectsViewedAt = viewMap.get('projects');

    // Tasks Badge Count:
    const unreadTaskNotifs = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
        type: { in: ['TASK_ASSIGNED', 'TASK_REASSIGNED', 'TASK_MENTIONED'] }
      }
    });
    let tasksAfterViewed = 0;
    if (tasksViewedAt) {
      tasksAfterViewed = await prisma.task.count({
        where: {
          assigneeId: user.id,
          isDeleted: false,
          createdAt: { gt: new Date(tasksViewedAt) }
        }
      });
    }
    const tasksCount = Math.max(unreadTaskNotifs, tasksAfterViewed);

    // Tickets Badge Count:
    const unreadTicketNotifs = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
        type: { in: ['TICKET_ASSIGNED', 'TICKET_CREATED'] }
      }
    });
    let ticketsAfterViewed = 0;
    if (ticketsViewedAt) {
      ticketsAfterViewed = await prisma.ticket.count({
        where: {
          assigneeId: user.id,
          status: { notIn: ['CLOSED', 'RESOLVED'] },
          createdAt: { gt: new Date(ticketsViewedAt) }
        }
      });
    }
    const ticketsCount = Math.max(unreadTicketNotifs, ticketsAfterViewed);

    // Projects Badge Count:
    const unreadProjectNotifs = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
        type: { in: ['PROJECT_ASSIGNED', 'PROJECT_CREATED'] }
      }
    });
    let projectsAfterViewed = 0;
    if (projectsViewedAt) {
      projectsAfterViewed = await prisma.project.count({
        where: {
          isArchived: false,
          createdAt: { gt: new Date(projectsViewedAt) },
          OR: [
            { members: { some: { userId: user.id } } },
            ...(user.departmentId ? [{ departmentId: user.departmentId }] : [])
          ]
        }
      });
    }
    const projectsCount = Math.max(unreadProjectNotifs, projectsAfterViewed);

    res.json({
      tasks: tasksCount,
      tickets: ticketsCount,
      projects: projectsCount,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/viewed
router.post('/viewed', async (req, res, next) => {
  try {
    const user = req.user!;
    const { entity } = req.body;

    if (!entity || !['tasks', 'tickets', 'projects'].includes(entity)) {
      throw new AppError('Valid entity (tasks, tickets, projects) is required', 400);
    }

    const nowIso = new Date().toISOString();
    
    await prisma.entityLastView.upsert({
      where: {
        userId_entity: { userId: user.id, entity }
      },
      update: { lastViewedAt: nowIso },
      create: { userId: user.id, entity, lastViewedAt: nowIso }
    });

    // Mark corresponding notifications as read
    const typeMapping: Record<string, string[]> = {
      tasks: ['TASK_ASSIGNED', 'TASK_REASSIGNED', 'TASK_MENTIONED'],
      tickets: ['TICKET_ASSIGNED', 'TICKET_CREATED'],
      projects: ['PROJECT_ASSIGNED', 'PROJECT_CREATED'],
    };

    const typesToMarkRead = typeMapping[entity] || [];
    if (typesToMarkRead.length > 0) {
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          isRead: false,
          type: { in: typesToMarkRead }
        },
        data: { isRead: true }
      });
    }

    broadcastToUser(user.id, {
      type: WSEventTypes.SIDEBAR_BADGES_UPDATED,
      payload: { entity, viewedAt: nowIso }
    });

    res.json({ success: true, entity, viewedAt: nowIso });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const { isRead, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { userId: req.user!.id };
    if (isRead !== undefined) where.isRead = isRead === 'true';

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: req.user!.id, isRead: false } }),
    ]);

    res.json({ notifications, total, unreadCount, page: parseInt(page as string) });
  } catch (err) {
    next(err);
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    res.json({ unreadCount: count, count });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/:id/read
router.patch('/:id/read', async (req, res, next) => {
  try {
    const notif = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notif || notif.userId !== req.user!.id) throw new AppError('Not found', 404);

    await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });

    broadcastToUser(req.user!.id, {
      type: WSEventTypes.NOTIFICATION_READ,
      payload: { id: req.params.id }
    });

    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/notifications/read-all
router.patch('/read-all', async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true }
    });

    broadcastToUser(req.user!.id, {
      type: WSEventTypes.NOTIFICATION_ALL_READ,
      payload: {}
    });

    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

export default router;
