import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// ─── GET /api/leaves/types ─────────────────────────────────────────────────
router.get('/types', async (_req, res, next) => {
  try {
    const types = await prisma.leaveType.findMany({ orderBy: { label: 'asc' } });
    res.json(types);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaves/approvers — Super Admins available as approvers ────────
router.get('/approvers', async (_req, res, next) => {
  try {
    const superAdmins = await prisma.user.findMany({
      where: { role: { name: 'SUPER_ADMIN' }, isActive: true },
      select: { id: true, name: true, email: true, avatar: true },
      orderBy: { name: 'asc' },
    });
    res.json(superAdmins);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaves/attendance-summary ─────────────────────────────────────
// Returns monthly attendance working days for the logged-in user
router.get('/attendance-summary', async (req, res, next) => {
  try {
    const userId = req.user!.id;

    // Get attendance records for the past 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    twelveMonthsAgo.setHours(0, 0, 0, 0);

    const records = await prisma.attendanceRecord.findMany({
      where: {
        userId,
        date: { gte: twelveMonthsAgo.toISOString().split('T')[0] },
      },
      orderBy: { date: 'asc' },
    });

    // Get approved leaves for the user to deduct
    const approvedLeaves = await prisma.leave.findMany({
      where: { userId, status: 'APPROVED' },
      select: { startDate: true, endDate: true, totalDays: true },
    });

    // Group records by month
    const monthMap: Record<string, { month: string; workingDays: number; leaveDays: number }> = {};

    for (const r of records) {
      const date = new Date(r.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      if (!monthMap[key]) {
        monthMap[key] = { month: label, workingDays: 0, leaveDays: 0 };
      }
      monthMap[key].workingDays += 1;
    }

    // Add leave days to each month
    for (const leave of approvedLeaves) {
      const start = new Date(leave.startDate);
      const end = new Date(leave.endDate);
      const cur = new Date(start);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
        if (monthMap[key]) {
          monthMap[key].leaveDays += 1;
        }
        cur.setDate(cur.getDate() + 1);
      }
    }

    const summary = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => ({
        key,
        month: val.month,
        presentDays: val.workingDays,
        leaveDays: val.leaveDays,
        netWorkingDays: val.workingDays - val.leaveDays,
      }));

    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaves/my ─────────────────────────────────────────────────────
router.get('/my', async (req, res, next) => {
  try {
    const leaves = await prisma.leave.findMany({
      where: { userId: req.user!.id },
      include: {
        leaveType: { select: { label: true, name: true } },
        approver: { select: { name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(leaves);
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/leaves — Submit a leave request ───────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const { leaveTypeId, startDate, endDate, reason, approverId } = req.body;

    if (!leaveTypeId || !startDate || !endDate || !reason || !approverId) {
      throw new AppError('All fields are required', 400);
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) throw new AppError('End date must be after start date', 400);

    // Calculate total calendar days (inclusive)
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Verify approver is a SUPER_ADMIN
    const approver = await prisma.user.findFirst({
      where: { id: approverId, role: { name: 'SUPER_ADMIN' } },
    });
    if (!approver) throw new AppError('Invalid approver selected', 400);

    const leave = await prisma.leave.create({
      data: {
        userId: req.user!.id,
        leaveTypeId,
        startDate: start,
        endDate: end,
        totalDays,
        reason: reason.trim(),
        approverId,
        status: 'PENDING',
      },
      include: {
        leaveType: { select: { label: true } },
        approver: { select: { name: true } },
      },
    });

    res.status(201).json(leave);
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/leaves/admin/all — Super Admin: all leave requests ─────────────
router.get('/admin/all', async (req, res, next) => {
  try {
    if (req.user!.roleName !== 'SUPER_ADMIN') {
      throw new AppError('Access denied', 403);
    }

    const { status } = req.query;
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;

    const leaves = await prisma.leave.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true, department: { select: { name: true, code: true } } } },
        leaveType: { select: { label: true, name: true } },
        approver: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });

    res.json(leaves);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/leaves/:id/approve ──────────────────────────────────────────
router.patch('/:id/approve', async (req, res, next) => {
  try {
    if (req.user!.roleName !== 'SUPER_ADMIN') throw new AppError('Access denied', 403);

    const leave = await prisma.leave.findUnique({ where: { id: req.params.id } });
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.status !== 'PENDING') throw new AppError('Leave is already processed', 400);

    const updated = await prisma.leave.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        approverNote: req.body.note?.trim() || null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/leaves/:id/reject ───────────────────────────────────────────
router.patch('/:id/reject', async (req, res, next) => {
  try {
    if (req.user!.roleName !== 'SUPER_ADMIN') throw new AppError('Access denied', 403);

    const leave = await prisma.leave.findUnique({ where: { id: req.params.id } });
    if (!leave) throw new AppError('Leave request not found', 404);
    if (leave.status !== 'PENDING') throw new AppError('Leave is already processed', 400);

    const updated = await prisma.leave.update({
      where: { id: req.params.id },
      data: {
        status: 'REJECTED',
        approverNote: req.body.note?.trim() || null,
      },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
