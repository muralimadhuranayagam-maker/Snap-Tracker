import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { broadcast, WSEventTypes, broadcastToUser } from '../services/websocket';

const router = Router();
router.use(authenticate);

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── GET /api/attendance/today ──────────────────────────────────────────────
// Returns full attendance state for the authenticated employee today
router.get('/today', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: {
          orderBy: { startedAt: 'asc' },
        },
      },
    });

    if (!record) {
      return res.json({
        hasRecord: false,
        currentState: 'OFF_DUTY',
        date: todayStr,
        record: null,
        activeInterval: null,
        computed: {
          verifiedWorkingSeconds: 0,
          breakSeconds: 0,
          lunchSeconds: 0,
          faceMissingSeconds: 0,
          totalAttendanceSeconds: 0,
        },
      });
    }

    // Compute live elapsed times from authoritative timestamps
    let verifiedWorkingSeconds = record.verifiedWorkingSeconds;
    let breakSeconds = record.breakSeconds;
    let lunchSeconds = record.lunchSeconds;
    let meetingSeconds = record.meetingSeconds || 0;
    let faceMissingSeconds = record.faceMissingSeconds;
    let totalAttendanceSeconds = record.totalAttendanceSeconds;

    const activeInterval = record.intervals.find((i) => i.status === 'ACTIVE') || null;

    const isOfficeMode = record.workMode === 'OFFICE';
    if (record.currentState === 'WORKING') {
      if (isOfficeMode && record.lastWorkResumedAt) {
        const elapsedSinceResumed = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastWorkResumedAt).getTime()) / 1000)
        );
        verifiedWorkingSeconds += elapsedSinceResumed;
      } else if (!isOfficeMode && record.lastFaceDetectedAt) {
        const elapsedSinceDetection = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
        );
        verifiedWorkingSeconds += elapsedSinceDetection;
      }
    } else if (record.currentState === 'FACE_NOT_DETECTED' && record.lastFaceLostAt) {
      const elapsedSinceLost = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
      );
      faceMissingSeconds += elapsedSinceLost;
    } else if (record.currentState === 'ON_BREAK' && activeInterval) {
      const elapsedBreak = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000)
      );
      breakSeconds += elapsedBreak;
    } else if (record.currentState === 'ON_LUNCH' && activeInterval) {
      const elapsedLunch = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000)
      );
      lunchSeconds += elapsedLunch;
    } else if (record.currentState === 'IN_MEETING' && activeInterval) {
      const elapsedMeeting = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000)
      );
      meetingSeconds += elapsedMeeting;
      verifiedWorkingSeconds += elapsedMeeting; // Meeting counts toward official working hours
    }

    if (record.clockIn && !record.clockOut) {
      totalAttendanceSeconds = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.clockIn).getTime()) / 1000)
      );
    }

    const liveRecord = {
      ...record,
      verifiedWorkingSeconds,
      breakSeconds,
      lunchSeconds,
      meetingSeconds,
      faceMissingSeconds,
      totalAttendanceSeconds,
    };

    res.json({
      hasRecord: true,
      currentState: record.currentState,
      date: todayStr,
      record: liveRecord,
      activeInterval,
      computed: {
        verifiedWorkingSeconds,
        breakSeconds,
        lunchSeconds,
        meetingSeconds,
        faceMissingSeconds,
        totalAttendanceSeconds,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/mark ──────────────────────────────────────────────
// Employee marks their daily attendance. Accepts optional workMode ("WFH" | "OFFICE")
router.post('/mark', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();
    const workMode: string = (req.body?.workMode === 'OFFICE') ? 'OFFICE' : 'WFH';

    let record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
    });

    if (record) {
      return res.json({
        message: 'Attendance already marked for today',
        record,
      });
    }

    record = await prisma.attendanceRecord.create({
      data: {
        userId,
        date: todayStr,
        status: 'PRESENT',
        currentState: 'ATTENDANCE_MARKED',
        attendanceMarkedAt: now,
        workMode,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            department: { select: { code: true, name: true } },
          },
        },
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'ATTENDANCE_MARKED',
        timestamp: now,
        metadata: JSON.stringify({ markedAt: now.toISOString(), workMode }),
      },
    });

    broadcast({
      type: 'ATTENDANCE_MARKED',
      payload: { record },
    });

    res.status(201).json({
      message: 'Attendance marked successfully',
      record,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/set-work-mode ──────────────────────────────────────
// Super Admin only: Change workMode for an employee's today record
router.post('/set-work-mode', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { targetUserId, workMode } = req.body;
    if (!targetUserId || !workMode || !['OFFICE', 'WFH'].includes(workMode)) {
      throw new AppError('targetUserId and workMode (OFFICE|WFH) are required', 400);
    }
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: targetUserId, date: todayStr } },
    });

    if (!record) {
      throw new AppError('No attendance record found for that employee today', 404);
    }

    if (record.isCompleted) {
      throw new AppError('Cannot change work mode after workday is completed', 400);
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { workMode },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId: targetUserId,
        date: todayStr,
        type: 'WORK_MODE_CHANGED',
        timestamp: now,
        metadata: JSON.stringify({ by: req.user!.id, workMode }),
      },
    });

    broadcast({
      type: 'ATTENDANCE_STATE_CHANGED',
      payload: { record: updated },
    });

    res.json({ message: `Work mode changed to ${workMode}`, record: updated });
  } catch (err) {
    next(err);
  }
});


