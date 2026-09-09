import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { startOfDay, endOfDay, isPast } from 'date-fns';

const router = Router();
router.use(authenticate);

// ─── GET /api/mywork ─────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // 1. My Assigned Tasks
    const myTasks = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        isDeleted: false,
        status: { name: { notIn: ['DONE', 'CANCELLED'] } }
      },
      include: {
        status: true,
        priority: true,
        project: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, code: true } },
        ticket: { select: { id: true, ticketId: true, title: true } },
        blockedByDeps: {
          include: {
            source: {
              select: { id: true, taskId: true, title: true, status: { select: { name: true } } }
            }
          }
        },
        _count: { select: { comments: true, worklogs: true } }
      },
      orderBy: [
        { priority: { level: 'desc' } },
        { dueDate: 'asc' }
      ]
    });

    // 1b. My Completed Tasks
    const completedTasks = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        isDeleted: false,
        status: { name: 'DONE' }
      },
      include: {
        status: true,
        priority: true,
        project: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true, code: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: 20
    });

    // 2. My Assigned or Reported Tickets
    const myTickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { assigneeId: user.id },
          { reporterId: user.id }
        ],
        status: { notIn: ['RESOLVED', 'CLOSED'] }
      },
      include: {
        customer: { select: { id: true, name: true, code: true } },
        department: { select: { id: true, name: true, code: true } },
        reporter: { select: { id: true, name: true, avatar: true } },
        assignee: { select: { id: true, name: true, avatar: true } },
        linkedTasks: { select: { id: true, taskId: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 3. Pending Approvals (either requested by me or awaiting my approval)
    const myApprovals = await prisma.approval.findMany({
      where: {
        OR: [
          { requesterId: user.id },
          { approverId: user.id },
          // If admin, show all pending approvals
          ...(['ADMIN', 'SUPER_ADMIN'].includes(user.roleName) ? [{ status: 'PENDING' }] : [])
        ]
      },
      include: {
        requester: { select: { id: true, name: true, avatar: true } },
        approver: { select: { id: true, name: true, avatar: true } },
        task: { select: { id: true, taskId: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // 4. Tasks pending review (where user is assigned reviewer or admin)
    const myReviews = await prisma.task.findMany({
      where: {
        isDeleted: false,
        status: { name: 'IN_REVIEW' },
        OR: [
          { reviewerId: user.id },
          ...(['ADMIN', 'SUPER_ADMIN'].includes(user.roleName) ? [{ status: { name: 'IN_REVIEW' } }] : [])
        ]
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, name: true } },
        priority: true,
      }
    });

    // Sub-aggregations:
    // Overdue tasks
    const overdueTasks = myTasks.filter(t => t.dueDate && isPast(new Date(t.dueDate)));
    
    // Due today
    const dueTodayTasks = myTasks.filter(t => {
      if (!t.dueDate) return false;
      const d = new Date(t.dueDate);
      return d >= todayStart && d <= todayEnd;
    });

    // Blocked tasks (either status is BLOCKED or has unresolved blocking dependencies)
    const blockedTasks = myTasks.filter(t => 
      t.status?.name === 'BLOCKED' || 
      t.blockedByDeps.some(dep => dep.source.status?.name !== 'DONE')
    );

    // AI Daily Plan generation
    // Sort actionable tasks by priority level (high to low), then dueDate (earliest first)
    const actionableTasks = myTasks
      .filter(t => t.status?.name !== 'BLOCKED')
      .sort((a, b) => {
        const pA = a.priority?.level || 0;
        const pB = b.priority?.level || 0;
        if (pA !== pB) return pB - pA;
        if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        return 0;
      });

    const aiDailyPlan = actionableTasks.slice(0, 5).map((task, idx) => ({
      order: idx + 1,
      taskId: task.taskId,
      title: task.title,
      priority: task.priority?.name || 'MEDIUM',
      estimatedHours: task.estimatedHours || 2,
      reason: idx === 0 && overdueTasks.some(o => o.id === task.id)
        ? 'Overdue priority item requiring immediate resolution.'
        : task.priority?.level && task.priority.level >= 3
        ? 'High impact deliverable for active customer milestone.'
        : 'Scheduled work item aligned with weekly capacity.',
    }));

    res.json({
      metrics: {
        activeTasks: myTasks.length,
        tickets: myTickets.length,
        reviews: myReviews.length,
        approvals: myApprovals.filter(a => a.status === 'PENDING').length,
        blocked: blockedTasks.length,
        overdue: overdueTasks.length,
        dueToday: dueTodayTasks.length,
        completed: completedTasks.length,
      },
      tasks: myTasks,
      completedTasks,
      tickets: myTickets,
      approvals: myApprovals,
      reviews: myReviews,
      aiDailyPlan,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
