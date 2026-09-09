import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  roleId: string;
  roleName: string;
  departmentId: string | null;
  departmentCode: string | null;
  permissions: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId, isActive: true },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true }
            }
          }
        },
        department: true,
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      roleId: user.roleId,
      roleName: user.role.name,
      departmentId: user.departmentId,
      departmentCode: user.department?.code || null,
      permissions: user.role.permissions.map(rp => rp.permission.name),
    };

    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requirePermission(...permissions: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const isSuperAdmin = req.user.roleName === 'SUPER_ADMIN';
    if (isSuperAdmin) return next();

    const hasPermission = permissions.some(p => req.user!.permissions.includes(p));
    if (!hasPermission) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permissions,
      });
    }

    next();
  };
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.roleName)) {
      return res.status(403).json({
        error: 'Access denied',
        required: roles,
        current: req.user.roleName,
      });
    }

    next();
  };
}

export function requireAdminOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (!['SUPER_ADMIN', 'ADMIN'].includes(req.user.roleName)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}