// ─── POST /api/attendance/start-work ────────────────────────────────────────
// Employee starts working session (requires camera consent from client)
router.post('/start-work', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    let record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: { intervals: true },
    });

    if (!record) {
      // Auto-mark attendance if not marked yet
      record = await prisma.attendanceRecord.create({
        data: {
          userId,
          date: todayStr,
          status: 'PRESENT',
          currentState: 'ATTENDANCE_MARKED',
          attendanceMarkedAt: now,
        },
        include: { intervals: true },
      });
      await prisma.attendanceEvent.create({
        data: {
          userId,
          date: todayStr,
          type: 'ATTENDANCE_MARKED',
          timestamp: now,
        },
      });
    }

    if (record.isCompleted || record.currentState === 'WORKDAY_COMPLETED') {
      throw new AppError('Workday has already been completed for today.', 400);
    }

    if (record.currentState === 'WORKING') {
      return res.json({
        message: 'Already in working state',
        record,
      });
    }

    // Close any previous open intervals if present
    await prisma.attendanceInterval.updateMany({
      where: {
        attendanceRecordId: record.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CLOSED',
        endedAt: now,
      },
    });

    // Create new WORK interval
    const newInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'WORK',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    // Update attendance record
    // For OFFICE mode: no face presence tracking, use lastWorkResumedAt for timer
    // For WFH mode: use lastFaceDetectedAt for face-presence timer
    const isOfficeMode = record.workMode === 'OFFICE';
    const updatedRecord = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'WORKING',
        clockIn: record.clockIn || now,
        workStartedAt: record.workStartedAt || now,
        lastFaceDetectedAt: isOfficeMode ? null : now,
        lastFaceLostAt: null,
        lastWorkResumedAt: isOfficeMode ? now : null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            department: { select: { code: true, name: true } },
          },
        },
        intervals: true,
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'WORK_STARTED',
        timestamp: now,
      },
    });

    broadcast({
      type: WSEventTypes.ATTENDANCE_CLOCKED_IN,
      payload: { record: updatedRecord, activeInterval: newInterval },
    });

    res.json({
      message: 'Work session started successfully',
      record: updatedRecord,
      activeInterval: newInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/face-status ───────────────────────────────────────
// Browser-side face presence heartbeat & transition handler
router.post('/face-status', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const { isFaceDetected, confidence = 0, timeDiffSeconds } = req.body;
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!record || record.isCompleted) {
      return res.json({ status: 'ignored', reason: 'No active session or completed' });
    }

    // Only process face detection if employee is in a working flow (WORKING or FACE_NOT_DETECTED)
    if (record.currentState !== 'WORKING' && record.currentState !== 'FACE_NOT_DETECTED') {
      return res.json({
        status: 'ignored',
        currentState: record.currentState,
        reason: 'Not in work state (e.g. on break/lunch/off duty)',
      });
    }

    const activeInterval = record.intervals[0] || null;

    if (isFaceDetected) {
      if (record.currentState === 'FACE_NOT_DETECTED') {
        // Transition: FACE WAS LOST -> FACE DETECTED
        // Calculate missing seconds since lastFaceLostAt
        let missingDelta = 0;
        if (record.lastFaceLostAt) {
          missingDelta = Math.max(
            0,
            Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
          );
        }

        const newFaceMissingSeconds = record.faceMissingSeconds + missingDelta;

        const updated = await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: {
            currentState: 'WORKING',
            lastFaceDetectedAt: now,
            lastFaceLostAt: null,
            faceMissingSeconds: newFaceMissingSeconds,
          },
        });

        if (activeInterval) {
          await prisma.attendanceInterval.update({
            where: { id: activeInterval.id },
            data: {
              faceMissingSeconds: activeInterval.faceMissingSeconds + missingDelta,
            },
          });
        }

        await prisma.attendanceEvent.create({
          data: {
            userId,
            date: todayStr,
            type: 'FACE_DETECTED',
            timestamp: now,
            metadata: JSON.stringify({ confidence, recoveredAfterMissingSec: missingDelta }),
          },
        });

        return res.json({
          status: 'ok',
          currentState: 'WORKING',
          verifiedWorkingSeconds: updated.verifiedWorkingSeconds,
          faceMissingSeconds: updated.faceMissingSeconds,
        });
      } else {
        // Continuous face detection in WORKING state (authoritative incremental sync)
        let workDelta = 0;
        if (record.lastFaceDetectedAt) {
          workDelta = Math.max(
            0,
            Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
          );
        } else if (typeof timeDiffSeconds === 'number' && timeDiffSeconds > 0) {
          workDelta = Math.min(30, Math.floor(timeDiffSeconds));
        }

        const newVerifiedSeconds = record.verifiedWorkingSeconds + workDelta;

        const updated = await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: {
            verifiedWorkingSeconds: newVerifiedSeconds,
            lastFaceDetectedAt: now,
          },
        });

        if (activeInterval && workDelta > 0) {
          await prisma.attendanceInterval.update({
            where: { id: activeInterval.id },
            data: {
              faceVerifiedSeconds: activeInterval.faceVerifiedSeconds + workDelta,
              durationSeconds: activeInterval.durationSeconds + workDelta,
            },
          });
        }

        return res.json({
          status: 'ok',
          currentState: 'WORKING',
          verifiedWorkingSeconds: updated.verifiedWorkingSeconds,
          faceMissingSeconds: updated.faceMissingSeconds,
        });
      }
    } else {
      // Face is NOT detected
      if (record.currentState === 'WORKING') {
        // Transition: WORKING -> FACE_NOT_DETECTED (grace period expired on frontend)
        let workDelta = 0;
        if (record.lastFaceDetectedAt) {
          workDelta = Math.max(
            0,
            Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
          );
        }

        const newVerifiedSeconds = record.verifiedWorkingSeconds + workDelta;

        const updated = await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: {
            currentState: 'FACE_NOT_DETECTED',
            verifiedWorkingSeconds: newVerifiedSeconds,
            lastFaceLostAt: now,
            lastFaceDetectedAt: null,
          },
        });

        if (activeInterval && workDelta > 0) {
          await prisma.attendanceInterval.update({
            where: { id: activeInterval.id },
            data: {
              faceVerifiedSeconds: activeInterval.faceVerifiedSeconds + workDelta,
              durationSeconds: activeInterval.durationSeconds + workDelta,
            },
          });
        }

        await prisma.attendanceEvent.create({
          data: {
            userId,
            date: todayStr,
            type: 'FACE_NOT_DETECTED',
            timestamp: now,
          },
        });

        return res.json({
          status: 'ok',
          currentState: 'FACE_NOT_DETECTED',
          verifiedWorkingSeconds: updated.verifiedWorkingSeconds,
          faceMissingSeconds: updated.faceMissingSeconds,
        });
      } else {
        // Face is continuously missing
        let missingDelta = 0;
        if (record.lastFaceLostAt) {
          missingDelta = Math.max(
            0,
            Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
          );
        }

        const newMissingSeconds = record.faceMissingSeconds + missingDelta;

        const updated = await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: {
            faceMissingSeconds: newMissingSeconds,
            lastFaceLostAt: now,
          },
        });

        if (activeInterval && missingDelta > 0) {
          await prisma.attendanceInterval.update({
            where: { id: activeInterval.id },
            data: {
              faceMissingSeconds: activeInterval.faceMissingSeconds + missingDelta,
            },
          });
        }

        return res.json({
          status: 'ok',
          currentState: 'FACE_NOT_DETECTED',
          verifiedWorkingSeconds: updated.verifiedWorkingSeconds,
          faceMissingSeconds: updated.faceMissingSeconds,
        });
      }
    }
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/break-start ───────────────────────────────────────
router.post('/break-start', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE' } },
      },
    });

    if (!record || record.isCompleted) {
      throw new AppError('No active attendance record found to pause for break', 400);
    }

    // Accumulate any pending working seconds before transitioning to break
    let finalVerified = record.verifiedWorkingSeconds;
    const isOfficeMode = record.workMode === 'OFFICE';

    if (isOfficeMode) {
      // OFFICE: accumulate from lastWorkResumedAt button timestamp
      if (record.currentState === 'WORKING' && record.lastWorkResumedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastWorkResumedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    } else {
      // WFH: accumulate from face detection timestamps
      if (record.currentState === 'WORKING' && record.lastFaceDetectedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    }

    // Accumulate any missing seconds if transitioning from FACE_NOT_DETECTED (WFH only)
    let finalMissing = record.faceMissingSeconds;
    if (!isOfficeMode && record.currentState === 'FACE_NOT_DETECTED' && record.lastFaceLostAt) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
      );
      finalMissing += delta;
    }

    // Close any active WORK interval
    await prisma.attendanceInterval.updateMany({
      where: {
        attendanceRecordId: record.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CLOSED',
        endedAt: now,
      },
    });

    // Create BREAK interval
    const breakInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'BREAK',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'ON_BREAK',
        verifiedWorkingSeconds: finalVerified,
        faceMissingSeconds: finalMissing,
        lastFaceDetectedAt: null,
        lastFaceLostAt: null,
        lastWorkResumedAt: null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'BREAK_STARTED',
        timestamp: now,
      },
    });

    broadcast({
      type: 'ATTENDANCE_BREAK_STARTED',
      payload: { record: updated, breakInterval },
    });

    res.json({
      message: 'Started break',
      record: updated,
      activeInterval: breakInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/break-end ─────────────────────────────────────────
router.post('/break-end', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE', type: 'BREAK' } },
      },
    });

    if (!record || record.currentState !== 'ON_BREAK') {
      throw new AppError('No active break session found to resume', 400);
    }

    const activeBreak = record.intervals[0];
    let breakDuration = 0;
    if (activeBreak) {
      breakDuration = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeBreak.startedAt).getTime()) / 1000)
      );
      await prisma.attendanceInterval.update({
        where: { id: activeBreak.id },
        data: {
          status: 'CLOSED',
          endedAt: now,
          durationSeconds: breakDuration,
        },
      });
    }

    const newWorkInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'WORK',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    const isOfficeModeBreak = record.workMode === 'OFFICE';
    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'WORKING',
        breakSeconds: record.breakSeconds + breakDuration,
        lastFaceDetectedAt: isOfficeModeBreak ? null : now,
        lastFaceLostAt: null,
        lastWorkResumedAt: isOfficeModeBreak ? now : null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'BREAK_ENDED',
        timestamp: now,
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'WORK_RESUMED',
        timestamp: now,
      },
    });

    broadcast({
      type: 'ATTENDANCE_BREAK_ENDED',
      payload: { record: updated, activeInterval: newWorkInterval },
    });

    res.json({
      message: 'Resumed working session',
      record: updated,
      activeInterval: newWorkInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/lunch-start ───────────────────────────────────────
router.post('/lunch-start', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE' } },
      },
    });

    if (!record || record.isCompleted) {
      throw new AppError('No active attendance record found to pause for lunch', 400);
    }

    if (record.currentState !== 'WORKING' && record.currentState !== 'FACE_NOT_DETECTED') {
      throw new AppError(`Cannot start lunch while in state: ${record.currentState}`, 400);
    }

    const isOfficeModeL = record.workMode === 'OFFICE';
    let finalVerified = record.verifiedWorkingSeconds;

    if (isOfficeModeL) {
      if (record.currentState === 'WORKING' && record.lastWorkResumedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastWorkResumedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    } else {
      if (record.currentState === 'WORKING' && record.lastFaceDetectedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    }

    let finalMissing = record.faceMissingSeconds;
    if (!isOfficeModeL && record.currentState === 'FACE_NOT_DETECTED' && record.lastFaceLostAt) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
      );
      finalMissing += delta;
    }

    // Close any active WORK interval
    await prisma.attendanceInterval.updateMany({
      where: {
        attendanceRecordId: record.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CLOSED',
        endedAt: now,
      },
    });

    // Create LUNCH interval
    const lunchInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'LUNCH',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'ON_LUNCH',
        verifiedWorkingSeconds: finalVerified,
        faceMissingSeconds: finalMissing,
        lastFaceDetectedAt: null,
        lastFaceLostAt: null,
        lastWorkResumedAt: null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'LUNCH_STARTED',
        timestamp: now,
      },
    });

    broadcast({
      type: 'ATTENDANCE_LUNCH_STARTED',
      payload: { record: updated, lunchInterval },
    });

    res.json({
      message: 'Started lunch',
      record: updated,
      activeInterval: lunchInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/lunch-end ─────────────────────────────────────────
router.post('/lunch-end', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE', type: 'LUNCH' } },
      },
    });

    if (!record || record.currentState !== 'ON_LUNCH') {
      throw new AppError('No active lunch session found to resume', 400);
    }

    const activeLunch = record.intervals[0];
    let lunchDuration = 0;
    if (activeLunch) {
      lunchDuration = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeLunch.startedAt).getTime()) / 1000)
      );
      await prisma.attendanceInterval.update({
        where: { id: activeLunch.id },
        data: {
          status: 'CLOSED',
          endedAt: now,
          durationSeconds: lunchDuration,
        },
      });
    }

    const newWorkInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'WORK',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    const isOfficeModeL2 = record.workMode === 'OFFICE';
    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'WORKING',
        lunchSeconds: record.lunchSeconds + lunchDuration,
        lastFaceDetectedAt: isOfficeModeL2 ? null : now,
        lastFaceLostAt: null,
        lastWorkResumedAt: isOfficeModeL2 ? now : null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'LUNCH_ENDED',
        timestamp: now,
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'WORK_RESUMED',
        timestamp: now,
      },
    });

    broadcast({
      type: 'ATTENDANCE_LUNCH_ENDED',
      payload: { record: updated, activeInterval: newWorkInterval },
    });

    res.json({
      message: 'Resumed working session',
      record: updated,
      activeInterval: newWorkInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/meeting-start ─────────────────────────────────────
// Employee starts a meeting: Camera turns OFF (frees camera for Zoom/Meet),
// meeting time IS ADDED / CALCULATED IN OFFICIAL WORKING HOURS.
router.post('/meeting-start', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE' } },
      },
    });

    if (!record || record.isCompleted) {
      throw new AppError('No active attendance record found for today', 400);
    }

    if (record.currentState !== 'WORKING' && record.currentState !== 'FACE_NOT_DETECTED') {
      throw new AppError(`Cannot start meeting while in state: ${record.currentState}`, 400);
    }

    // Accumulate pending working seconds before switching to meeting
    const isOfficeModeM = record.workMode === 'OFFICE';
    let finalVerified = record.verifiedWorkingSeconds;
    if (isOfficeModeM) {
      if (record.currentState === 'WORKING' && record.lastWorkResumedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastWorkResumedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    } else {
      if (record.currentState === 'WORKING' && record.lastFaceDetectedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    }

    let finalMissing = record.faceMissingSeconds;
    if (!isOfficeModeM && record.currentState === 'FACE_NOT_DETECTED' && record.lastFaceLostAt) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
      );
      finalMissing += delta;
    }

    // Close any active WORK interval
    await prisma.attendanceInterval.updateMany({
      where: {
        attendanceRecordId: record.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CLOSED',
        endedAt: now,
      },
    });

    // Create MEETING interval
    const meetingInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'MEETING',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'IN_MEETING',
        verifiedWorkingSeconds: finalVerified,
        faceMissingSeconds: finalMissing,
        lastFaceDetectedAt: null,
        lastFaceLostAt: null,
        lastWorkResumedAt: null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'MEETING_STARTED',
        timestamp: now,
      },
    });

    broadcast({
      type: 'ATTENDANCE_MEETING_STARTED',
      payload: { record: updated, meetingInterval },
    });

    res.json({
      message: 'Started meeting. Camera turned off; meeting duration counts as working hours.',
      record: updated,
      activeInterval: meetingInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/meeting-end ───────────────────────────────────────
// Employee ends meeting: Meeting time is accumulated into working hours,
// and state returns to WORKING (camera turns back on).
router.post('/meeting-end', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE', type: 'MEETING' } },
      },
    });

    if (!record || record.currentState !== 'IN_MEETING') {
      throw new AppError('No active meeting session found to end', 400);
    }

    const activeMeeting = record.intervals[0];
    let meetingDuration = 0;
    if (activeMeeting) {
      meetingDuration = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeMeeting.startedAt).getTime()) / 1000)
      );
      await prisma.attendanceInterval.update({
        where: { id: activeMeeting.id },
        data: {
          status: 'CLOSED',
          endedAt: now,
          durationSeconds: meetingDuration,
        },
      });
    }

    const newWorkInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'WORK',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    // Meeting duration counts directly as verified working time!
    const isOfficeModeM2 = record.workMode === 'OFFICE';
    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'WORKING',
        meetingSeconds: (record.meetingSeconds || 0) + meetingDuration,
        verifiedWorkingSeconds: record.verifiedWorkingSeconds + meetingDuration,
        lastFaceDetectedAt: isOfficeModeM2 ? null : now,
        lastFaceLostAt: null,
        lastWorkResumedAt: isOfficeModeM2 ? now : null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'MEETING_ENDED',
        timestamp: now,
        metadata: JSON.stringify({ meetingDurationSeconds: meetingDuration }),
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'WORK_RESUMED',
        timestamp: now,
      },
    });

    broadcast({
      type: 'ATTENDANCE_MEETING_ENDED',
      payload: { record: updated, activeInterval: newWorkInterval },
    });

    res.json({
      message: 'Meeting ended. Duration added to official working hours. Resuming face monitoring.',
      record: updated,
      activeInterval: newWorkInterval,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/end-workday ───────────────────────────────────────
// Employee ends workday. Closes all active intervals and sets WORKDAY_COMPLETED
router.post('/end-workday', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE' } },
      },
    });

    if (!record) {
      throw new AppError('No attendance record found for today', 400);
    }

    if (record.isCompleted || record.currentState === 'WORKDAY_COMPLETED') {
      return res.json({
        message: 'Workday already completed for today',
        record,
      });
    }

    let finalVerified = record.verifiedWorkingSeconds;
    let finalMissing = record.faceMissingSeconds;
    let finalBreak = record.breakSeconds;
    let finalLunch = record.lunchSeconds;
    let finalMeeting = record.meetingSeconds || 0;

    const activeInterval = record.intervals[0] || null;

    const isOfficeMode = record.workMode === 'OFFICE';
    if (record.currentState === 'WORKING') {
      if (isOfficeMode && record.lastWorkResumedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastWorkResumedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      } else if (!isOfficeMode && record.lastFaceDetectedAt) {
        const delta = Math.max(
          0,
          Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
        );
        finalVerified += delta;
      }
    } else if (record.currentState === 'FACE_NOT_DETECTED' && record.lastFaceLostAt) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
      );
      finalMissing += delta;
    } else if (record.currentState === 'ON_BREAK' && activeInterval) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000)
      );
      finalBreak += delta;
    } else if (record.currentState === 'ON_LUNCH' && activeInterval) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000)
      );
      finalLunch += delta;
    } else if (record.currentState === 'IN_MEETING' && activeInterval) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000)
      );
      finalMeeting += delta;
      finalVerified += delta; // Meeting counts toward official working hours
    }

    // Close all open intervals
    await prisma.attendanceInterval.updateMany({
      where: {
        attendanceRecordId: record.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CLOSED',
        endedAt: now,
      },
    });

    const clockInTime = record.clockIn || record.attendanceMarkedAt;
    const totalDurationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(clockInTime).getTime()) / 1000)
    );

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'WORKDAY_COMPLETED',
        status: 'COMPLETED',
        isCompleted: true,
        clockOut: now,
        workEndedAt: now,
        verifiedWorkingSeconds: finalVerified,
        faceMissingSeconds: finalMissing,
        breakSeconds: finalBreak,
        lunchSeconds: finalLunch,
        meetingSeconds: finalMeeting,
        totalAttendanceSeconds: totalDurationSeconds,
        lastFaceDetectedAt: null,
        lastFaceLostAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            department: { select: { code: true, name: true } },
          },
        },
        intervals: true,
      },
    });

    // Close any active WebRTC presence sessions
    await prisma.webRTCSession.updateMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      data: {
        status: 'ENDED',
        endedAt: now,
      },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'WORKDAY_COMPLETED',
        timestamp: now,
        metadata: JSON.stringify({
          verifiedWorkingSeconds: finalVerified,
          totalAttendanceSeconds: totalDurationSeconds,
          breakSeconds: finalBreak,
          lunchSeconds: finalLunch,
          faceMissingSeconds: finalMissing,
        }),
      },
    });

    broadcast({
      type: WSEventTypes.ATTENDANCE_CLOCKED_OUT,
      payload: updated,
    });

    res.json({
      message: 'Workday completed successfully. Camera session stopped.',
      record: updated,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/attendance/my-history ─────────────────────────────────────────
// Normal employees can only view their own attendance history (NO activity monitoring)
router.get('/my-history', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(100, parseInt((req.query.limit as string) || '30'));
    const range = (req.query.range as string) || 'monthly'; // daily, weekly, monthly
    const now = new Date();
    const todayStr = getTodayDateString();

    const where: any = { userId };
    if (range === 'daily') {
      where.date = todayStr;
    } else if (range === 'weekly') {
      const pastWeek = new Date(now);
      pastWeek.setDate(pastWeek.getDate() - 7);
      where.date = { gte: pastWeek.toISOString().split('T')[0] };
    } else if (range === 'monthly') {
      const pastMonth = new Date(now);
      pastMonth.setDate(pastMonth.getDate() - 30);
      where.date = { gte: pastMonth.toISOString().split('T')[0] };
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        date: true,
        status: true,
        currentState: true,
        clockIn: true,
        clockOut: true,
        attendanceMarkedAt: true,
        workStartedAt: true,
        workEndedAt: true,
        verifiedWorkingSeconds: true,
        breakSeconds: true,
        lunchSeconds: true,
        meetingSeconds: true,
        faceMissingSeconds: true,
        totalAttendanceSeconds: true,
        isCompleted: true,
        createdAt: true,
        intervals: {
          where: { status: 'ACTIVE' },
        },
        lastFaceDetectedAt: true,
        lastFaceLostAt: true,
      },
    });

    // Format records with live calculation for today's active session
    const computedRecords = records.map((rec) => {
      let verifiedWorkingSeconds = rec.verifiedWorkingSeconds;
      let breakSeconds = rec.breakSeconds;
      let lunchSeconds = rec.lunchSeconds;
      let meetingSeconds = rec.meetingSeconds || 0;
      let faceMissingSeconds = rec.faceMissingSeconds;
      let totalAttendanceSeconds = rec.totalAttendanceSeconds;

      if (!rec.isCompleted && rec.date === todayStr) {
        const activeInterval = rec.intervals?.[0] || null;

        if (rec.currentState === 'WORKING' && rec.lastFaceDetectedAt) {
          const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(rec.lastFaceDetectedAt).getTime()) / 1000));
          verifiedWorkingSeconds += elapsed;
        } else if (rec.currentState === 'FACE_NOT_DETECTED' && rec.lastFaceLostAt) {
          const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(rec.lastFaceLostAt).getTime()) / 1000));
          faceMissingSeconds += elapsed;
        } else if (rec.currentState === 'ON_BREAK' && activeInterval) {
          const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000));
          breakSeconds += elapsed;
        } else if (rec.currentState === 'ON_LUNCH' && activeInterval) {
          const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000));
          lunchSeconds += elapsed;
        } else if (rec.currentState === 'IN_MEETING' && activeInterval) {
          const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(activeInterval.startedAt).getTime()) / 1000));
          meetingSeconds += elapsed;
          verifiedWorkingSeconds += elapsed;
        }

        if (rec.clockIn && !rec.clockOut) {
          totalAttendanceSeconds = Math.max(0, Math.floor((now.getTime() - new Date(rec.clockIn).getTime()) / 1000));
        }
      }

      const { intervals, lastFaceDetectedAt, lastFaceLostAt, ...rest } = rec;
      return {
        ...rest,
        verifiedWorkingSeconds,
        breakSeconds,
        lunchSeconds,
        meetingSeconds,
        faceMissingSeconds,
        totalAttendanceSeconds,
      };
    });

    res.json({
      range,
      records: computedRecords,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/attendance/activity-heartbeat ────────────────────────────────
// Aggregated activity ingestion (Mouse/Keyboard count + active seconds).
// NO typed keys, NO input content, NO passwords, NO screenshots.
router.post('/activity-heartbeat', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    const {
      mouseActiveSeconds = 0,
      keyboardActiveSeconds = 0,
      idleSeconds = 0,
      mouseEventCount = 0,
      mouseClickCount = 0,
      scrollCount = 0,
      keyboardEventCount = 0,
    } = req.body;

    // Upsert into EmployeeActivitySummary
    const summary = await prisma.employeeActivitySummary.upsert({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      update: {
        mouseActiveSeconds: { increment: Math.max(0, Math.floor(mouseActiveSeconds)) },
        keyboardActiveSeconds: { increment: Math.max(0, Math.floor(keyboardActiveSeconds)) },
        idleSeconds: { increment: Math.max(0, Math.floor(idleSeconds)) },
        mouseEventCount: { increment: Math.max(0, Math.floor(mouseEventCount)) },
        mouseClickCount: { increment: Math.max(0, Math.floor(mouseClickCount)) },
        scrollCount: { increment: Math.max(0, Math.floor(scrollCount)) },
        keyboardEventCount: { increment: Math.max(0, Math.floor(keyboardEventCount)) },
        lastActivityAt: now,
      },
      create: {
        userId,
        date: todayStr,
        mouseActiveSeconds: Math.max(0, Math.floor(mouseActiveSeconds)),
        keyboardActiveSeconds: Math.max(0, Math.floor(keyboardActiveSeconds)),
        idleSeconds: Math.max(0, Math.floor(idleSeconds)),
        mouseEventCount: Math.max(0, Math.floor(mouseEventCount)),
        mouseClickCount: Math.max(0, Math.floor(mouseClickCount)),
        scrollCount: Math.max(0, Math.floor(scrollCount)),
        keyboardEventCount: Math.max(0, Math.floor(keyboardEventCount)),
        lastActivityAt: now,
      },
    });

    res.json({
      status: 'ok',
      lastActivityAt: summary.lastActivityAt,
    });
  } catch (err) {
    next(err);
  }
});

