import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createAuditLog, AuditActions } from '../services/audit';
import { createNotification } from '../services/notifications';
import { addHours, addDays } from 'date-fns';
import { broadcast, WSEventTypes } from '../services/websocket';

const router = Router();
router.use(authenticate);

// Generate human-readable ticket ID (e.g. TKT-2026-0001)
async function generateTicketId(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `TKT-${currentYear}-`;
  const count = await prisma.ticket.count({
    where: { ticketId: { startsWith: prefix } }
  });
  const padded = String(count + 1).padStart(4, '0');
  return `${prefix}${padded}`;
}

// SLA Hours calculation helper
function getSlaHours(priority: string): number {
  switch (priority?.toUpperCase()) {
    case 'CRITICAL': return 1;
    case 'HIGH': return 4;
    case 'MEDIUM': return 24;
    case 'LOW':
    default: return 72;
  }
}

// Strict Ticket Lifecycle State Machine
export const VALID_TICKET_TRANSITIONS: Record<string, string[]> = {
  NEW: ['TRIAGED', 'ASSIGNED', 'CLOSED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'WAITING', 'BLOCKED', 'CLOSED'],
  IN_PROGRESS: ['WAITING', 'BLOCKED', 'RESOLVED'],
  WAITING: ['IN_PROGRESS', 'RESOLVED', 'CLOSED'],
  BLOCKED: ['IN_PROGRESS', 'WAITING', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['ASSIGNED', 'IN_PROGRESS'],
};

// ─── GET /api/tickets ────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const {
      departmentId, customerId, projectId, status, priority,
      reporterId, assigneeId, search
    } = req.query;

    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    const where: any = {};

    // RBAC: Employees can see tickets in their department, reported by them, or assigned to them
    if (!isSuperAdmin && !isAdmin) {
      where.OR = [
        { departmentId: user.departmentId || undefined },
        { reporterId: user.id },
        { assigneeId: user.id },
      ];
    }

    if (departmentId) where.departmentId = departmentId as string;
    if (customerId) where.customerId = customerId as string;
    if (projectId) where.projectId = projectId as string;
    if (status) where.status = status as string;
    if (priority) where.priority = priority as string;
    if (reporterId) where.reporterId = reporterId as string;
    if (assigneeId) where.assigneeId = assigneeId as string;

    if (search) {
      where.OR = [
        { title: { contains: search as string } },
        { ticketId: { contains: search as string } },
        { description: { contains: search as string } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true, color: true } },
        customer: { select: { id: true, name: true, code: true, tier: true } },
        project: { select: { id: true, name: true } },
        reporter: { select: { id: true, name: true, email: true, avatar: true } },
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        linkedTasks: {
          select: { id: true, taskId: true, title: true, status: { select: { name: true } } }
        },
        _count: {
          select: { comments: true, attachments: true }
        }
      },
      orderBy: [
        { createdAt: 'desc' }
      ]
    });

    // Check SLA status on the fly
    const now = new Date();
    const enrichedTickets = tickets.map(t => {
      let isBreached = t.slaBreached;
      if (!isBreached && t.slaTarget && !['RESOLVED', 'CLOSED'].includes(t.status)) {
        isBreached = now > t.slaTarget;
      }
      return {
        ...t,
        slaBreached: isBreached,
      };
    });

    res.json(enrichedTickets);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tickets/duplicates — check for similar existing tickets ────────
