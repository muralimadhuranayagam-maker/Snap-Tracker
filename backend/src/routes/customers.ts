import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createAuditLog } from '../services/audit';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// ─── GET /api/customers ──────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { status, tier, search } = req.query;
    const where: any = {};

    if (status) where.status = status as string;
    if (tier) where.tier = tier as string;
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { code: { contains: search as string } },
        { industry: { contains: search as string } },
      ];
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        _count: {
          select: {
            projects: true,
            tickets: true,
            tasks: true,
          }
        },
        projects: {
          select: { id: true, name: true, status: true, health: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(customers);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/customers/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        projects: {
          include: {
            members: {
              include: { user: { select: { id: true, name: true, email: true, avatar: true } } }
            },
            _count: { select: { tasks: true } }
          }
        },
        tickets: {
          include: {
            assignee: { select: { id: true, name: true, avatar: true } },
            department: { select: { id: true, name: true, code: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        },
        tasks: {
          include: {
            status: true,
            priority: true,
            assignee: { select: { id: true, name: true, avatar: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    });

    if (!customer) throw new AppError('Customer not found', 404);

    res.json(customer);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/customers ─────────────────────────────────────────────────────
router.post('/', requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = req.user!;
    const {
      name, code, tier = 'ENTERPRISE', industry, arr,
      primaryContactName, primaryContactEmail, primaryContactPhone,
      healthScore = 95
    } = req.body;

    if (!name || !code) throw new AppError('Customer name and code are required', 400);

    const existingCode = await prisma.customer.findFirst({
      where: { OR: [{ code }, { name }] }
    });
    if (existingCode) throw new AppError('Customer with this name or code already exists', 409);

    const customer = await prisma.customer.create({
      data: {
        name,
        code: code.toUpperCase(),
        tier,
        industry,
        arr: arr ? parseFloat(arr) : null,
        primaryContactName,
        primaryContactEmail,
        primaryContactPhone,
        healthScore: parseFloat(healthScore as string) || 95.0,
      }
    });

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'CUSTOMER_CREATED',
      entity: 'Customer',
      entityId: customer.id,
      newValue: { name, code },
      req,
    });

    broadcast({ type: WSEventTypes.CUSTOMER_CREATED, payload: customer });

    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/customers/:id ────────────────────────────────────────────────
router.patch('/:id', requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = req.user!;
    const existing = await prisma.customer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Customer not found', 404);

    const {
      name, tier, industry, arr, healthScore, status,
      primaryContactName, primaryContactEmail, primaryContactPhone
    } = req.body;

    const updated = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(tier && { tier }),
        ...(industry !== undefined && { industry }),
        ...(arr !== undefined && { arr: arr ? parseFloat(arr) : null }),
        ...(healthScore !== undefined && { healthScore: parseFloat(healthScore) }),
        ...(status && { status }),
        ...(primaryContactName !== undefined && { primaryContactName }),
        ...(primaryContactEmail !== undefined && { primaryContactEmail }),
        ...(primaryContactPhone !== undefined && { primaryContactPhone }),
      }
    });

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'CUSTOMER_UPDATED',
      entity: 'Customer',
      entityId: updated.id,
      oldValue: { name: existing.name, healthScore: existing.healthScore },
      newValue: { name: updated.name, healthScore: updated.healthScore },
      req,
    });

    broadcast({ type: WSEventTypes.CUSTOMER_UPDATED, payload: updated });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
