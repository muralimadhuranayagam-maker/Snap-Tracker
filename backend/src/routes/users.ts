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
  password: z.string().min(6).optional().default('Welcome@123'),
  roleId: z.string(),
  departmentId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
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
      phone: u.phone,
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

// POST /api/users — Super Admin & Admin
router.post('/', requireAdminOrAbove, async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 409);

    const isSuperAdmin = req.user!.roleName === 'SUPER_ADMIN';

    // Verify role exists
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) throw new AppError('Selected role does not exist', 400);

    // Only Super Admin can assign the Super Admin role
    if (!isSuperAdmin && role.name === 'SUPER_ADMIN') {
      throw new AppError('Only Super Admins can create or assign a Super Admin account', 403);
    }

    const rawPassword = data.password || 'Welcome@123';
    const hashed = await bcrypt.hash(rawPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    const user = await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: hashed,
        roleId: data.roleId,
        departmentId: data.departmentId || null,
        title: data.title || null,
        phone: data.phone || null,
        avatar: data.avatar || null,
        mustChangePassword: true,
      },
      include: {
        role: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, code: true, color: true } },
        _count: {
          select: { assignedTasks: { where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } } }
        }
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
      payload: { id: user.id, name: user.name, role: user.role.name, email: user.email }
    });

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      title: user.title,
      phone: user.phone,
      isActive: user.isActive,
      role: user.role,
      department: user.department,
      activeTaskCount: user._count?.assignedTasks || 0,
    });
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

    const { name, email, title, phone, avatar, isActive, departmentId, roleId } = req.body;

    const before = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!before) throw new AppError('User not found', 404);

    // Only Super Admin can change role/department/active status
    const updateData: any = {};
    if (name) updateData.name = name;
    if (email && email !== before.email) {
      const emailExists = await prisma.user.findUnique({ where: { email } });
      if (emailExists && emailExists.id !== before.id) {
        throw new AppError('Email address is already registered', 409);
      }
      updateData.email = email;
    }
    if (title !== undefined) updateData.title = title;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (isSuperAdmin && isActive !== undefined) updateData.isActive = isActive;
    if (isSuperAdmin && departmentId !== undefined) updateData.departmentId = departmentId;
    if (isSuperAdmin && roleId !== undefined) updateData.roleId = roleId;

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        role: { select: { id: true, name: true } },
        department: { select: { id: true, name: true, code: true, color: true } }
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

// POST /api/users/:id/temp-password — Super Admin only
router.post('/:id/temp-password', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) throw new AppError('User not found', 404);

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-2).toUpperCase() + '!';
    const hashed = await bcrypt.hash(tempPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
        mustChangePassword: true,
      }
    });

    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: 'TEMP_PASSWORD_GENERATED',
      entity: 'User',
      entityId: user.id,
      req,
    });

    res.json({ tempPassword });
  } catch (err) {
    next(err);
  }
});

export default router;
