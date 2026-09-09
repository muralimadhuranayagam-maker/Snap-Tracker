import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { getAllWorkloads, getDepartmentWorkload } from '../services/workload';

const router = Router();
router.use(authenticate);

// ─── GET /api/workload ───────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const user = req.user!;
    const { departmentId } = req.query;
    const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
    const isAdmin = user.roleName === 'ADMIN';

    let workloads;
    if (departmentId) {
      workloads = await getDepartmentWorkload(departmentId as string);
    } else if (isSuperAdmin || isAdmin) {
      workloads = await getAllWorkloads();
    } else {
      // Employees see their own team
      workloads = user.departmentId
        ? await getDepartmentWorkload(user.departmentId)
        : await getAllWorkloads();
    }

    // AI Workload Balancing Recommendations
    const overloaded = workloads.filter(w => w.status === 'OVERLOADED');
    const healthy = workloads.filter(w => w.status === 'HEALTHY');

    const balancingRecommendations: any[] = [];
    for (const over of overloaded) {
      // Find eligible candidate with healthy workload
      const candidate = healthy.find(h => h.departmentCode === over.departmentCode && h.capacityPercent < 60);
      if (candidate) {
        // Find one non-started or active task of the overloaded user to suggest moving
        const taskToMove = await prisma.task.findFirst({
          where: {
            assigneeId: over.userId,
            isDeleted: false,
            status: { name: { in: ['TODO', 'BACKLOG'] } }
          },
          select: { id: true, taskId: true, title: true, estimatedHours: true }
        });

        if (taskToMove) {
          balancingRecommendations.push({
            fromUser: { id: over.userId, name: over.name, capacity: over.capacityPercent },
            toUser: { id: candidate.userId, name: candidate.name, capacity: candidate.capacityPercent },
            task: taskToMove,
            reason: `${over.name} is at ${over.capacityPercent}% capacity. Moving ${taskToMove.taskId} to ${candidate.name} (${candidate.capacityPercent}%) will restore healthy balance.`,
          });
        }
      }
    }

    res.json({
      summary: {
        total: workloads.length,
        healthy: workloads.filter(w => w.status === 'HEALTHY').length,
        high: workloads.filter(w => w.status === 'HIGH').length,
        overloaded: overloaded.length,
      },
      workloads,
      balancingRecommendations,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