// ─── SUPER_ADMIN ONLY ENDPOINTS ─────────────────────────────────────────────

// GET /api/attendance/admin/overview
router.get('/admin/overview', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const todayStr = (req.query.date as string) || getTodayDateString();

    const [allEmployees, todayRecords] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: { select: { name: true } },
          department: { select: { id: true, code: true, name: true, color: true } },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: { date: todayStr },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: { select: { name: true } },
              department: { select: { id: true, code: true, name: true, color: true } },
            },
          },
        },
      }),
    ]);

    const totalEmployees = allEmployees.length;
    const present = todayRecords.length;
    const working = todayRecords.filter((r) => r.currentState === 'WORKING').length;
    const onBreak = todayRecords.filter((r) => r.currentState === 'ON_BREAK').length;
    const onLunch = todayRecords.filter((r) => r.currentState === 'ON_LUNCH').length;
    const inMeeting = todayRecords.filter((r) => r.currentState === 'IN_MEETING').length;
    const faceNotDetected = todayRecords.filter((r) => r.currentState === 'FACE_NOT_DETECTED').length;
    const completed = todayRecords.filter((r) => r.currentState === 'WORKDAY_COMPLETED').length;
    const absent = Math.max(0, totalEmployees - present);

    res.json({
      date: todayStr,
      metrics: {
        totalEmployees,
        present,
        working,
        onBreak,
        onLunch,
        inMeeting,
        faceNotDetected,
        completed,
        absent,
      },
      records: todayRecords,
      allEmployees,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/admin/activity
// Activity Monitoring table for SUPER_ADMIN ONLY
router.get('/admin/activity', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const todayStr = (req.query.date as string) || getTodayDateString();

    const [users, attendanceRecords, activitySummaries] = await Promise.all([
      prisma.user.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: { select: { name: true } },
          department: { select: { id: true, code: true, name: true, color: true } },
        },
      }),
      prisma.attendanceRecord.findMany({
        where: { date: todayStr },
      }),
      prisma.employeeActivitySummary.findMany({
        where: { date: todayStr },
      }),
    ]);

    const attendanceMap = new Map(attendanceRecords.map((r) => [r.userId, r]));
    const activityMap = new Map(activitySummaries.map((a) => [a.userId, a]));

    const now = new Date();

    const combinedList = users.map((user) => {
      const att = attendanceMap.get(user.id);
      const act = activityMap.get(user.id);

      const lastAct = act?.lastActivityAt ? new Date(act.lastActivityAt) : null;
      // An employee is Online if they are currently clocked in (working/meeting/break/lunch), or had activity within last 10 minutes
      const isShiftActive = Boolean(att && att.clockIn && !att.clockOut && att.currentState !== 'OFF_DUTY');
      const isRecentActivity = Boolean(lastAct && (now.getTime() - lastAct.getTime() < 600 * 1000));
      const isOnline = isShiftActive || isRecentActivity;

      let verifiedWorkingSeconds = att?.verifiedWorkingSeconds || 0;
      if (att && att.currentState === 'WORKING') {
        if (att.workMode === 'OFFICE' && att.lastWorkResumedAt) {
          verifiedWorkingSeconds += Math.max(0, Math.floor((now.getTime() - new Date(att.lastWorkResumedAt).getTime()) / 1000));
        } else if (att.workMode !== 'OFFICE' && att.lastFaceDetectedAt) {
          verifiedWorkingSeconds += Math.max(0, Math.floor((now.getTime() - new Date(att.lastFaceDetectedAt).getTime()) / 1000));
        }
      }

      return {
        user,
        workMode: att?.workMode || 'WFH',
        attendanceStatus: att?.status || 'ABSENT',
        currentState: att?.currentState || 'OFF_DUTY',
        clockIn: att?.clockIn || null,
        clockOut: att?.clockOut || null,
        verifiedWorkingSeconds,
        breakSeconds: att?.breakSeconds || 0,
        lunchSeconds: att?.lunchSeconds || 0,
        meetingSeconds: att?.meetingSeconds || 0,
        faceMissingSeconds: att?.faceMissingSeconds || 0,
        totalAttendanceSeconds: att?.totalAttendanceSeconds || 0,

        // SEPARATE ACTIVITY ANALYTICS (does not alter working time)
        mouseActiveSeconds: act?.mouseActiveSeconds || 0,
        keyboardActiveSeconds: act?.keyboardActiveSeconds || 0,
        idleSeconds: act?.idleSeconds || 0,
        mouseClickCount: act?.mouseClickCount || 0,
        mouseEventCount: act?.mouseEventCount || 0,
        keyboardEventCount: act?.keyboardEventCount || 0,
        lastActivityAt: act?.lastActivityAt || null,
        isOnline: Boolean(isOnline),
      };
    });

    res.json({
      date: todayStr,
      employees: combinedList,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/admin/employee/:id
// Individual employee detailed breakdown for SUPER_ADMIN
router.get('/admin/employee/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const dateStr = (req.query.date as string) || getTodayDateString();

    const [user, record, activity, events] = await Promise.all([
      prisma.user.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: { select: { name: true } },
          department: { select: { id: true, code: true, name: true, color: true } },
        },
      }),
      prisma.attendanceRecord.findUnique({
        where: {
          userId_date: {
            userId: employeeId,
            date: dateStr,
          },
        },
        include: {
          intervals: {
            orderBy: { startedAt: 'asc' },
          },
        },
      }),
      prisma.employeeActivitySummary.findUnique({
        where: {
          userId_date: {
            userId: employeeId,
            date: dateStr,
          },
        },
      }),
      prisma.attendanceEvent.findMany({
        where: {
          userId: employeeId,
          date: dateStr,
        },
        orderBy: { timestamp: 'asc' },
      }),
    ]);

    if (!user) {
      throw new AppError('Employee not found', 404);
    }

    res.json({
      employee: user,
      date: dateStr,
      officialAttendance: {
        hasRecord: Boolean(record),
        workMode: record?.workMode || 'WFH',
        status: record?.status || 'ABSENT',
        currentState: record?.currentState || 'OFF_DUTY',
        clockIn: record?.clockIn || null,
        clockOut: record?.clockOut || null,
        verifiedWorkingSeconds: record?.verifiedWorkingSeconds || 0,
        breakSeconds: record?.breakSeconds || 0,
        lunchSeconds: record?.lunchSeconds || 0,
        meetingSeconds: record?.meetingSeconds || 0,
        faceMissingSeconds: record?.faceMissingSeconds || 0,
        totalAttendanceSeconds: record?.totalAttendanceSeconds || 0,
        intervals: record?.intervals || [],
      },
      activityAnalytics: {
        mouseActiveSeconds: activity?.mouseActiveSeconds || 0,
        keyboardActiveSeconds: activity?.keyboardActiveSeconds || 0,
        idleSeconds: activity?.idleSeconds || 0,
        mouseClickCount: activity?.mouseClickCount || 0,
        mouseEventCount: activity?.mouseEventCount || 0,
        keyboardEventCount: activity?.keyboardEventCount || 0,
        lastActivityAt: activity?.lastActivityAt || null,
      },
      timelineEvents: events,
      disclaimer: 'Activity analytics are informational only and do not contribute to official working hours.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/admin/timeline/:id
router.get('/admin/timeline/:id', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const employeeId = req.params.id;
    const dateStr = (req.query.date as string) || getTodayDateString();

    const events = await prisma.attendanceEvent.findMany({
      where: {
        userId: employeeId,
        date: dateStr,
      },
      orderBy: { timestamp: 'asc' },
    });

    res.json({
      date: dateStr,
      events,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/admin/reports
router.get('/admin/reports', requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const { startDate, endDate, departmentId } = req.query as {
      startDate?: string;
      endDate?: string;
      departmentId?: string;
    };

    const whereClause: any = {};
    if (startDate && endDate) {
      whereClause.date = { gte: startDate, lte: endDate };
    } else if (startDate) {
      whereClause.date = { gte: startDate };
    }

    if (departmentId) {
      whereClause.user = { departmentId };
    }

    const records = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: { select: { name: true } },
            department: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { clockIn: 'desc' }],
    });

    res.json({
      records,
      totalCount: records.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── BACKWARD-COMPATIBLE LEGACY ROUTES ──────────────────────────────────────

// GET /api/attendance/status (Legacy support for current header/widget polling)
router.get('/status', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
    });

    const activeWebRTC = await prisma.webRTCSession.findFirst({
      where: {
        userId,
        status: 'ACTIVE',
      },
    });

    res.json({
      isClockedIn: record?.currentState === 'WORKING' || record?.currentState === 'FACE_NOT_DETECTED',
      isOnBreak: record?.currentState === 'ON_BREAK' || record?.currentState === 'ON_LUNCH',
      currentState: record?.currentState || 'OFF_DUTY',
      record,
      activeWebRTC,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/clock-in (Legacy alias mapped to start-work)
router.post('/clock-in', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();

    let record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
    });

    if (!record) {
      record = await prisma.attendanceRecord.create({
        data: {
          userId,
          date: todayStr,
          status: 'PRESENT',
          currentState: 'WORKING',
          clockIn: now,
          workStartedAt: now,
          lastFaceDetectedAt: now,
        },
      });
    } else {
      record = await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          currentState: 'WORKING',
          clockIn: record.clockIn || now,
          workStartedAt: record.workStartedAt || now,
          lastFaceDetectedAt: now,
        },
      });
    }

    res.status(201).json({
      message: 'Clocked in successfully',
      record,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/check-in (Check-in alias with photo and device info)
router.post('/check-in', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();
    const { image } = req.body;

    let record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
    });

    if (!record) {
      record = await prisma.attendanceRecord.create({
        data: {
          userId,
          date: todayStr,
          status: 'PRESENT',
          currentState: 'WORKING',
          clockIn: now,
          workStartedAt: now,
          lastFaceDetectedAt: now,
          notes: image || null,
        },
      });
    } else {
      record = await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          currentState: 'WORKING',
          clockIn: record.clockIn || now,
          workStartedAt: record.workStartedAt || now,
          lastFaceDetectedAt: now,
          ...(image && { notes: image }),
        },
      });
    }

    broadcast({
      type: 'ATTENDANCE_MARKED',
      payload: { record },
    });

    res.status(201).json({
      message: 'Morning attendance verified successfully!',
      record,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/check-out (Logoff alias with notes)
router.post('/check-out', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const todayStr = getTodayDateString();
    const now = new Date();
    const { notes } = req.body;

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
    });

    if (!record) {
      throw new AppError('No attendance record found for today', 400);
    }

    const clockInTime = record.clockIn || record.attendanceMarkedAt;
    const totalDurationSeconds = Math.max(
      0,
      Math.floor((now.getTime() - new Date(clockInTime).getTime()) / 1000)
    );

    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'WORKDAY_COMPLETED',
        status: 'COMPLETED',
        isCompleted: true,
        clockOut: now,
        workEndedAt: now,
        totalAttendanceSeconds: totalDurationSeconds,
        ...(notes && { notes }),
      },
    });

    broadcast({
      type: 'ATTENDANCE_CLOCKED_OUT',
      payload: { record: updated },
    });

    res.json({
      message: 'Shift concluded successfully! Full daily activity transmitted.',
      record: updated,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/user/:userId/daily-summary
router.get('/user/:userId/daily-summary', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const dateStr = (req.query.date as string) || getTodayDateString();

    const [user, record, worklogs, auditLogs] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          role: { select: { name: true } },
          department: { select: { id: true, code: true, name: true, color: true } },
        },
      }),
      prisma.attendanceRecord.findUnique({
        where: {
          userId_date: {
            userId,
            date: dateStr,
          },
        },
        include: {
          intervals: {
            orderBy: { startedAt: 'asc' },
          },
        },
      }),
      prisma.taskWorklog.findMany({
        where: {
          userId,
          logDate: {
            gte: new Date(`${dateStr}T00:00:00.000Z`),
            lte: new Date(`${dateStr}T23:59:59.999Z`),
          },
        },
        include: {
          task: {
            include: { status: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(`${dateStr}T00:00:00.000Z`),
            lte: new Date(`${dateStr}T23:59:59.999Z`),
          },
        },
        take: 30,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    if (!user) {
      throw new AppError('User not found', 404);
    }

    const totalSeconds = record?.totalAttendanceSeconds || record?.verifiedWorkingSeconds || 0;
    const totalActiveHours = Math.round((totalSeconds / 3600) * 10) / 10;
    const totalWorklogHours = Math.round(worklogs.reduce((acc, w) => acc + (w.hours || 0), 0) * 10) / 10;

    let status = 'NOT_STARTED';
    if (record) {
      if (record.isCompleted || record.currentState === 'WORKDAY_COMPLETED') {
        status = 'CHECKED_OUT';
      } else {
        status = 'CHECKED_IN';
      }
    }

    const isImageNote = record?.notes ? record.notes.startsWith('data:image') : false;
    const photoUrl = isImageNote && record ? record.notes : null;
    const textNotes = !isImageNote && record ? record.notes : null;

    res.json({
      user,
      attendance: record
        ? {
            status,
            checkInTime: record.clockIn || record.attendanceMarkedAt,
            checkOutTime: record.clockOut,
            checkInPhoto: photoUrl,
            currentState: record.currentState,
            verifiedWorkingSeconds: record.verifiedWorkingSeconds,
            breakSeconds: record.breakSeconds,
            lunchSeconds: record.lunchSeconds,
            meetingSeconds: record.meetingSeconds,
          }
        : null,
      summary: {
        totalActiveHours,
        totalWorklogHours,
        notes: textNotes || '',
        stats: {
          worklogsCount: worklogs.length,
          tasksCompletedCount: worklogs.filter(
            (w) =>
              w.task?.status?.name?.toLowerCase().includes('done') ||
              w.task?.status?.name?.toLowerCase().includes('complete')
          ).length,
          tasksUpdatedCount: worklogs.length,
          ticketsCount: 0,
          commentsCount: 0,
          auditActionsCount: auditLogs.length,
        },
        worklogs,
        tasksUpdated: worklogs.map((w) => w.task).filter(Boolean),
        tickets: [],
        auditLogs,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/summary (Legacy support)
router.get('/summary', async (req, res, next) => {
  try {
    const todayStr = getTodayDateString();

    const records = await prisma.attendanceRecord.findMany({
      where: { date: todayStr },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: { select: { name: true } },
            department: { select: { id: true, code: true, name: true, color: true } },
          },
        },
      },
      orderBy: { clockIn: 'desc' },
    });

    const activeCount = records.filter((r) => r.currentState === 'WORKING' || r.currentState === 'FACE_NOT_DETECTED').length;
    const completedCount = records.filter((r) => r.isCompleted).length;
    const totalHoursToday = records.reduce((acc, r) => acc + (r.verifiedWorkingSeconds / 3600), 0);

    res.json({
      date: todayStr,
      activeCount,
      completedCount,
      totalHoursToday: parseFloat(totalHoursToday.toFixed(2)),
      records,
      activeWebRTCSessionsCount: 0,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/attendance/logs (Legacy support)
router.get('/logs', async (req, res, next) => {
  try {
    const user = req.user!;
    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(user.roleName);
    const limit = parseInt((req.query.limit as string) || '50');

    const whereClause: any = {};
    if (!isAdmin) {
      whereClause.userId = user.id;
    }

    const logs = await prisma.attendanceRecord.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
            role: { select: { name: true } },
            department: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json(logs);
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/heartbeat (Legacy presence heartbeat mapped safely)
router.post('/heartbeat', async (req, res, next) => {
  try {
    const userId = req.user!.id;
    const { isFaceDetected = false, faceConfidence = 0 } = req.body || {};
    const now = new Date();

    res.json({
      status: 'ok',
      isFaceDetected,
      faceConfidence,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/webrtc/signal (Preserved signaling route)
router.post('/webrtc/signal', async (req, res, next) => {
  try {
    const sender = req.user!;
    const { targetUserId, signalType, data } = req.body;

    if (targetUserId) {
      broadcastToUser(targetUserId, {
        type: `WEBRTC_${signalType}`,
        payload: {
          senderId: sender.id,
          senderName: sender.name,
          data,
        },
      });
    } else {
      broadcast({
        type: `WEBRTC_${signalType}`,
        payload: {
          senderId: sender.id,
          senderName: sender.name,
          data,
        },
      });
    }

    res.json({ message: 'Signal relayed successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Auto-break on disconnect ───────────────────────────────────────────────
// Called by WebSocket service when a user disconnects and doesn't reconnect
// within the grace period. Transitions WORKING/FACE_NOT_DETECTED → ON_BREAK.
export async function autoBreakOnDisconnect(userId: string): Promise<boolean> {
  try {
    const todayStr = getTodayDateString();
    const now = new Date();

    const record = await prisma.attendanceRecord.findUnique({
      where: {
        userId_date: {
          userId,
          date: todayStr,
        },
      },
      include: {
        intervals: { where: { status: 'ACTIVE' } },
      },
    });

    if (!record || record.isCompleted) {
      return false;
    }

    // Only auto-break if the user is actively working or face-missing
    if (record.currentState !== 'WORKING' && record.currentState !== 'FACE_NOT_DETECTED') {
      return false;
    }

    // Accumulate any pending working seconds if transitioning from WORKING
    let finalVerified = record.verifiedWorkingSeconds;
    if (record.currentState === 'WORKING' && record.lastFaceDetectedAt) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceDetectedAt).getTime()) / 1000)
      );
      finalVerified += delta;
    }

    // Accumulate any missing seconds if transitioning from FACE_NOT_DETECTED
    let finalMissing = record.faceMissingSeconds;
    if (record.currentState === 'FACE_NOT_DETECTED' && record.lastFaceLostAt) {
      const delta = Math.max(
        0,
        Math.floor((now.getTime() - new Date(record.lastFaceLostAt).getTime()) / 1000)
      );
      finalMissing += delta;
    }

    // Close any active WORK interval
    await prisma.attendanceInterval.updateMany({
      where: {
        attendanceRecordId: record.id,
        status: 'ACTIVE',
      },
      data: {
        status: 'CLOSED',
        endedAt: now,
      },
    });

    // Create BREAK interval
    const breakInterval = await prisma.attendanceInterval.create({
      data: {
        attendanceRecordId: record.id,
        type: 'BREAK',
        status: 'ACTIVE',
        startedAt: now,
      },
    });

    // Update attendance record
    const updated = await prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        currentState: 'ON_BREAK',
        verifiedWorkingSeconds: finalVerified,
        faceMissingSeconds: finalMissing,
        lastFaceDetectedAt: null,
        lastFaceLostAt: null,
      },
      include: { intervals: true },
    });

    await prisma.attendanceEvent.create({
      data: {
        userId,
        date: todayStr,
        type: 'BREAK_STARTED',
        timestamp: now,
        metadata: JSON.stringify({ reason: 'AUTO_DISCONNECT', trigger: 'Tab/app closed or connection lost' }),
      },
    });

    broadcast({
      type: 'ATTENDANCE_BREAK_STARTED',
      payload: { record: updated, breakInterval, autoDisconnect: true },
    });

    console.log(`[Attendance] Auto-break triggered for user ${userId} due to disconnect`);
    return true;
  } catch (err) {
    console.error(`[Attendance] autoBreakOnDisconnect error for user ${userId}:`, err);
    return false;
  }
}

export default router;
