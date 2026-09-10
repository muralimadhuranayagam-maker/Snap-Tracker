import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { createAuditLog } from '../services/audit';
import { createNotification } from '../services/notifications';
import { broadcastToAdmins } from '../services/websocket';

const router = Router();
router.use(authenticate);

// Ensure attendance uploads directory exists
const attendanceUploadsDir = path.join(process.cwd(), 'uploads', 'attendance');
if (!fs.existsSync(attendanceUploadsDir)) {
  fs.mkdirSync(attendanceUploadsDir, { recursive: true });
}

function getTodayString(d = new Date()): string {
  return d.toISOString().split('T')[0];
}

function getStartOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

function getEndOfDay(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

// ─── GET /api/attendance/today ────────────────────────────────────────────────
// Returns current user's attendance status today and quick live stats
router.get('/today', async (req, res, next) => {
  try {
    const user = req.user!;
    const today = getTodayString();

    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    const isCheckedIn = !!attendance && attendance.status === 'CHECKED_IN';
    const isCheckedOut = !!attendance && attendance.status === 'CHECKED_OUT';

    let currentShiftHours = 0;
    if (isCheckedIn && attendance) {
      currentShiftHours = Number(((Date.now() - new Date(attendance.checkInTime).getTime()) / (1000 * 60 * 60)).toFixed(2));
    } else if (isCheckedOut && attendance?.workHours) {
      currentShiftHours = attendance.workHours;
    }

    res.json({
      date: today,
      attendance,
      isCheckedIn,
      isCheckedOut,
      currentShiftHours,
      liveHours: currentShiftHours,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/check-in ───────────────────────────────────────────
// Morning Camera-Verified Check-In
router.post('/check-in', async (req, res, next) => {
  try {
    const user = req.user!;
    const { image, deviceInfo, notes } = req.body;
    const today = getTodayString();

    // 1. Mandatory camera check: image must be provided
    if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
      throw new AppError(
        'Camera verification snapshot is strictly required. Please allow camera access and take a snapshot to start attendance.',
        400
      );
    }

    // 2. Decode and save snapshot photo to disk
    const mimeMatch = image.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
    const ext = mimeMatch ? (mimeMatch[1] === 'jpeg' ? 'jpg' : mimeMatch[1]) : 'jpg';
    const base64Data = image.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
    const filename = `attendance_${user.id}_${today}_${Date.now()}.${ext}`;
    const filePath = path.join(attendanceUploadsDir, filename);

    fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
    const photoUrl = `/uploads/attendance/${filename}`;

    // 3. Upsert Attendance record for today
    const existing = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    let attendance;
    if (existing) {
      attendance = await prisma.attendance.update({
        where: { id: existing.id },
        data: {
          checkInTime: new Date(),
          checkInPhoto: photoUrl,
          status: 'CHECKED_IN',
          checkOutTime: null,
          deviceInfo: deviceInfo || (req.headers['user-agent'] as string) || null,
          notes: notes || null,
        },
      });
    } else {
      attendance = await prisma.attendance.create({
        data: {
          userId: user.id,
          date: today,
          checkInTime: new Date(),
          checkInPhoto: photoUrl,
          status: 'CHECKED_IN',
          deviceInfo: deviceInfo || (req.headers['user-agent'] as string) || null,
          notes: notes || null,
        },
      });
    }

    // 4. Audit Log & Notifications
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'ATTENDANCE_CHECK_IN',
      entity: 'Attendance',
      entityId: attendance.id,
      newValue: { checkInTime: attendance.checkInTime, photoUrl },
    });

    // Notify admins via WebSocket that an employee has checked in
    broadcastToAdmins({
      type: 'ATTENDANCE_STATUS_CHANGE',
      payload: {
        userId: user.id,
        userName: user.name,
        action: 'CHECKED_IN',
        photoUrl,
        time: attendance.checkInTime,
      },
    });

    res.status(201).json({
      message: 'Morning attendance verified successfully. Have a productive day!',
      attendance,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/check-out ──────────────────────────────────────────
// Evening Shift End / Logoff with Full Daily Activity Aggregation
router.post('/check-out', async (req, res, next) => {
  try {
    const user = req.user!;
    const { notes } = req.body;
    const today = getTodayString();
    const startOfDay = getStartOfDay(today);
    const endOfDay = getEndOfDay(today);

    // 1. Retrieve active attendance
    const attendance = await prisma.attendance.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: today,
        },
      },
    });

    if (!attendance) {
      throw new AppError('No morning check-in found for today. You must check in before logging off.', 400);
    }

    const checkOutTime = new Date();
    const workHours = Number(((checkOutTime.getTime() - new Date(attendance.checkInTime).getTime()) / (1000 * 60 * 60)).toFixed(2));

    // 2. Aggregate Full Day's Activities
    // (a) Worklogs logged today
    const worklogs = await prisma.taskWorklog.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      include: {
        task: {
          select: {
            id: true,
            taskId: true,
            title: true,
            status: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalWorklogHours = Number(worklogs.reduce((sum, w) => sum + (w.hours || 0), 0).toFixed(2));

    // (b) Tasks worked on or updated today
    const tasksUpdated = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        id: true,
        taskId: true,
        title: true,
        status: { select: { name: true } },
        priority: { select: { name: true } },
        updatedAt: true,
      },
    });

    const tasksCompleted = tasksUpdated.filter(t => t.status?.name === 'DONE');

    // (c) Tickets touched today
    const ticketsHandled = await prisma.ticket.findMany({
      where: {
        OR: [
          { assigneeId: user.id },
          { reporterId: user.id },
        ],
        updatedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        id: true,
        ticketId: true,
        title: true,
        status: true,
        priority: true,
      },
    });

    // (d) Comments posted today
    const [taskCommentsCount, ticketCommentsCount] = await Promise.all([
      prisma.taskComment.count({
        where: {
          userId: user.id,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.ticketComment.count({
        where: {
          userId: user.id,
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
    ]);

    // (e) Audit actions performed today
    const auditActions = await prisma.auditLog.findMany({
      where: {
        userId: user.id,
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        id: true,
        action: true,
        entity: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Compile structured Daily Activity Summary
    const activitySummary = {
      employee: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      date: today,
      checkInTime: attendance.checkInTime,
      checkInPhoto: attendance.checkInPhoto,
      checkOutTime,
      totalActiveHours: workHours,
      totalWorklogHours,
      notes: notes || attendance.notes || null,
      stats: {
        worklogsCount: worklogs.length,
        tasksUpdatedCount: tasksUpdated.length,
        tasksCompletedCount: tasksCompleted.length,
        ticketsCount: ticketsHandled.length,
        commentsCount: taskCommentsCount + ticketCommentsCount,
        auditActionsCount: auditActions.length,
      },
      worklogs: worklogs.map(w => ({
        id: w.id,
        taskId: w.task.taskId,
        taskTitle: w.task.title,
        status: w.task.status?.name,
        hours: w.hours,
        description: w.description,
        loggedAt: w.createdAt,
      })),
      tasksCompleted: tasksCompleted.map(t => ({
        id: t.id,
        taskId: t.taskId,
        title: t.title,
        priority: t.priority?.name,
      })),
      tasksUpdated: tasksUpdated.map(t => ({
        id: t.id,
        taskId: t.taskId,
        title: t.title,
        status: t.status?.name,
      })),
      tickets: ticketsHandled.map(tk => ({
        id: tk.id,
        ticketId: tk.ticketId,
        title: tk.title,
        status: tk.status,
      })),
      auditActions,
    };

    // 4. Update Attendance record
    const updated = await prisma.attendance.update({
      where: { id: attendance.id },
      data: {
        checkOutTime,
        status: 'CHECKED_OUT',
        workHours,
        notes: notes || attendance.notes || null,
        summaryJson: JSON.stringify(activitySummary),
      },
    });

    // 5. Create Audit Log
    await createAuditLog({
      userId: user.id,
      userEmail: user.email,
      action: 'ATTENDANCE_CHECK_OUT',
      entity: 'Attendance',
      entityId: updated.id,
      newValue: {
        checkOutTime,
        workHours,
        totalWorklogHours,
      },
    });

    // 6. Notify all Admins and Super Admins
    const admins = await prisma.user.findMany({
      where: {
        role: {
          name: { in: ['SUPER_ADMIN', 'ADMIN'] },
        },
      },
      select: { id: true },
    });

    for (const adm of admins) {
      await createNotification({
        userId: adm.id,
        type: 'TASK_COMPLETED' as any,
        title: `Daily Logoff: ${user.name}`,
        message: `${user.name} logged off for the day (${workHours}h active, ${activitySummary.stats.worklogsCount} worklogs). Click to view full day report.`,
        actionUrl: `/attendance?userId=${user.id}&date=${today}`,
        metadata: {
          attendanceId: updated.id,
          employeeId: user.id,
          date: today,
        },
      });
    }

    // Broadcast WebSocket event to all connected Admins
    broadcastToAdmins({
      type: 'ATTENDANCE_STATUS_CHANGE',
      payload: {
        userId: user.id,
        userName: user.name,
        action: 'LOGOFF_COMPLETED',
        time: checkOutTime,
        workHours,
        summary: activitySummary,
      },
    });

    res.json({
      message: 'Daily activity submitted and shift concluded. Great job today!',
      attendance: updated,
      summary: activitySummary,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/attendance/overview ────────────────────────────────────────────
// Admin & Super Admin: Comprehensive Attendance Roster for any date
router.get('/overview', requireAdminOrAbove, async (req, res, next) => {
  try {
    const { date, departmentId } = req.query;
    const targetDate = (date as string) || getTodayString();

    const whereUser: any = { isActive: true };
    if (departmentId) whereUser.departmentId = departmentId;

    const [users, attendances] = await Promise.all([
      prisma.user.findMany({
        where: whereUser,
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          avatar: true,
          role: { select: { name: true } },
          department: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ department: { name: 'asc' } }, { name: 'asc' }],
      }),
      prisma.attendance.findMany({
        where: { date: targetDate },
      }),
    ]);

    const attendanceMap = new Map(attendances.map(a => [a.userId, a]));

    const roster = users.map(u => {
      const att = attendanceMap.get(u.id);
      let status: 'CHECKED_IN' | 'CHECKED_OUT' | 'NOT_STARTED' = 'NOT_STARTED';
      if (att) {
        status = att.status as any;
      }

      let parsedSummary = null;
      if (att?.summaryJson) {
        try {
          parsedSummary = JSON.parse(att.summaryJson);
        } catch {}
      }

      return {
        user: u,
        status,
        attendance: att
          ? {
              id: att.id,
              date: att.date,
              checkInTime: att.checkInTime,
              checkInPhoto: att.checkInPhoto,
              checkOutTime: att.checkOutTime,
              workHours: att.workHours,
              notes: att.notes,
              summary: parsedSummary,
            }
          : null,
      };
    });

    const stats = {
      totalEmployees: users.length,
      checkedInCount: roster.filter(r => r.status === 'CHECKED_IN').length,
      checkedOutCount: roster.filter(r => r.status === 'CHECKED_OUT').length,
      notStartedCount: roster.filter(r => r.status === 'NOT_STARTED').length,
    };

    res.json({
      date: targetDate,
      stats,
      roster,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/attendance/user/:userId/daily-summary ──────────────────────────
// Inspect an employee's full day: Morning webcam photo + detailed activity
router.get('/user/:userId/daily-summary', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { date } = req.query;
    const currentUser = req.user!;
    const isOwner = currentUser.id === userId;
    const isAdmin = currentUser.roleName === 'ADMIN' || currentUser.roleName === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      throw new AppError('Forbidden: only Admins can inspect another employee’s daily report.', 403);
    }

    const targetDate = (date as string) || getTodayString();
    const startOfDay = getStartOfDay(targetDate);
    const endOfDay = getEndOfDay(targetDate);

    const [targetUser, attendance] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          title: true,
          avatar: true,
          role: { select: { name: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      }),
      prisma.attendance.findUnique({
        where: {
          userId_date: {
            userId,
            date: targetDate,
          },
        },
      }),
    ]);

    if (!targetUser) throw new AppError('User not found', 404);

    let summary = null;
    if (attendance?.summaryJson) {
      try {
        summary = JSON.parse(attendance.summaryJson);
      } catch {}
    }

    // If currently in shift or summary was not generated, fetch live activity
    if (!summary && attendance) {
      const [worklogs, tasksUpdated, audits] = await Promise.all([
        prisma.taskWorklog.findMany({
          where: { userId, createdAt: { gte: startOfDay, lte: endOfDay } },
          include: { task: { select: { id: true, taskId: true, title: true, status: { select: { name: true } } } } },
        }),
        prisma.task.findMany({
          where: { assigneeId: userId, updatedAt: { gte: startOfDay, lte: endOfDay } },
          select: { id: true, taskId: true, title: true, status: { select: { name: true } } },
        }),
        prisma.auditLog.findMany({
          where: { userId, createdAt: { gte: startOfDay, lte: endOfDay } },
          select: { id: true, action: true, entity: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const activeHours = Number(((Date.now() - new Date(attendance.checkInTime).getTime()) / (1000 * 60 * 60)).toFixed(2));
      const totalHours = Number(worklogs.reduce((sum, w) => sum + (w.hours || 0), 0).toFixed(2));

      summary = {
        employee: targetUser,
        date: targetDate,
        checkInTime: attendance.checkInTime,
        checkInPhoto: attendance.checkInPhoto,
        checkOutTime: attendance.checkOutTime,
        totalActiveHours: activeHours,
        totalWorklogHours: totalHours,
        notes: attendance.notes,
        stats: {
          worklogsCount: worklogs.length,
          tasksUpdatedCount: tasksUpdated.length,
          tasksCompletedCount: tasksUpdated.filter(t => t.status?.name === 'DONE').length,
          auditActionsCount: audits.length,
        },
        worklogs: worklogs.map(w => ({
          id: w.id,
          taskId: w.task.taskId,
          taskTitle: w.task.title,
          status: w.task.status?.name,
          hours: w.hours,
          description: w.description,
          loggedAt: w.createdAt,
        })),
        tasksUpdated,
        auditActions: audits,
      };
    }

    res.json({
      user: targetUser,
      date: targetDate,
      attendance,
      summary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
