import { prisma } from '../lib/prisma';

/**
 * Workflow Execution Engine
 * Processes triggered events and runs associated workflows
 */

export async function executeWorkflows(trigger: string, payload: any) {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { trigger, isActive: true },
      include: { steps: { orderBy: { order: 'asc' } } }
    });

    for (const workflow of workflows) {
      const execution = await prisma.workflowExecution.create({
        data: {
          workflowId: workflow.id,
          triggeredBy: payload?.id,
          status: 'RUNNING',
        }
      });

      try {
        let config: any = {};
        try { config = JSON.parse(workflow.config); } catch { /* ok */ }

        // Execute each step
        for (const step of workflow.steps) {
          let stepConfig: any = {};
          try { stepConfig = JSON.parse(step.config); } catch { /* ok */ }

          if (step.type === 'CREATE_TASK') {
            await createRelatedTask(payload, stepConfig);
          } else if (step.type === 'NOTIFY') {
            await sendWorkflowNotification(payload, stepConfig);
          }
          // More step types can be added here
        }

        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { status: 'COMPLETED', completedAt: new Date() }
        });
      } catch (err: any) {
        await prisma.workflowExecution.update({
          where: { id: execution.id },
          data: { status: 'FAILED', error: err.message, completedAt: new Date() }
        });
        console.error(`[WORKFLOW] Workflow "${workflow.name}" failed:`, err);
      }
    }
  } catch (err) {
    console.error('[WORKFLOW] Failed to execute workflows:', err);
  }
}

async function createRelatedTask(triggerTask: any, config: any) {
  if (!triggerTask?.id) return;

  const dept = config.departmentCode
    ? await prisma.department.findFirst({ where: { code: config.departmentCode } })
    : null;

  const backlogStatus = await prisma.taskStatus.findFirst({ where: { name: 'BACKLOG' } });
  const medPriority = await prisma.taskPriority.findFirst({ where: { name: 'MEDIUM' } });
  const taskType = await prisma.taskType.findFirst({ where: { name: config.taskType || 'Task' } });

  // Count existing tasks in that dept for ID
  const deptCode = dept?.code || 'GEN';
  const count = await prisma.task.count({ where: { taskId: { startsWith: deptCode + '-' } } });
  const newTaskId = `${deptCode}-${1001 + count}`;

  await prisma.task.create({
    data: {
      taskId: newTaskId,
      title: config.title?.replace('{{triggerTitle}}', triggerTask.title) || `Follow-up: ${triggerTask.title}`,
      description: config.description || `Auto-generated from workflow. Triggered by: ${triggerTask.taskId}`,
      departmentId: dept?.id || triggerTask.departmentId,
      projectId: triggerTask.projectId,
      statusId: backlogStatus?.id,
      priorityId: medPriority?.id,
      taskTypeId: taskType?.id,
      reporterId: null,
    }
  });
}

async function sendWorkflowNotification(triggerTask: any, config: any) {
  if (!config.to || !triggerTask?.id) return;

  let targetUserIds: string[] = [];

  if (config.to === 'ASSIGNEE' && triggerTask.assigneeId) {
    targetUserIds = [triggerTask.assigneeId];
  } else if (config.to === 'ADMINS') {
    const admins = await prisma.user.findMany({
      where: { isActive: true, role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
      select: { id: true }
    });
    targetUserIds = admins.map(a => a.id);
  } else if (config.to === 'DEPARTMENT' && triggerTask.departmentId) {
    const members = await prisma.user.findMany({
      where: { departmentId: triggerTask.departmentId, isActive: true },
      select: { id: true }
    });
    targetUserIds = members.map(m => m.id);
  }

  for (const userId of targetUserIds) {
    await prisma.notification.create({
      data: {
        userId,
        taskId: triggerTask.id,
        type: 'TASK_ASSIGNED',
        title: config.title || 'Workflow notification',
        message: config.message?.replace('{{taskId}}', triggerTask.taskId) || `Workflow triggered for ${triggerTask.taskId}`,
        actionUrl: `/tasks/${triggerTask.id}`,
      }
    });
  }
}
