import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';

const router = Router();
router.use(authenticate);

// GET /api/dashboard
router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    if (isSuperAdmin) {
      // ── SUPER ADMIN DASHBOARD ───────────────────────────────────────────
      const [
        totalUsers, activeUsers, activeProjects, atRiskProjects, openTasks,
        completedToday, overdueTasks, blockedTasks, reviewTasks,
        criticalTasks, openTickets, slaBreaches, criticalTickets,
        tasksByStatus, tasksByPriority, tasksByDept
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.project.count({ where: { status: 'ACTIVE', isArchived: false } }),
        prisma.project.count({ where: { health: { in: ['AT_RISK', 'CRITICAL'] }, isArchived: false } }),
        prisma.task.count({ where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { completedAt: { gte: todayStart, lte: todayEnd }, status: { name: 'DONE' } } }),
        prisma.task.count({ where: { isDeleted: false, dueDate: { lt: now }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { isDeleted: false, status: { name: 'BLOCKED' } } }),
        prisma.task.count({ where: { isDeleted: false, status: { name: 'IN_REVIEW' } } }),
        prisma.task.count({ where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } }, priority: { name: { in: ['CRITICAL', 'URGENT'] } } } }),
        prisma.ticket.count({ where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
        prisma.ticket.count({
          where: {
            OR: [
              { slaBreached: true },
              { slaTarget: { lt: now }, status: { notIn: ['RESOLVED', 'CLOSED'] } }
            ]
          }
        }),
        prisma.ticket.count({ where: { priority: 'CRITICAL', status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
        prisma.taskStatus.findMany({
          include: { _count: { select: { tasks: { where: { isDeleted: false } } } } }
        }),
        prisma.taskPriority.findMany({
          include: { _count: { select: { tasks: { where: { isDeleted: false } } } } }
        }),
        prisma.department.findMany({
          include: {
            _count: {
              select: {
                tasks: { where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } },
                tickets: { where: { status: { notIn: ['RESOLVED', 'CLOSED'] } } }
              }
            }
          }
        }),
      ]);

      // Completion trend (last 7 days)
      const completionTrend = await Promise.all(
        Array.from({ length: 7 }, (_, i) => {
          const day = subDays(now, 6 - i);
          return prisma.task.count({
            where: {
              completedAt: { gte: startOfDay(day), lte: endOfDay(day) },
              status: { name: 'DONE' }
            }
          }).then(count => ({ date: format(day, 'MMM d'), count }));
        })
      );

      // Overdue trend (last 7 days snapshot)
      const overdueTrend = await Promise.all(
        Array.from({ length: 7 }, (_, i) => {
          const day = subDays(now, 6 - i);
          return prisma.task.count({
            where: {
              createdAt: { lte: endOfDay(day) },
              isDeleted: false,
              dueDate: { lt: day, gte: subDays(day, 30) },
              status: { name: { notIn: ['DONE', 'CANCELLED'] } }
            }
          }).then(count => ({ date: format(day, 'MMM d'), count }));
        })
      );

      // AI recommendations
      const aiRecommendations = await prisma.aIRecommendation.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 6,
      });

      // Department Workloads
      const { getAllWorkloads } = await import('../services/workload');
      const allWorkloads = await getAllWorkloads();

      return res.json({
        type: 'SUPER_ADMIN',
        stats: {
          totalUsers, activeUsers, activeProjects, atRiskProjects, openTasks,
          completedToday, overdueTasks, blockedTasks, reviewTasks, criticalTasks,
          openTickets, slaBreaches, criticalTickets,
        },
        charts: {
          tasksByStatus: tasksByStatus.map(s => ({ name: s.name, count: s._count.tasks, color: s.color })),
          tasksByPriority: tasksByPriority.map(p => ({ name: p.name, count: p._count.tasks, color: p.color })),
          tasksByDepartment: tasksByDept.map(d => ({
            name: d.name,
            code: d.code,
            count: d._count.tasks,
            ticketCount: d._count.tickets,
            color: d.color
          })),
          completionTrend,
          overdueTrend,
        },
        workloads: allWorkloads.slice(0, 10),
        aiRecommendations,
      });
    }

    if (isAdmin) {
      // ── ADMIN DASHBOARD ─────────────────────────────────────────────────
      const [
        myTasks, overdueTasks, dueTodayTasks, reviewTasks, blockedTasks,
        unassignedTasks, openTickets, slaBreaches, atRiskProjects
      ] = await Promise.all([
        prisma.task.count({ where: { assigneeId: user.id, isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { isDeleted: false, dueDate: { lt: now }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { isDeleted: false, dueDate: { gte: todayStart, lte: todayEnd }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.task.count({ where: { isDeleted: false, status: { name: 'IN_REVIEW' } } }),
        prisma.task.count({ where: { isDeleted: false, status: { name: 'BLOCKED' } } }),
        prisma.task.count({ where: { assigneeId: null, isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
        prisma.ticket.count({ where: { departmentId: user.departmentId || undefined, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
        prisma.ticket.count({
          where: {
            departmentId: user.departmentId || undefined,
            OR: [
              { slaBreached: true },
              { slaTarget: { lt: now }, status: { notIn: ['RESOLVED', 'CLOSED'] } }
            ]
          }
        }),
        prisma.project.count({ where: { health: { in: ['AT_RISK', 'CRITICAL'] }, isArchived: false } }),
      ]);

      const aiRecommendations = await prisma.aIRecommendation.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { task: { select: { taskId: true, title: true } } }
      });

      // Team workload
      const { getDepartmentWorkload, getAllWorkloads } = await import('../services/workload');
      const workloads = user.departmentId
        ? await getDepartmentWorkload(user.departmentId)
        : await getAllWorkloads();

      return res.json({
        type: 'ADMIN',
        stats: {
          myTasks, overdueTasks, dueTodayTasks, reviewTasks, blockedTasks,
          unassignedTasks, openTickets, slaBreaches, atRiskProjects
        },
        workloads: workloads.slice(0, 10),
        aiRecommendations,
      });
    }

    // ── EMPLOYEE DASHBOARD ───────────────────────────────────────────────
    const [
      myTasks, overdueTasks, dueTodayTasks, dueThisWeek, blockedTasks, recentlyDone, myTickets
    ] = await Promise.all([
      prisma.task.findMany({
        where: { assigneeId: user.id, isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } },
        include: { status: true, priority: true, project: { select: { name: true } } },
        orderBy: [{ priority: { level: 'desc' } }, { dueDate: 'asc' }],
        take: 10,
      }),
      prisma.task.count({ where: { assigneeId: user.id, isDeleted: false, dueDate: { lt: now }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { assigneeId: user.id, isDeleted: false, dueDate: { gte: todayStart, lte: todayEnd }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { assigneeId: user.id, isDeleted: false, dueDate: { gte: todayStart, lte: subDays(now, -7) }, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { assigneeId: user.id, isDeleted: false, status: { name: 'BLOCKED' } } }),
      prisma.task.findMany({
        where: { assigneeId: user.id, isDeleted: false, status: { name: 'DONE' } },
        orderBy: { completedAt: 'desc' },
        take: 5,
        include: { project: { select: { name: true } } }
      }),
      prisma.ticket.findMany({
        where: {
          OR: [{ assigneeId: user.id }, { reporterId: user.id }],
          status: { notIn: ['RESOLVED', 'CLOSED'] }
        },
        include: { customer: { select: { name: true } }, department: { select: { code: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    // Generate AI daily plan for the employee
    const { generateDailyPlan } = await import('../services/ai');
    const dailyPlan = await generateDailyPlan(user.id);

    return res.json({
      type: 'EMPLOYEE',
      stats: {
        activeTasks: myTasks.length,
        overdue: overdueTasks,
        dueToday: dueTodayTasks,
        dueThisWeek,
        blocked: blockedTasks,
        myTickets: myTickets.length,
      },
      tasks: myTasks,
      recentlyDone,
      tickets: myTickets,
      dailyPlan,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