router.get('/duplicates/search', async (req, res, next) => {
  try {
    const { title, customerId, category } = req.query;
    if (!title || typeof title !== 'string' || title.length < 3) {
      return res.json([]);
    }

    // Search existing active tickets with overlapping words or same customer
    const words = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return res.json([]);

    const whereClause: any = {
      status: { notIn: ['CLOSED', 'RESOLVED'] },
    };
    if (customerId && typeof customerId === 'string') {
      // Prioritize same customer if specified
      whereClause.customerId = customerId;
    }

    const existingTickets = await prisma.ticket.findMany({
      where: whereClause,
      select: {
        id: true,
        ticketId: true,
        title: true,
        status: true,
        priority: true,
        category: true,
        customerId: true,
        assignee: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      take: 20,
    });

    const duplicates = existingTickets.map(ticket => {
      const ticketLower = ticket.title.toLowerCase();
      let matchCount = 0;
      for (const word of words) {
        if (ticketLower.includes(word)) matchCount++;
      }
      let similarity = Math.min(100, Math.round((matchCount / words.length) * 100));
      if (category && ticket.category === category) {
        similarity = Math.min(100, similarity + 10);
      }
      return { ...ticket, similarity };
    }).filter(t => t.similarity >= 30)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    res.json(duplicates);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/tickets/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        department: true,
        customer: true,
        project: true,
        reporter: { select: { id: true, name: true, email: true, avatar: true } },
        assignee: { select: { id: true, name: true, email: true, avatar: true } },
        linkedTasks: {
          include: {
            status: { select: { name: true, color: true } },
            priority: { select: { name: true, color: true } },
            assignee: { select: { id: true, name: true, avatar: true } },
          }
        },
        comments: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' }
        },
        attachments: { orderBy: { createdAt: 'desc' } },
        history: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!ticket) throw new AppError('Ticket not found', 404);

    const now = new Date();
    const isBreached = ticket.slaBreached || (ticket.slaTarget ? now > ticket.slaTarget && !['RESOLVED', 'CLOSED'].includes(ticket.status) : false);

    res.json({
      ...ticket,
      slaBreached: isBreached,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets — Raise Ticket ───────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const {
      title, description, category, subcategory, departmentId,
      customerId, projectId, priority = 'MEDIUM', severity = 'MEDIUM',
      assigneeId, attachments
    } = req.body;

    if (!title) throw new AppError('Ticket title is required', 400);

    const ticketId = await generateTicketId();
    const slaHours = getSlaHours(priority);
    const slaTarget = addHours(new Date(), slaHours);

    // AI Triage suggestions
    let aiSummary = null;
    if (description) {
      aiSummary = `Categorized as ${category || 'Customer Issue'} with ${priority} priority. SLA resolution window: ${slaHours} hours.`;
    }

    // Only Admins can set assignee upon creation; employee-raised tickets start as NEW/TRIAGED
    const isAdminOrSuper = ['SUPER_ADMIN', 'ADMIN'].includes(user.roleName);
    const assignedUser = isAdminOrSuper && assigneeId ? assigneeId : null;
    const initialStatus = assignedUser ? 'ASSIGNED' : 'NEW';

    const ticket = await prisma.ticket.create({
      data: {
        ticketId,
        title,
        description: description || title,
        category: category || 'Customer Issue',
        subcategory,
        departmentId: departmentId || user.departmentId,
        customerId,
        projectId,
        priority,
        severity,
        status: initialStatus,
        reporterId: user.id,
        assigneeId: assignedUser,
        slaHours,
        slaTarget,
        aiSummary,
        ...(attachments && Array.isArray(attachments) && attachments.length > 0 ? {
          attachments: {
            create: attachments.map((att: any) => ({
              name: att.name || 'screenshot.png',
              originalName: att.originalName || att.name || 'screenshot.png',
              mimeType: att.mimeType || 'image/png',
              size: att.size || 0,
              url: att.url,
              uploadedById: user.id,
            }))
          }
        } : {}),
      },
      include: {
        department: true,
        customer: true,
        reporter: { select: { id: true, name: true, email: true } },
        assignee: { select: { id: true, name: true, email: true } },
        attachments: true,
      }
    });

    // Create history
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: 'CREATED',
        newValue: JSON.stringify({ ticketId, title, priority, status: initialStatus })
      }
    });

    // Create audit log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'TICKET_CREATED',
      entity: 'Ticket',
      entityId: ticket.id,
      newValue: { ticketId, title, priority },
      req,
    });

    // Notify assigned user if allocated
    if (assignedUser) {
      await createNotification({
        userId: assignedUser,
        type: 'TICKET_ASSIGNED',
        title: `Assigned to Ticket ${ticketId}`,
        message: `You were assigned ticket: "${title}"`,
        actionUrl: `/tickets/${ticket.id}`
      });
    }

    broadcast({ type: WSEventTypes.TICKET_CREATED, payload: ticket });
    if (assignedUser) {
      broadcast({ type: WSEventTypes.TICKET_ASSIGNED, payload: { id: ticket.id, ticketId: ticket.ticketId, assigneeId: assignedUser } });
    }

    res.status(201).json(ticket);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/tickets/:id — Update Status / Assignee ───────────────────────
