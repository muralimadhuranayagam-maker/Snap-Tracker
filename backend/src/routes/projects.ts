import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { createAuditLog } from '../services/audit';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// GET /api/projects
router.get('/', async (req, res, next) => {
  try {
    const { status, departmentId, search } = req.query;
    const user = req.user!;
    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(user.roleName);

    const where: any = { isArchived: false };
    if (!isAdminOrAbove) {
      // Employees only see projects they are members of
      where.OR = [
        { members: { some: { userId: user.id } } },
        { departmentId: user.departmentId },
      ];
    }
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true, color: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } }
        },
        milestones: { orderBy: { order: 'asc' } },
        _count: {
          select: {
            tasks: { where: { isDeleted: false } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // Enrich with task stats
    const enriched = await Promise.all(projects.map(async (p) => {
      const [total, done, overdue, blocked] = await Promise.all([
        prisma.task.count({ where: { projectId: p.id, isDeleted: false } }),
        prisma.task.count({ where: { projectId: p.id, isDeleted: false, status: { name: 'DONE' } } }),
        prisma.task.count({ where: { projectId: p.id, isDeleted: false, dueDate: { lt: new Date() }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { projectId: p.id, isDeleted: false, status: { name: 'BLOCKED' } } }),
      ]);

      return {
        ...p,
        stats: { total, done, overdue, blocked, progress: total > 0 ? Math.round((done / total) * 100) : 0 }
      };
    }));

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// GET /api/projects/:id
router.get('/:id', async (req, res, next) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        department: true,
        members: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true, title: true, role: { select: { name: true } } } } }
        },
        milestones: { orderBy: { order: 'asc' } },
        documents: { orderBy: { updatedAt: 'desc' } },
      }
    });

    if (!project) throw new AppError('Project not found', 404);

    const [tasks, taskStats] = await Promise.all([
      prisma.task.findMany({
        where: { projectId: project.id, isDeleted: false, parentId: null },
        include: {
          status: true, priority: true,
          assignee: { select: { id: true, name: true, avatar: true } }
        },
        orderBy: [{ priority: { level: 'desc' } }, { dueDate: 'asc' }]
      }),
      Promise.all([
        prisma.task.count({ where: { projectId: project.id, isDeleted: false } }),
        prisma.task.count({ where: { projectId: project.id, isDeleted: false, status: { name: 'DONE' } } }),
        prisma.task.count({ where: { projectId: project.id, isDeleted: false, dueDate: { lt: new Date() }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { projectId: project.id, isDeleted: false, status: { name: 'BLOCKED' } } }),
      ])
    ]);

    const [total, done, overdue, blocked] = taskStats;

    const { assessProjectHealth } = await import('../services/ai');
    const health = await assessProjectHealth(project.id);

    res.json({
      ...project,
      tasks,
      stats: { total, done, overdue, blocked, progress: total > 0 ? Math.round((done / total) * 100) : 0 },
      health,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects
router.post('/', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, description, departmentId, priority, startDate, dueDate, color } = req.body;
    if (!name) throw new AppError('Project name is required', 400);

    const project = await prisma.project.create({
      data: {
        name,
        description,
        departmentId,
        priority: priority || 'MEDIUM',
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        color: color || '#6366f1',
        createdById: req.user!.id,
      }
    });

    // Auto-add creator as lead
    await prisma.projectMember.create({
      data: { projectId: project.id, userId: req.user!.id, role: 'LEAD' }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'PROJECT_CREATED',
      entity: 'Project',
      entityId: project.id,
      newValue: { name },
      req,
    });

    broadcast({ type: WSEventTypes.PROJECT_CREATED, payload: project });

    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/projects/:id
router.patch('/:id', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, description, status, priority, dueDate, startDate, color } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name, description, status, priority, color,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
      }
    });

    broadcast({ type: WSEventTypes.PROJECT_UPDATED, payload: project });

    res.json(project);
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/members
router.post('/:id/members', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { userId, role = 'MEMBER' } = req.body;
    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: req.params.id, userId } },
      create: { projectId: req.params.id, userId, role },
      update: { role },
    });

    broadcast({ type: WSEventTypes.PROJECT_UPDATED, payload: { id: req.params.id, member } });

    res.json(member);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/projects/:id/members/:userId
router.delete('/:id/members/:userId', requireAdminOrAbove, async (req, res, next) => {
  try {
    await prisma.projectMember.deleteMany({
      where: { projectId: req.params.id, userId: req.params.userId }
    });

    broadcast({ type: WSEventTypes.PROJECT_UPDATED, payload: { id: req.params.id } });

    res.json({ message: 'Member removed' });
  } catch (err) {
    next(err);
  }
});

// POST /api/projects/:id/milestones
router.post('/:id/milestones', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, description, dueDate, order } = req.body;
    const milestone = await prisma.milestone.create({
      data: { projectId: req.params.id, name, description, dueDate: dueDate ? new Date(dueDate) : null, order: order || 0 }
    });

    broadcast({ type: WSEventTypes.PROJECT_UPDATED, payload: { id: req.params.id, milestone } });

    res.status(201).json(milestone);
  } catch (err) {
    next(err);
  }
});

export default router;
