import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// GET /api/departments
router.get('/', async (_req, res, next) => {
  try {
    const departments = await prisma.department.findMany({
      include: {
        _count: {
          select: {
            users: { where: { isActive: true } },
            tasks: { where: { isDeleted: false } }
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(departments);
  } catch (err) {
    next(err);
  }
});

// GET /api/departments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: {
        users: {
          where: { isActive: true },
          include: {
            role: { select: { name: true } },
            _count: {
              select: { assignedTasks: { where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } } }
            }
          }
        },
        _count: {
          select: {
            tasks: { where: { isDeleted: false } },
            projects: true,
          }
        }
      }
    });

    if (!dept) throw new AppError('Department not found', 404);
    res.json(dept);
  } catch (err) {
    next(err);
  }
});

// POST /api/departments — Super Admin only
router.post('/', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { name, code, description, color } = req.body;
    if (!name || !code) throw new AppError('Name and code are required', 400);

    const dept = await prisma.department.create({
      data: { name, code: code.toUpperCase(), description, color }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'DEPARTMENT_CREATED',
      entity: 'Department',
      entityId: dept.id,
      newValue: { name, code },
      req,
    });

    broadcast({ type: WSEventTypes.DEPARTMENT_CREATED, payload: dept });

    res.status(201).json(dept);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/departments/:id — Super Admin only
router.patch('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { name, description, color } = req.body;
    const dept = await prisma.department.update({
      where: { id: req.params.id },
      data: { name, description, color }
    });

    broadcast({ type: WSEventTypes.DEPARTMENT_UPDATED, payload: dept });

    res.json(dept);
  } catch (err) {
    next(err);
  }
});

export default router;