router.patch('/:id', async (req, res, next) => {
  try {
    const user = req.user!;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    const existing = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Ticket not found', 404);

    const { status, assigneeId, priority, severity } = req.body;
    const updateData: any = {};

    if (assigneeId !== undefined) {
      if (!isSuperAdmin && !isAdmin) {
        throw new AppError('Only Admins and Super Admins can assign tickets', 403);
      }
      updateData.assigneeId = assigneeId;
      if (assigneeId && existing.status === 'NEW') {
        updateData.status = 'ASSIGNED';
      }
    }

    if (priority) {
      updateData.priority = priority;
      updateData.slaHours = getSlaHours(priority);
      updateData.slaTarget = addHours(existing.createdAt, updateData.slaHours);
    }

    if (severity) updateData.severity = severity;

    if (status && status !== existing.status) {
      // RBAC rules:
      // Only Admin or Super Admin can mark CLOSED, TRIAGED, or REOPENED
      if (['CLOSED', 'TRIAGED', 'REOPENED'].includes(status) && !isAdmin && !isSuperAdmin) {
        throw new AppError(`Only Admins or Super Admins can transition tickets to ${status}`, 403);
      }

      // Normal employee can only update ticket status if they are the assignee or reporter
      if (!isAdmin && !isSuperAdmin && existing.assigneeId !== user.id && existing.reporterId !== user.id) {
        throw new AppError('You are not authorized to update this ticket', 403);
      }

      // Validate transition state machine
      const allowed = VALID_TICKET_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        throw new AppError(`Invalid ticket transition from ${existing.status} to ${status}. Allowed: ${allowed.join(', ')}`, 400);
      }

      updateData.status = status;
      if (status === 'RESOLVED' && !existing.resolvedAt) {
        updateData.resolvedAt = new Date();
      }
      if (status === 'CLOSED' && !existing.closedAt) {
        updateData.closedAt = new Date();
      }
    }

    const updated = await prisma.ticket.update({
      where: { id: req.params.id },
      data: updateData,
      include: {
        department: true,
        customer: true,
        assignee: { select: { id: true, name: true, email: true } },
        reporter: { select: { id: true, name: true, email: true } },
      }
    });

    // History & Audit
    await prisma.ticketHistory.create({
      data: {
        ticketId: updated.id,
        userId: user.id,
        action: 'UPDATED',
        oldValue: JSON.stringify({ status: existing.status, assigneeId: existing.assigneeId }),
        newValue: JSON.stringify({ status: updated.status, assigneeId: updated.assigneeId })
      }
    });

    if (assigneeId && assigneeId !== existing.assigneeId) {
      await createNotification({
        userId: assigneeId,
        type: 'TICKET_ASSIGNED',
        title: `Ticket ${updated.ticketId} Assigned`,
        message: `Admin assigned ticket "${updated.title}" to you.`,
        actionUrl: `/tickets/${updated.id}`
      });
    }

    broadcast({ type: WSEventTypes.TICKET_UPDATED, payload: updated });
    if (status && status !== existing.status) {
      broadcast({ type: WSEventTypes.TICKET_STATUS_CHANGED, payload: { id: updated.id, ticketId: updated.ticketId, oldStatus: existing.status, newStatus: updated.status } });
    }
    if (assigneeId && assigneeId !== existing.assigneeId) {
      broadcast({ type: WSEventTypes.TICKET_ASSIGNED, payload: { id: updated.id, ticketId: updated.ticketId, assigneeId: updated.assigneeId } });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:id/convert-to-task (Ticket -> Task Conversion) ───────
router.post('/:id/convert-to-task', requireAdminOrAbove, async (req, res, next) => {
  try {
    const user = req.user!;
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: { department: true, customer: true }
    });

    if (!ticket) throw new AppError('Ticket not found', 404);

    const {
      projectId, milestoneId, assigneeId, priorityId, estimatedHours = 8
    } = req.body;

    // Generate Task ID matching department code (e.g. FDE-1025)
    const deptCode = ticket.department?.code || 'GEN';
    const taskCount = await prisma.task.count({
      where: { taskId: { startsWith: `${deptCode}-` } }
    });
    const taskId = `${deptCode}-${1001 + taskCount}`;

    // Get default TODO status
    const todoStatus = await prisma.taskStatus.findFirst({
      where: { name: 'TODO' }
    });

    // Create the task linked to this ticket and customer
    const task = await prisma.task.create({
      data: {
        taskId,
        title: ticket.title,
        description: `### Originating Ticket: ${ticket.ticketId}\n${ticket.description}`,
        departmentId: ticket.departmentId,
        customerId: ticket.customerId,
        projectId: projectId || ticket.projectId,
        milestoneId,
        statusId: todoStatus?.id,
        priorityId,
        assigneeId: assigneeId || ticket.assigneeId,
        reporterId: user.id,
        ticketId: ticket.id,
        estimatedHours: parseFloat(estimatedHours),
        dueDate: addDays(new Date(), 7),
      },
      include: {
        status: true,
        priority: true,
        assignee: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
      }
    });

    // Update ticket status to IN_PROGRESS or TRIAGED
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'IN_PROGRESS',
        projectId: projectId || ticket.projectId,
      }
    });

    // Record ticket history
    await prisma.ticketHistory.create({
      data: {
        ticketId: ticket.id,
        userId: user.id,
        action: 'CONVERTED_TO_TASK',
        metadata: JSON.stringify({ taskId: task.taskId, taskIdDb: task.id })
      }
    });

    // Audit log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'TICKET_CONVERTED_TO_TASK',
      entity: 'Ticket',
      entityId: ticket.id,
      newValue: { ticketId: ticket.ticketId, spawnedTaskId: task.taskId },
      req,
    });

    // Notify assigned developer
    if (task.assigneeId) {
      await createNotification({
        userId: task.assigneeId,
        taskId: task.id,
        type: 'TASK_ASSIGNED',
        title: `New Task ${task.taskId} from Ticket`,
        message: `Task "${task.title}" spawned from ticket ${ticket.ticketId} has been assigned to you.`,
        actionUrl: `/tasks/${task.id}`
      });
    }

    broadcast({ type: WSEventTypes.TICKET_CONVERTED, payload: { ticketId: ticket.id, task } });
    broadcast({ type: WSEventTypes.TICKET_UPDATED, payload: { id: ticket.id, status: 'IN_PROGRESS' } });
    broadcast({ type: WSEventTypes.TASK_CREATED, payload: { id: task.id, taskId: task.taskId, title: task.title } });
    if (task.assigneeId) {
      broadcast({ type: WSEventTypes.WORKLOAD_UPDATED, payload: { assigneeId: task.assigneeId } });
    }

    res.status(201).json({
      message: 'Ticket converted to task successfully',
      ticketId: ticket.ticketId,
      task,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/tickets/:id/comments ─────────────────────────────────────────
router.post('/:id/comments', async (req, res, next) => {
  try {
    const user = req.user!;
    const { content, isInternal = false } = req.body;
    if (!content) throw new AppError('Content is required', 400);

    const comment = await prisma.ticketComment.create({
      data: {
        ticketId: req.params.id,
        userId: user.id,
        content,
        isInternal: user.roleName === 'EMPLOYEE' ? false : isInternal,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } }
      }
    });

    broadcast({ type: WSEventTypes.TICKET_COMMENTED, payload: { ticketId: req.params.id, comment } });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

export default router;
