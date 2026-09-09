import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove, requireRole } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  password: z.string().min(8),
  roleId: z.string(),
  departmentId: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
});

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const { departmentId, roleId, isActive, search } = req.query;
    const isSuperAdmin = req.user!.roleName === 'SUPER_ADMIN';
    const isAdmin = req.user!.roleName === 'ADMIN';

    const where: any = {};

    // Employees can only see users in their own department
    if (!isSuperAdmin && !isAdmin) {
      where.departmentId = req.user!.departmentId || undefined;
    }

    if (departmentId) where.departmentId = departmentId;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (roleId) where.roleId = roleId;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
      include: {
        role: { select: { name: true, id: true } },
        department: { select: { name: true, code: true, id: true, color: true } },
        _count: {
          select: { assignedTasks: { where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } } }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      title: u.title,
      isActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
      role: u.role,
      department: u.department,
      activeTaskCount: u._count.assignedTasks,
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        department: true,
        _count: {
          select: {
            assignedTasks: true,
            reportedTasks: true,
            comments: true,
            worklogs: true,
          }
        }
      }
    });

    if (!user) throw new AppError('User not found', 404);

    const isSuperAdmin = req.user!.roleName === 'SUPER_ADMIN';
    const isAdmin = req.user!.roleName === 'ADMIN';
    const isSelf = req.user!.id === user.id;

    // RBAC: employees can only view their own profile or dept colleagues
    if (!isSuperAdmin && !isAdmin && !isSelf && user.departmentId !== req.user!.departmentId) {
      throw new AppError('Access denied', 403);
    }

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      title: user.title,
      phone: user.phone,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      role: user.role,
      department: user.department,
      stats: user._count,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/users — Super Admin only
router.post('/', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 409);

    const hashed = await bcrypt.hash(data.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashed,
        roleId: data.roleId,
        departmentId: data.departmentId,
        title: data.title,
        phone: data.phone,
      },
      include: {
        role: { select: { name: true } },
        department: { select: { name: true, code: true } }
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: AuditActions.USER_CREATED,
      entity: 'User',
      entityId: user.id,
      newValue: { email: user.email, name: user.name, role: user.role.name },
      req,
    });

    // Create notification preferences
    await prisma.notificationPreference.create({ data: { userId: user.id } });

    broadcast({
      type: WSEventTypes.USER_CREATED,
      payload: { id: user.id, name: user.name, role: user.role.name }
    });

    res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role, department: user.department });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/users/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const isSuperAdmin = req.user!.roleName === 'SUPER_ADMIN';
    const isAdmin = req.user!.roleName === 'ADMIN';
    const isSelf = req.user!.id === req.params.id;

    if (!isSuperAdmin && !isSelf) {
      throw new AppError('You can only update your own profile', 403);
    }

    const { name, title, phone, avatar, isActive, departmentId, roleId } = req.body;

    // Only Super Admin can change role/department/active status
    const updateData: any = {};
    if (name) updateData.name = name;
    if (title !== undefined) updateData.title = title;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (isSuperAdmin && isActive !== undefined) updateData.isActive = isActive;
    if (isSuperAdmin && departmentId !== undefined) updateData.departmentId = departmentId;
    if (isSuperAdmin && roleId !== undefined) updateData.roleId = roleId;

    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw new AppError('User not found', 404);

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        role: { select: { name: true } },
        department: { select: { name: true, code: true } }
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: AuditActions.USER_UPDATED,
      entity: 'User',
      entityId: updated.id,
      oldValue: { name: before.name, isActive: before.isActive },
      newValue: { name: updated.name, isActive: updated.isActive },
      req,
    });

    broadcast({
      type: WSEventTypes.USER_UPDATED,
      payload: { id: updated.id, name: updated.name }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — Super Admin only (soft delete)
router.delete('/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    if (req.params.id === req.user!.id) throw new AppError("You cannot deactivate yourself", 400);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: AuditActions.USER_DEACTIVATED,
      entity: 'User',
      entityId: user.id,
      req,
    });

    res.json({ message: 'User deactivated successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
