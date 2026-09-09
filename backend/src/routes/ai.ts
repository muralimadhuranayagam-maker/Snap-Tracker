import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  processAIChat,
  generateDailyPlan,
  generateTaskBreakdown,
  parseNaturalLanguageTask,
  calculateTaskPriorityScore,
  predictDeadlineRisk,
  assessProjectHealth,
} from '../services/ai';
import { scoreAllocCandidates, getAllWorkloads } from '../services/workload';

const router = Router();
router.use(authenticate);

// POST /api/ai/chat
router.post('/chat', async (req, res, next) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) throw new AppError('Message is required', 400);

    const result = await processAIChat(message, req.user!, history);

    // Log interaction
    await prisma.aIInteraction.create({
      data: {
        userId: req.user!.id,
        query: message,
        response: result.response,
        actions: result.actions ? JSON.stringify(result.actions) : null,
      }
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/daily-plan
router.post('/daily-plan', async (req, res, next) => {
  try {
    const userId = req.body.userId || req.user!.id;

    // RBAC: employees can only get their own plan
    if (req.user!.roleName === 'EMPLOYEE' && userId !== req.user!.id) {
      throw new AppError('Access denied', 403);
    }

    const plan = await generateDailyPlan(userId);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/task-breakdown
router.post('/task-breakdown', async (req, res, next) => {
  try {
    const { title, description } = req.body;
    if (!title) throw new AppError('Title is required', 400);

    const result = await generateTaskBreakdown(title, description);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/parse-task
router.post('/parse-task', async (req, res, next) => {
  try {
    const { input } = req.body;
    if (!input) throw new AppError('Input text is required', 400);

    const result = await parseNaturalLanguageTask(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/workload-analysis
router.post('/workload-analysis', async (req, res, next) => {
  try {
    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName);
    if (!isAdminOrAbove) throw new AppError('Admin access required', 403);

    const workloads = await getAllWorkloads();
    const overloaded = workloads.filter(w => w.status === 'OVERLOADED');
    const high = workloads.filter(w => w.status === 'HIGH');
    const healthy = workloads.filter(w => w.status === 'HEALTHY');

    const recommendations: string[] = [];
    if (overloaded.length > 0) {
      recommendations.push(`${overloaded.length} employee(s) are overloaded: ${overloaded.map(w => w.name).join(', ')}. Consider redistributing tasks.`);
    }
    if (high.length > 0) {
      recommendations.push(`${high.length} employee(s) have high workloads. Monitor closely to prevent overload.`);
    }

    res.json({
      summary: {
        overloaded: overloaded.length,
        high: high.length,
        healthy: healthy.length,
        total: workloads.length,
      },
      workloads,
      recommendations,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/allocate
router.post('/allocate', async (req, res, next) => {
  try {
    const { departmentId, estimatedHours, taskTypeId } = req.body;
    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName);
    if (!isAdminOrAbove) throw new AppError('Admin access required', 403);
    if (!departmentId) throw new AppError('departmentId is required', 400);

    const candidates = await scoreAllocCandidates(departmentId, estimatedHours, taskTypeId);

    res.json({
      candidates,
      recommendation: candidates[0] ? {
        userId: candidates[0].userId,
        name: candidates[0].name,
        matchScore: candidates[0].matchScore,
        factors: candidates[0].factors,
        explanation: `Recommended ${candidates[0].name} with ${candidates[0].matchScore}% match score. ${candidates[0].factors.join('. ')}.`,
      } : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/project-risk
router.post('/project-risk', async (req, res, next) => {
  try {
    const { projectId } = req.body;
    if (!projectId) throw new AppError('projectId is required', 400);

    const health = await assessProjectHealth(projectId);
    res.json(health);
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/task-risk
router.post('/task-risk', async (req, res, next) => {
  try {
    const { taskId } = req.body;
    if (!taskId) throw new AppError('taskId is required', 400);

    const [risk, priority] = await Promise.all([
      predictDeadlineRisk(taskId),
      calculateTaskPriorityScore(taskId),
    ]);

    res.json({ risk, priority });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/parse-meeting
router.post('/parse-meeting', async (req, res, next) => {
  try {
    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName);
    if (!isAdminOrAbove) throw new AppError('Admin access required', 403);

    const { text } = req.body;
    if (!text) throw new AppError('Meeting text is required', 400);

    // Parse meeting notes using NL task parser for each sentence/bullet
    const lines = text.split(/[\n.;]/).map((l: string) => l.trim()).filter((l: string) => l.length > 15);
    const tasks = [];

    for (const line of lines.slice(0, 10)) {
      const parsed = await parseNaturalLanguageTask(line);
      if (parsed.title && parsed.confidence > 0.5) {
        tasks.push({
          ...parsed,
          rawText: line,
        });
      }
    }

    res.json({
      extractedTasks: tasks,
      note: 'Review and confirm each task before creating. Tasks will not be created until you confirm.',
      rawText: text,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/ai/recommendations
router.get('/recommendations', async (req, res, next) => {
  try {
    const recommendations = await prisma.aIRecommendation.findMany({
      where: { status: 'ACTIVE' },
      include: {
        task: { select: { taskId: true, title: true, id: true } },
        feedback: {
          where: { userId: req.user!.id },
          select: { isHelpful: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json(recommendations);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/ai/recommendations/:id/feedback
router.patch('/recommendations/:id/feedback', async (req, res, next) => {
  try {
    const { isHelpful, reason } = req.body;

    const existing = await prisma.aIRecommendationFeedback.findFirst({
      where: {
        recommendationId: req.params.id,
        userId: req.user!.id,
      }
    });

    if (existing) {
      await prisma.aIRecommendationFeedback.update({
        where: { id: existing.id },
        data: { isHelpful, reason }
      });
    } else {
      await prisma.aIRecommendationFeedback.create({
        data: { recommendationId: req.params.id, userId: req.user!.id, isHelpful, reason }
      });
    }

    res.json({ message: 'Feedback recorded' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/ai/recommendations/:id/dismiss
router.patch('/recommendations/:id/dismiss', async (req, res, next) => {
  try {
    await prisma.aIRecommendation.update({
      where: { id: req.params.id },
      data: { status: 'DISMISSED' }
    });
    res.json({ message: 'Recommendation dismissed' });
  } catch (err) {
    next(err);
  }
});

export default router;
