import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole, requireAdminOrAbove } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// GET /api/workflows
router.get('/', requireAdminOrAbove, async (req, res, next) => {
  try {
    const workflows = await prisma.workflow.findMany({
      include: { steps: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'desc' }
    });
    res.json(workflows);
  } catch (err) { next(err); }
});

// POST /api/workflows
router.post('/', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, description, trigger, config, steps } = req.body;
    if (!name || !trigger) throw new AppError('Name and trigger are required', 400);

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        trigger,
        config: config ? JSON.stringify(config) : '{}',
        createdById: req.user!.id,
        steps: {
          create: (steps || []).map((s: any, i: number) => ({
            order: s.order ?? i,
            type: s.type,
            config: JSON.stringify(s.config || {}),
          }))
        }
      },
      include: { steps: true }
    });

    res.status(201).json(workflow);
  } catch (err) { next(err); }
});

// PATCH /api/workflows/:id
router.patch('/:id', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { name, description, isActive } = req.body;
    const wf = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { name, description, isActive }
    });
    res.json(wf);
  } catch (err) { next(err); }
});

// DELETE /api/workflows/:id
router.delete('/:id', requireAdminOrAbove, async (req, res, next) => {
  try {
    const wf = await prisma.workflow.findUnique({ where: { id: req.params.id } });
    if (wf?.isSystem) throw new AppError('Cannot delete system workflows', 400);
    await prisma.workflow.delete({ where: { id: req.params.id } });
    res.json({ message: 'Workflow deleted' });
  } catch (err) { next(err); }
});

export default router;
