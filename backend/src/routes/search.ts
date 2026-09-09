import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/search?q=...
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || (q as string).length < 2) {
      return res.json({ tasks: [], tickets: [], projects: [], customers: [], users: [] });
    }

    const user = req.user!;
    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(user.roleName);
    const searchStr = q as string;

    const taskWhere: any = {
      isDeleted: false,
      OR: [
        { title: { contains: searchStr } },
        { taskId: { contains: searchStr } },
        { description: { contains: searchStr } },
      ]
    };

    if (!isAdminOrAbove) {
      taskWhere.AND = [{
        OR: [
          { assigneeId: user.id },
          { reporterId: user.id },
          { departmentId: user.departmentId },
        ]
      }];
    }

    const ticketWhere: any = {
      OR: [
        { title: { contains: searchStr } },
        { ticketId: { contains: searchStr } },
        { description: { contains: searchStr } },
      ]
    };

    if (!isAdminOrAbove) {
      ticketWhere.AND = [{
        OR: [
          { assigneeId: user.id },
          { reporterId: user.id },
          { departmentId: user.departmentId },
        ]
      }];
    }

    const [tasks, tickets, projects, customers, users] = await Promise.all([
      // Tasks
      prisma.task.findMany({
        where: taskWhere,
        include: {
          status: { select: { name: true, color: true } },
          priority: { select: { name: true, color: true } },
          department: { select: { code: true } },
        },
        take: 8,
      }),
      // Tickets
      prisma.ticket.findMany({
        where: ticketWhere,
        include: {
          department: { select: { code: true, name: true } },
          customer: { select: { name: true, code: true } },
        },
        take: 8,
      }),
      // Projects
      prisma.project.findMany({
        where: {
          isArchived: false,
          OR: [
            { name: { contains: searchStr } },
            { description: { contains: searchStr } },
          ]
        },
        include: { department: { select: { name: true, code: true } } },
        take: 5,
      }),
      // Customers
      prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: searchStr } },
            { code: { contains: searchStr } },
            { industry: { contains: searchStr } },
          ]
        },
        take: 5,
      }),
      // Users
      isAdminOrAbove ? prisma.user.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: searchStr } },
            { email: { contains: searchStr } },
          ]
        },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          department: { select: { name: true, code: true } }
        },
        take: 5,
      }) : [],
    ]);

    res.json({ tasks, tickets, projects, customers, users });
  } catch (err) {
    next(err);
  }
});

export default router;
