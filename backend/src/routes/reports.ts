import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

const router = Router();
router.use(authenticate);

// GET /api/reports/overview
router.get('/overview', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { startDate, endDate, departmentId } = req.query;
    const now = new Date();
    const from = startDate ? new Date(startDate as string) : subDays(now, 30);
    const to = endDate ? new Date(endDate as string) : now;

    const where: any = { isDeleted: false, createdAt: { gte: from, lte: to } };
    if (departmentId) where.departmentId = departmentId;

    const [total, done, overdue, blocked, inReview] = await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: { name: 'DONE' } } }),
      prisma.task.count({ where: { ...where, dueDate: { lt: to }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { ...where, status: { name: 'BLOCKED' } } }),
      prisma.task.count({ where: { ...where, status: { name: 'IN_REVIEW' } } }),
    ]);

    const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;

    // Average cycle time (created to done)
    const completedTasks = await prisma.task.findMany({
      where: { ...where, status: { name: 'DONE' }, completedAt: { not: null } },
      select: { createdAt: true, completedAt: true }
    });

    let avgCycleTime = 0;
    let totalHoursTaken = 0;
    
    if (completedTasks.length > 0) {
      totalHoursTaken = completedTasks.reduce((sum, t) => {
        const diff = (t.completedAt!.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
        const hours = Math.max(0, diff);
        return sum + hours;
      }, 0);
      avgCycleTime = Math.max(0, Math.round(totalHoursTaken / completedTasks.length));
    }
    
    const issueTypes = await prisma.taskType.findMany({
      where: { name: { in: ['Bug', 'Customer Issue', 'Issue'] } }
    });
    const issueTypeIds = issueTypes.map(t => t.id);
    
    const issuesRaised = await prisma.task.count({
      where: { ...where, taskTypeId: { in: issueTypeIds } }
    });

    // Daily completion trend
    const dayCount = Math.min(30, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
    const completionTrend = await Promise.all(
      Array.from({ length: Math.min(dayCount, 14) }, (_, i) => {
        const day = subDays(to, dayCount - 1 - i);
        return prisma.task.count({
          where: {
            ...(departmentId ? { departmentId: departmentId as string } : {}),
            completedAt: { gte: startOfDay(day), lte: endOfDay(day) },
            status: { name: 'DONE' },
          }
        }).then(count => ({ date: format(day, 'MMM d'), count }));
      })
    );

    // Department breakdown
    const departments = await prisma.department.findMany({
      include: {
        _count: {
          select: {
            tasks: { where: { isDeleted: false, createdAt: { gte: from, lte: to } } }
          }
        }
      }
    });

    // Priority breakdown
    const priorities = await prisma.taskPriority.findMany({
      include: {
        _count: {
          select: {
            tasks: { where: { isDeleted: false, createdAt: { gte: from, lte: to } } }
          }
        }
      }
    });

    // SLA Center Metrics
    const allTickets = await prisma.ticket.findMany();
    const totalTickets = allTickets.length;
    const breachedTickets = allTickets.filter(t => t.slaBreached || (t.slaTarget && now > t.slaTarget && !['RESOLVED', 'CLOSED'].includes(t.status))).length;
    const activeSlaTickets = allTickets.filter(t => !['RESOLVED', 'CLOSED'].includes(t.status));
    const resolvedTickets = allTickets.filter(t => ['RESOLVED', 'CLOSED'].includes(t.status));
    const withinSlaTickets = totalTickets - breachedTickets;
    const slaComplianceRate = totalTickets > 0 ? Math.round((withinSlaTickets / totalTickets) * 100) : 100;

    res.json({
      period: { from, to },
      summary: { 
        total, 
        done, 
        overdue, 
        blocked, 
        inReview, 
        completionRate, 
        avgCycleTimeHours: avgCycleTime,
        totalHoursTaken: Math.round(totalHoursTaken),
        issuesRaised 
      },
      slaMetrics: {
        totalTickets,
        activeSla: activeSlaTickets.length,
        breachedTickets,
        withinSlaTickets,
        resolvedTickets: resolvedTickets.length,
        complianceRate: slaComplianceRate,
      },
      completionTrend,
      departmentBreakdown: departments.map(d => ({ name: d.name, code: d.code, count: d._count.tasks, color: d.color })),
      priorityDistribution: priorities.map(p => ({ name: p.name, count: p._count.tasks, color: p.color })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/employee/:userId
router.get('/employee/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const user = req.user!;

    // RBAC: employees can only see their own report
    if (user.roleName === 'EMPLOYEE' && userId !== user.id) {
      throw new AppError('Access denied', 403);
    }

    const { startDate, endDate } = req.query;
    const now = new Date();
    const from = startDate ? new Date(startDate as string) : subDays(now, 30);
    const to = endDate ? new Date(endDate as string) : now;

    const [total, done, overdue, blocked] = await Promise.all([
      prisma.task.count({ where: { assigneeId: userId, isDeleted: false } }),
      prisma.task.count({ where: { assigneeId: userId, isDeleted: false, status: { name: 'DONE' }, completedAt: { gte: from, lte: to } } }),
      prisma.task.count({ where: { assigneeId: userId, isDeleted: false, dueDate: { lt: now }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { assigneeId: userId, isDeleted: false, status: { name: 'BLOCKED' } } }),
    ]);

    const totalHoursLogged = await prisma.taskWorklog.aggregate({
      where: { userId, logDate: { gte: from, lte: to } },
      _sum: { hours: true }
    });

    // On-time completion
    const completedWithDates = await prisma.task.findMany({
      where: { assigneeId: userId, isDeleted: false, status: { name: 'DONE' }, completedAt: { gte: from, lte: to }, dueDate: { not: null } },
      select: { dueDate: true, completedAt: true }
    });
    const onTime = completedWithDates.filter(t => t.completedAt! <= t.dueDate!).length;
    const onTimeRate = completedWithDates.length > 0 ? Math.round((onTime / completedWithDates.length) * 100) : 100;

    res.json({
      period: { from, to },
      stats: {
        total, done, overdue, blocked,
        onTimeRate,
        hoursLogged: totalHoursLogged._sum.hours || 0,
      },
      note: "Task completion metrics reflect complexity of work, not just quantity.",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/department/:deptId
router.get('/department/:deptId', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { deptId } = req.params;
    const { startDate, endDate } = req.query;
    const now = new Date();
    const from = startDate ? new Date(startDate as string) : subDays(now, 30);
    const to = endDate ? new Date(endDate as string) : now;

    const members = await prisma.user.findMany({
      where: { departmentId: deptId, isActive: true },
      select: { id: true, name: true }
    });

    const memberStats = await Promise.all(members.map(async (m) => {
      const [active, done, overdue] = await Promise.all([
        prisma.task.count({ where: { assigneeId: m.id, isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { assigneeId: m.id, isDeleted: false, status: { name: 'DONE' }, completedAt: { gte: from, lte: to } } }),
        prisma.task.count({ where: { assigneeId: m.id, isDeleted: false, dueDate: { lt: now }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      ]);
      return { ...m, stats: { active, done, overdue } };
    }));

    res.json({ members: memberStats });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/workload
router.get('/workload', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { getAllWorkloads } = await import('../services/workload');
    const workloads = await getAllWorkloads();
    res.json(workloads);
  } catch (err) {
    next(err);
  }
});

export default router;
