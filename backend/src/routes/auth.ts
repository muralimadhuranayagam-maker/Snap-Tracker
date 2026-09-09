import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { createAuditLog, AuditActions } from '../services/audit';
import { AppError } from '../middleware/errorHandler';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function generateToken(userId: string, departmentId: string | null, roleName: string) {
  return jwt.sign(
    { userId, departmentId, roleName },
    process.env.JWT_SECRET || 'snapserve-fallback-secret',
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as any }
  );
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } }
          }
        },
        department: true,
      }
    });

    if (!user || !user.isActive) {
      await createAuditLog({
        action: AuditActions.USER_LOGIN_FAILED,
        entity: 'User',
        userEmail: email,
        req,
        metadata: { reason: 'User not found or inactive' }
      });
      throw new AppError('Invalid email or password', 401);
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      await createAuditLog({
        action: AuditActions.USER_LOGIN_FAILED,
        entity: 'User',
        entityId: user.id,
        userEmail: email,
        req,
      });
      throw new AppError('Invalid email or password', 401);
    }

    const token = generateToken(user.id, user.departmentId, user.role.name);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: AuditActions.USER_LOGIN,
      entity: 'User',
      entityId: user.id,
      req,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        title: user.title,
        role: user.role.name,
        department: user.department ? {
          id: user.department.id,
          name: user.department.name,
          code: user.department.code,
        } : null,
        permissions: user.role.permissions.map(rp => rp.permission.name),
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res, next) => {
  try {
    await createAuditLog({
      userId: req.user!.id,
      userEmail: req.user!.email,
      action: AuditActions.USER_LOGOUT,
      entity: 'User',
      entityId: req.user!.id,
      req,
    });
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } }
          }
        },
        department: true,
      }
    });

    if (!user) throw new AppError('User not found', 404);

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
      title: user.title,
      phone: user.phone,
      role: user.role.name,
      department: user.department ? {
        id: user.department.id,
        name: user.department.name,
        code: user.department.code,
        color: user.department.color,
      } : null,
      permissions: user.role.permissions.map(rp => rp.permission.name),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) throw new AppError('Both current and new password are required', 400);
    if (newPassword.length < 8) throw new AppError('Password must be at least 8 characters', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError('User not found', 404);

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) throw new AppError('Current password is incorrect', 400);

    const hashed = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
