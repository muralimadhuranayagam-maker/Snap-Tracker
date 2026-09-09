import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdminOrAbove } from '../middleware/auth';
import { createNotification } from '../services/notifications';
import { broadcast, WSEventTypes } from '../services/websocket';
import { detectBlockersFromText } from '../services/ai';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// POST /api/comments
router.post('/', async (req, res, next) => {
  try {
    const { taskId, content, isInternal, parentId } = req.body;
    const user = req.user!;

    if (!taskId || !content) throw new AppError('taskId and content are required', 400);

    // Internal notes: admin+ only
    if (isInternal && !['SUPER_ADMIN', 'ADMIN'].includes(user.roleName)) {
      throw new AppError('Only admins can post internal notes', 403);
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, isDeleted: false },
      include: { assignee: true, reporter: true, status: true }
    });
    if (!task) throw new AppError('Task not found', 404);

    const comment = await prisma.taskComment.create({
      data: {
        taskId,
        userId: user.id,
        content,
        isInternal: !!isInternal,
        parentId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        reactions: true,
      }
    });

    // Task history
    await prisma.taskHistory.create({
      data: {
        taskId,
        userId: user.id,
        action: 'TASK_COMMENT_ADDED',
        newValue: content.slice(0, 100),
      }
    });

    // Detect mentions (@username) and notify
    const mentionPattern = /@(\w+)/g;
    const mentions = content.match(mentionPattern);
    if (mentions) {
      const allUsers = await prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      for (const mention of mentions) {
        const username = mention.slice(1).toLowerCase();
        const mentioned = allUsers.find(u => u.name.toLowerCase().startsWith(username));
        if (mentioned && mentioned.id !== user.id) {
          await createNotification({
            userId: mentioned.id,
            taskId,
            type: 'TASK_MENTIONED',
            title: `${user.name} mentioned you`,
            message: `In ${task.taskId}: "${content.slice(0, 80)}..."`,
            actionUrl: `/tasks/${taskId}`,
          });
        }
      }
    }

    // Notify assignee/reporter about new comment
    const notifyUsers = [task.assigneeId, task.reporterId].filter(
      uid => uid && uid !== user.id
    ) as string[];

    for (const uid of notifyUsers) {
      await createNotification({
        userId: uid,
        taskId,
        type: 'COMMENT_ADDED',
        title: 'New comment on task',
        message: `${user.name} commented on ${task.taskId}: "${content.slice(0, 60)}..."`,
        actionUrl: `/tasks/${taskId}`,
      });
    }

    // Blocker detection
    if (!isInternal) {
      const blockerResult = await detectBlockersFromText(content);
      if (blockerResult.isBlocker) {
        // Auto-update status to blocked if detected
        const blockedStatus = await prisma.taskStatus.findFirst({ where: { name: 'BLOCKED' } });
        if (blockedStatus && task.status?.name !== 'BLOCKED') {
          // Just create a recommendation; don't auto-update
          await prisma.aIRecommendation.create({
            data: {
              type: 'BLOCKER',
              taskId,
              title: 'Potential blocker detected',
              message: blockerResult.description,
              reasoning: JSON.stringify({
                severity: blockerResult.severity,
                suggestedDepartment: blockerResult.suggestedDepartment,
                comment: content.slice(0, 200),
              }),
              confidence: 0.75,
            }
          });
        }
      }
    }

    broadcast({
      type: WSEventTypes.TASK_COMMENTED,
      payload: { taskId, taskCode: task.taskId, commenterName: user.name }
    });

    res.status(201).json(comment);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/comments/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const comment = await prisma.taskComment.findUnique({ where: { id: req.params.id } });
    if (!comment) throw new AppError('Comment not found', 404);
    if (comment.userId !== req.user!.id && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName)) {
      throw new AppError('You can only edit your own comments', 403);
    }

    const updated = await prisma.taskComment.update({
      where: { id: req.params.id },
      data: { content: req.body.content, isEdited: true },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    broadcast({
      type: WSEventTypes.TASK_COMMENTED,
      payload: { taskId: comment.taskId, commentId: updated.id, action: 'EDITED' }
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/comments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const comment = await prisma.taskComment.findUnique({ where: { id: req.params.id } });
    if (!comment) throw new AppError('Comment not found', 404);
    if (comment.userId !== req.user!.id && !['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName)) {
      throw new AppError('You can only delete your own comments', 403);
    }

    await prisma.taskComment.delete({ where: { id: req.params.id } });

    broadcast({
      type: WSEventTypes.TASK_COMMENTED,
      payload: { taskId: comment.taskId, commentId: req.params.id, action: 'DELETED' }
    });

    res.json({ message: 'Comment deleted' });
  } catch (err) {
    next(err);
  }
});

// POST /api/comments/:id/reactions
router.post('/:id/reactions', async (req, res, next) => {
  try {
    const { emoji } = req.body;
    if (!emoji) throw new AppError('Emoji required', 400);

    // Toggle reaction
    const existing = await prisma.commentReaction.findUnique({
      where: {
        commentId_userId_emoji: {
          commentId: req.params.id,
          userId: req.user!.id,
          emoji,
        }
      }
    });

    if (existing) {
      await prisma.commentReaction.delete({ where: { id: existing.id } });
      res.json({ removed: true, emoji });
    } else {
      const reaction = await prisma.commentReaction.create({
        data: { commentId: req.params.id, userId: req.user!.id, emoji }
      });

      broadcast({
        type: WSEventTypes.TASK_COMMENTED,
        payload: { commentId: req.params.id, emoji, action: 'REACTION' }
      });

      res.json({ added: true, reaction });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
