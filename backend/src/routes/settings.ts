import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// GET /api/settings
router.get('/', async (req, res, next) => {
  try {
    const settings = await prisma.orgSetting.findMany();
    const map: Record<string, string> = {};
    settings.forEach(s => { map[s.key] = s.value; });
    res.json(map);
  } catch (err) { next(err); }
});

// PATCH /api/settings — Super Admin only
router.patch('/', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const updates = req.body as Record<string, string>;
    for (const [key, value] of Object.entries(updates)) {
      await prisma.orgSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value }
      });
    }

    broadcast({ type: WSEventTypes.SETTINGS_UPDATED, payload: updates });

    res.json({ message: 'Settings updated' });
  } catch (err) { next(err); }
});

// GET /api/settings/roles
router.get('/roles', async (_req, res, next) => {
  try {
    const roles = await prisma.role.findMany({
      include: { permissions: { include: { permission: true } } }
    });
    res.json(roles);
  } catch (err) { next(err); }
});

export default router;
