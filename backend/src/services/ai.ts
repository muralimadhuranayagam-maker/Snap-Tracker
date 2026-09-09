/**
 * AI Intelligence Service
 *
 * Dual-engine architecture:
 * 1. Deterministic heuristic engine (always available, fast, explainable)
 * 2. LLM semantic engine (optional, for natural language tasks, summaries, chat)
 *
 * The application NEVER fails when LLM is unavailable.
 */

import { prisma } from '../lib/prisma';
import { scoreAllocCandidates, calculateUserWorkload } from './workload';
import { AuthUser } from '../middleware/auth';
import { differenceInDays, differenceInHours, format, addDays } from 'date-fns';

// ─── TASK PRIORITY SCORING ────────────────────────────────────────────────────

export interface PriorityScoreResult {
  score: number; // 0-100
  factors: string[];
  recommendedPriority: string;
}

export async function calculateTaskPriorityScore(taskId: string): Promise<PriorityScoreResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      priority: true,
      status: true,
      department: true,
      blockingDeps: { include: { target: { include: { status: true } } } },
    }
  });

  if (!task) return { score: 50, factors: [], recommendedPriority: 'MEDIUM' };

  let score = 50;
  const factors: string[] = [];
  const now = new Date();

  // Deadline proximity (0-30 points)
  if (task.dueDate) {
    const daysLeft = differenceInDays(task.dueDate, now);
    if (daysLeft < 0) {
      score += 30;
      factors.push(`Overdue by ${Math.abs(daysLeft)} days`);
    } else if (daysLeft === 0) {
      score += 28;
      factors.push('Due today');
    } else if (daysLeft <= 1) {
      score += 25;
      factors.push('Due tomorrow');
    } else if (daysLeft <= 3) {
      score += 20;
      factors.push(`Due in ${daysLeft} days`);
    } else if (daysLeft <= 7) {
      score += 12;
      factors.push('Due this week');
    }
  }

  // Existing priority level (0-20 points)
  const priorityLevels: Record<string, number> = {
    CRITICAL: 20, URGENT: 16, HIGH: 12, MEDIUM: 6, LOW: 0
  };
  const priorityPoints = priorityLevels[task.priority?.name || 'MEDIUM'] || 6;
  score += priorityPoints;
  if (task.priority?.name) factors.push(`Priority: ${task.priority.name}`);

  // Blocked downstream tasks (0-20 points)
  const blockingCount = task.blockingDeps.filter(
    d => !['DONE', 'CANCELLED'].includes(d.target.status?.name || '')
  ).length;
  if (blockingCount > 0) {
    const blockingPoints = Math.min(20, blockingCount * 7);
    score += blockingPoints;
    factors.push(`Blocking ${blockingCount} other task(s)`);
  }

  // Task age (0-10 points for stale tasks)
  const ageInDays = differenceInDays(now, task.createdAt);
  if (ageInDays > 14) {
    score += 8;
    factors.push(`Task is ${ageInDays} days old`);
  } else if (ageInDays > 7) {
    score += 4;
    factors.push(`Task is ${ageInDays} days old`);
  }

  score = Math.min(100, Math.max(0, score));

  let recommendedPriority = 'MEDIUM';
  if (score >= 85) recommendedPriority = 'CRITICAL';
  else if (score >= 70) recommendedPriority = 'URGENT';
  else if (score >= 55) recommendedPriority = 'HIGH';
  else if (score >= 35) recommendedPriority = 'MEDIUM';
  else recommendedPriority = 'LOW';

  return { score, factors, recommendedPriority };
}

// ─── DEADLINE RISK PREDICTION ─────────────────────────────────────────────────

export interface DeadlineRiskResult {
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  riskScore: number; // 0-100
  probability: number; // 0-1 (0.78 = 78% chance of missing)
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: string[];
  explanation: string;
}

export async function predictDeadlineRisk(taskId: string): Promise<DeadlineRiskResult> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: true,
      status: true,
      priority: true,
      worklogs: { select: { hours: true } },
      blockedByDeps: {
        include: {
          source: { include: { status: true } }
        }
      }
    }
  });

  if (!task || !task.dueDate) {
    return {
      risk: 'LOW', riskScore: 0, probability: 0.1,
      confidence: 'LOW', factors: [], explanation: 'No due date set'
    };
  }

  const now = new Date();
  const daysLeft = differenceInDays(task.dueDate, now);
  const hoursLeft = differenceInHours(task.dueDate, now);
  const factors: string[] = [];
  let riskScore = 0;

  // Hours remaining vs estimated
  const loggedHours = task.worklogs.reduce((s, w) => s + w.hours, 0);
  const estimatedHours = task.estimatedHours || 8;
  const remainingHours = Math.max(0, estimatedHours - loggedHours);

  if (remainingHours > hoursLeft && hoursLeft > 0) {
    riskScore += 40;
    factors.push(`${remainingHours.toFixed(1)}h of work remaining but only ${hoursLeft}h until deadline`);
  } else if (remainingHours > hoursLeft * 1.5) {
    riskScore += 25;
  }

  // Deadline proximity
  if (daysLeft < 0) {
    riskScore += 50;
    factors.push(`Already overdue by ${Math.abs(daysLeft)} days`);
  } else if (daysLeft === 0) {
    riskScore += 35;
    factors.push('Due today');
  } else if (daysLeft <= 2) {
    riskScore += 25;
    factors.push(`Only ${daysLeft} day(s) remaining`);
  }

  // Blocked by upstream dependencies
  const activeBlockers = task.blockedByDeps.filter(
    dep => !['DONE', 'CANCELLED'].includes(dep.source.status?.name || '')
  );
  if (activeBlockers.length > 0) {
    riskScore += activeBlockers.length * 15;
    factors.push(`Blocked by ${activeBlockers.length} upstream task(s)`);
  }

  // Assignee workload
  if (task.assigneeId) {
    const workload = await calculateUserWorkload(task.assigneeId);
    if (workload?.status === 'OVERLOADED') {
      riskScore += 20;
      factors.push(`Assignee is overloaded (${workload.capacityPercent}% capacity)`);
    } else if (workload?.status === 'HIGH') {
      riskScore += 10;
      factors.push(`Assignee workload is high (${workload.capacityPercent}%)`);
    }
  }

  riskScore = Math.min(100, riskScore);

  let risk: DeadlineRiskResult['risk'] = 'LOW';
  let probability = 0.1;
  if (riskScore >= 80) { risk = 'CRITICAL'; probability = 0.90; }
  else if (riskScore >= 60) { risk = 'HIGH'; probability = 0.70; }
  else if (riskScore >= 35) { risk = 'MEDIUM'; probability = 0.45; }
  else { risk = 'LOW'; probability = 0.15; }

  const confidence: DeadlineRiskResult['confidence'] =
    factors.length >= 3 ? 'HIGH' : factors.length >= 1 ? 'MEDIUM' : 'LOW';

  const explanation = factors.length > 0
    ? `Deadline risk is ${risk} (${Math.round(probability * 100)}% probability of missing). Key factors: ${factors.join('; ')}.`
    : `Task appears on track with no major risk factors detected.`;

  return { risk, riskScore, probability, confidence, factors, explanation };
}

// ─── AI DAILY PLANNER ────────────────────────────────────────────────────────

export interface DailyPlanBlock {
  startTime: string;
  endTime: string;
  taskId: string;
  taskCode: string;
  taskTitle: string;
  priority: string;
  estimatedHours: number;
  reason: string;
}

export interface DailyPlanResult {
  date: string;
  blocks: DailyPlanBlock[];
  totalHours: number;
  reasoning: string;
}

export async function generateDailyPlan(userId: string): Promise<DailyPlanResult> {
  const now = new Date();

  const tasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      isDeleted: false,
      status: { name: { notIn: ['DONE', 'CANCELLED', 'BLOCKED'] } }
    },
    include: {
      status: true,
      priority: true,
      worklogs: { select: { hours: true } }
    },
    orderBy: [
      { dueDate: 'asc' },
    ]
  });

  // Score each task for daily priority
  const scored = tasks.map(task => {
    const loggedHours = task.worklogs.reduce((s, w) => s + w.hours, 0);
    const estimatedRemaining = Math.max(0, (task.estimatedHours || 4) - loggedHours);
    const daysLeft = task.dueDate ? differenceInDays(task.dueDate, now) : 999;

    let score = 0;
    if (daysLeft < 0) score += 100;
    else if (daysLeft === 0) score += 80;
    else if (daysLeft <= 2) score += 60;
    else if (daysLeft <= 7) score += 30;

    const priorityBonus: Record<string, number> = {
      CRITICAL: 50, URGENT: 40, HIGH: 30, MEDIUM: 15, LOW: 0
    };
    score += priorityBonus[task.priority?.name || 'MEDIUM'] || 15;

    return { task, score, estimatedRemaining, daysLeft };
  });

  scored.sort((a, b) => b.score - a.score);

  // Build time blocks (9 AM start, 8h day with 1h lunch)
  const blocks: DailyPlanBlock[] = [];
  let currentHour = 9;
  let totalHours = 0;
  const MAX_HOURS = 7; // 7 working hours (9am-5pm minus 1h lunch)

  for (const item of scored) {
    if (totalHours >= MAX_HOURS) break;
    if (currentHour >= 12 && currentHour < 13) currentHour = 13; // lunch break

    const hoursToAllocate = Math.min(item.estimatedRemaining, MAX_HOURS - totalHours, 3);
    if (hoursToAllocate <= 0.25) continue;

    const startH = Math.floor(currentHour);
    const startMin = Math.round((currentHour - startH) * 60);
    const endHour = currentHour + hoursToAllocate;
    const endH = Math.floor(endHour);
    const endMin = Math.round((endHour - endH) * 60);

    const reason = item.daysLeft < 0
      ? 'Overdue — prioritized urgently'
      : item.daysLeft === 0
        ? 'Due today — critical priority'
        : item.task.priority?.name === 'CRITICAL' || item.task.priority?.name === 'URGENT'
          ? `${item.task.priority.name} priority task`
          : `Due in ${item.daysLeft} days`;

    blocks.push({
      startTime: `${String(startH).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`,
      endTime: `${String(endH).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`,
      taskId: item.task.id,
      taskCode: item.task.taskId,
      taskTitle: item.task.title,
      priority: item.task.priority?.name || 'MEDIUM',
      estimatedHours: hoursToAllocate,
      reason,
    });

    currentHour = endHour;
    totalHours += hoursToAllocate;
  }

  return {
    date: format(now, 'yyyy-MM-dd'),
    blocks,
    totalHours: Math.round(totalHours * 10) / 10,
    reasoning: `Your daily plan prioritizes overdue tasks first, then by deadline proximity and priority level. ${blocks.length} tasks scheduled for ${Math.round(totalHours * 10) / 10}h today.`,
  };
}

// ─── AI PROJECT HEALTH ────────────────────────────────────────────────────────

export interface ProjectHealthResult {
  health: 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
  healthScore: number; // 0-100 (higher = healthier)
  riskFactors: string[];
  positiveFactors: string[];
  recommendations: string[];
}

export async function assessProjectHealth(projectId: string): Promise<ProjectHealthResult> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        where: { isDeleted: false },
        include: { status: true, priority: true }
      },
      milestones: true,
      members: true,
    }
  });

  if (!project) return { health: 'HEALTHY', healthScore: 100, riskFactors: [], positiveFactors: [], recommendations: [] };

  const now = new Date();
  const tasks = project.tasks;
  const riskFactors: string[] = [];
  const positiveFactors: string[] = [];
  const recommendations: string[] = [];

  let healthScore = 100;

  if (tasks.length === 0) {
    return { health: 'HEALTHY', healthScore: 90, riskFactors: [], positiveFactors: ['No tasks yet'], recommendations: ['Add tasks to start tracking progress'] };
  }

  const doneTasks = tasks.filter(t => t.status?.name === 'DONE');
  const blockedTasks = tasks.filter(t => t.status?.name === 'BLOCKED');
  const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < now && !['DONE', 'CANCELLED'].includes(t.status?.name || ''));
  const criticalTasks = tasks.filter(t => ['CRITICAL', 'URGENT'].includes(t.priority?.name || '') && !['DONE', 'CANCELLED'].includes(t.status?.name || ''));

  const completionRate = tasks.length > 0 ? (doneTasks.length / tasks.length) : 0;

  // Completion rate
  if (completionRate >= 0.8) {
    positiveFactors.push(`${Math.round(completionRate * 100)}% tasks completed`);
  } else if (completionRate < 0.3 && project.dueDate && differenceInDays(project.dueDate, now) < 7) {
    healthScore -= 25;
    riskFactors.push(`Only ${Math.round(completionRate * 100)}% complete with deadline approaching`);
    recommendations.push('Prioritize completing in-progress tasks before taking new ones');
  }

  // Blocked tasks
  if (blockedTasks.length > 0) {
    const blockedPct = Math.round((blockedTasks.length / tasks.length) * 100);
    healthScore -= blockedTasks.length * 8;
    riskFactors.push(`${blockedTasks.length} tasks are blocked (${blockedPct}% of project)`);
    recommendations.push('Resolve blockers immediately to avoid cascade delays');
  }

  // Overdue tasks
  if (overdueTasks.length > 0) {
    healthScore -= overdueTasks.length * 10;
    riskFactors.push(`${overdueTasks.length} overdue task(s)`);
    recommendations.push(`Immediately address ${overdueTasks.length} overdue tasks`);
  }

  // Critical/Urgent open tasks
  if (criticalTasks.length > 0) {
    healthScore -= criticalTasks.length * 5;
    riskFactors.push(`${criticalTasks.length} critical/urgent task(s) pending`);
  }

  // Project deadline
  if (project.dueDate) {
    const daysLeft = differenceInDays(project.dueDate, now);
    if (daysLeft < 0) {
      healthScore -= 30;
      riskFactors.push(`Project deadline passed ${Math.abs(daysLeft)} days ago`);
    } else if (daysLeft <= 3 && completionRate < 0.9) {
      healthScore -= 20;
      riskFactors.push(`Deadline in ${daysLeft} days with ${Math.round(completionRate * 100)}% completion`);
    }
  }

  if (doneTasks.length > 0) {
    positiveFactors.push(`${doneTasks.length} tasks completed`);
  }
  if (blockedTasks.length === 0 && tasks.length > 0) {
    positiveFactors.push('No blocked tasks');
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  let health: ProjectHealthResult['health'] = 'HEALTHY';
  if (healthScore < 40) health = 'CRITICAL';
  else if (healthScore < 70) health = 'AT_RISK';

  return { health, healthScore, riskFactors, positiveFactors, recommendations };
}

// ─── AI BLOCKER DETECTION ────────────────────────────────────────────────────

export async function detectBlockersFromText(text: string): Promise<{
  isBlocker: boolean;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  description: string;
  suggestedDepartment?: string;
}> {
  const blockerPhrases = [
    'waiting for', 'blocked by', 'pending', 'need from', 'waiting on',
    'not received', 'missing', 'stuck', 'cannot proceed', 'dependency',
    'holding up', 'need access', 'need credentials', 'need approval',
    "can't continue", 'halted', 'paused until'
  ];

  const lowerText = text.toLowerCase();
  const isBlocker = blockerPhrases.some(phrase => lowerText.includes(phrase));

  if (!isBlocker) return { isBlocker: false, severity: 'LOW', description: '' };

  let severity: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (lowerText.includes('critical') || lowerText.includes('urgent') || lowerText.includes('production')) {
    severity = 'HIGH';
  }

  // Detect which department is being referenced
  let suggestedDepartment: string | undefined;
  if (lowerText.includes('sales')) suggestedDepartment = 'Sales';
  else if (lowerText.includes('fde') || lowerText.includes('engineering') || lowerText.includes('dev')) suggestedDepartment = 'FDE';
  else if (lowerText.includes('marketing') || lowerText.includes('content')) suggestedDepartment = 'Marketing';

  return {
    isBlocker: true,
    severity,
    description: `Potential blocker detected: "${text.slice(0, 100)}"`,
    suggestedDepartment,
  };
}

// ─── NATURAL LANGUAGE TASK PARSING ───────────────────────────────────────────

export interface ParsedTaskIntent {
  title?: string;
  department?: string;
  departmentCode?: string;
  priority?: string;
  assigneeName?: string;
  taskType?: string;
  dueDate?: Date;
  description?: string;
  confidence: number;
  missingFields: string[];
}

export async function parseNaturalLanguageTask(input: string): Promise<ParsedTaskIntent> {
  const now = new Date();
  const result: ParsedTaskIntent = {
    confidence: 0.6,
    missingFields: [],
  };

  const lower = input.toLowerCase();

  // Priority detection
  if (lower.includes('critical')) result.priority = 'CRITICAL';
  else if (lower.includes('urgent')) result.priority = 'URGENT';
  else if (lower.includes('high priority') || lower.includes('high-priority')) result.priority = 'HIGH';
  else if (lower.includes('low priority') || lower.includes('low-priority')) result.priority = 'LOW';
  else if (lower.includes('high')) result.priority = 'HIGH';
  else if (lower.includes('medium')) result.priority = 'MEDIUM';

  // Department detection
  if (lower.includes(' fde ') || lower.includes('fde task') || lower.includes('engineering') || lower.includes('developer')) {
    result.department = 'FDE';
    result.departmentCode = 'FDE';
  } else if (lower.includes('marketing') || lower.includes('campaign') || lower.includes('content')) {
    result.department = 'Marketing';
    result.departmentCode = 'MKT';
  } else if (lower.includes('sales') || lower.includes('customer') || lower.includes('client')) {
    result.department = 'Sales';
    result.departmentCode = 'SAL';
  }

  // Task type detection
  if (lower.includes('bug') || lower.includes('fix') || lower.includes('issue')) result.taskType = 'Bug';
  else if (lower.includes('feature') || lower.includes('implement')) result.taskType = 'Feature';
  else if (lower.includes('document') || lower.includes('docs')) result.taskType = 'Documentation';
  else if (lower.includes('research') || lower.includes('investigate')) result.taskType = 'Research';
  else if (lower.includes('meeting') || lower.includes('call')) result.taskType = 'Meeting';
  else if (lower.includes('customer') || lower.includes('client issue')) result.taskType = 'Customer Issue';
  else result.taskType = 'Task';

  // Due date detection
  if (lower.includes('today')) {
    result.dueDate = now;
  } else if (lower.includes('tomorrow')) {
    result.dueDate = addDays(now, 1);
  } else if (lower.includes('friday')) {
    const day = now.getDay();
    const daysUntilFriday = (5 - day + 7) % 7 || 7;
    result.dueDate = addDays(now, daysUntilFriday);
  } else if (lower.includes('next week')) {
    result.dueDate = addDays(now, 7);
  } else if (lower.includes('end of week')) {
    const day = now.getDay();
    result.dueDate = addDays(now, 5 - day);
  } else if (lower.includes('monday')) {
    const day = now.getDay();
    const daysUntilMonday = (1 - day + 7) % 7 || 7;
    result.dueDate = addDays(now, daysUntilMonday);
  }

  // Look for assignee in users
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  });

  for (const user of users) {
    const firstName = user.name.split(' ')[0].toLowerCase();
    if (lower.includes(firstName)) {
      result.assigneeName = user.name;
      result.confidence += 0.1;
      break;
    }
  }

  // Build title from the input
  result.title = input
    .replace(/create (a |an )?(high|low|medium|urgent|critical)?(-priority)? (fde|marketing|sales)? ?task (for \w+ )?/gi, '')
    .replace(/(by friday|by monday|by tomorrow|today|next week|end of week)/gi, '')
    .replace(/  +/g, ' ')
    .trim();

  if (!result.title || result.title.length < 3) {
    result.missingFields.push('title');
  }
  if (!result.department) result.missingFields.push('department');
  if (!result.priority) {
    result.priority = 'MEDIUM';
  }

  return result;
}

// ─── AI TASK BREAKDOWN ────────────────────────────────────────────────────────

export async function generateTaskBreakdown(title: string, description: string = ''): Promise<{
  subtasks: Array<{ title: string; estimatedHours: number; order: number }>;
  reasoning: string;
}> {
  const lower = (title + ' ' + description).toLowerCase();

  // Heuristic breakdown patterns based on task type keywords
  let subtasks: Array<{ title: string; estimatedHours: number; order: number }> = [];

  if (lower.includes('implement') || lower.includes('develop') || lower.includes('build')) {
    subtasks = [
      { title: 'Gather and clarify requirements', estimatedHours: 1, order: 1 },
      { title: 'Technical design and planning', estimatedHours: 2, order: 2 },
      { title: 'Database / schema changes', estimatedHours: 2, order: 3 },
      { title: 'Backend implementation', estimatedHours: 4, order: 4 },
      { title: 'Frontend implementation', estimatedHours: 3, order: 5 },
      { title: 'Unit and integration testing', estimatedHours: 2, order: 6 },
      { title: 'Documentation', estimatedHours: 1, order: 7 },
      { title: 'Code review and QA', estimatedHours: 1, order: 8 },
      { title: 'Deployment and monitoring', estimatedHours: 1, order: 9 },
    ];
  } else if (lower.includes('campaign') || lower.includes('marketing')) {
    subtasks = [
      { title: 'Define campaign objectives and KPIs', estimatedHours: 1, order: 1 },
      { title: 'Audience research and segmentation', estimatedHours: 2, order: 2 },
      { title: 'Content brief and copy writing', estimatedHours: 3, order: 3 },
      { title: 'Design assets and visuals', estimatedHours: 4, order: 4 },
      { title: 'Internal review and approval', estimatedHours: 1, order: 5 },
      { title: 'Campaign setup and scheduling', estimatedHours: 2, order: 6 },
      { title: 'Launch and monitor', estimatedHours: 1, order: 7 },
      { title: 'Performance reporting', estimatedHours: 2, order: 8 },
    ];
  } else if (lower.includes('customer') || lower.includes('onboard') || lower.includes('client')) {
    subtasks = [
      { title: 'Initial discovery call and requirement gathering', estimatedHours: 1, order: 1 },
      { title: 'Define scope and deliverables', estimatedHours: 1, order: 2 },
      { title: 'Technical setup and configuration', estimatedHours: 3, order: 3 },
      { title: 'Integration and data migration', estimatedHours: 4, order: 4 },
      { title: 'Testing with customer sandbox', estimatedHours: 2, order: 5 },
      { title: 'Customer training and documentation', estimatedHours: 2, order: 6 },
      { title: 'Go-live and hypercare monitoring', estimatedHours: 2, order: 7 },
      { title: 'Post-launch review and sign-off', estimatedHours: 1, order: 8 },
    ];
  } else if (lower.includes('bug') || lower.includes('fix') || lower.includes('issue')) {
    subtasks = [
      { title: 'Reproduce and verify the issue', estimatedHours: 1, order: 1 },
      { title: 'Root cause analysis', estimatedHours: 2, order: 2 },
      { title: 'Implement fix', estimatedHours: 2, order: 3 },
      { title: 'Write regression test', estimatedHours: 1, order: 4 },
      { title: 'Code review', estimatedHours: 0.5, order: 5 },
      { title: 'Deploy and verify in production', estimatedHours: 0.5, order: 6 },
    ];
  } else {
    subtasks = [
      { title: 'Define requirements and acceptance criteria', estimatedHours: 1, order: 1 },
      { title: 'Plan and estimate work', estimatedHours: 0.5, order: 2 },
      { title: 'Execute core work', estimatedHours: 3, order: 3 },
      { title: 'Review and quality check', estimatedHours: 1, order: 4 },
      { title: 'Finalize and close', estimatedHours: 0.5, order: 5 },
    ];
  }

  return {
    subtasks,
    reasoning: `Suggested ${subtasks.length} subtasks based on the task type and scope. Estimated total: ${subtasks.reduce((s, t) => s + t.estimatedHours, 0)}h. You can accept, modify, or reject individual subtasks.`,
  };
}

// ─── AI CHAT (Heuristic + Optional LLM) ──────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function processAIChat(
  message: string,
  user: AuthUser,
  history: ChatMessage[] = []
): Promise<{ response: string; actions?: any[] }> {
  const lower = message.toLowerCase();
  const now = new Date();

  // Build permission-aware context
  const isSuperAdmin = user.roleName === 'SUPER_ADMIN';
  const isAdmin = user.roleName === 'ADMIN';
  const isEmployee = user.roleName === 'EMPLOYEE';

  // ── INTENT: My tasks ─────────────────────────────────────────────────────
  if (lower.includes('my task') || lower.includes('my work') || lower.includes('assigned to me')) {
    const tasks = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        isDeleted: false,
        status: { name: { notIn: ['DONE', 'CANCELLED'] } }
      },
      include: { status: true, priority: true },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    if (tasks.length === 0) return { response: "You don't have any active tasks assigned to you right now." };

    const taskList = tasks.map(t =>
      `• **${t.taskId}** — ${t.title} [${t.priority?.name || 'MEDIUM'}] ${t.dueDate ? `(due ${format(t.dueDate, 'MMM d')})` : ''}`
    ).join('\n');

    return { response: `You have **${tasks.length}** active tasks:\n\n${taskList}` };
  }

  // ── INTENT: What to work on next ─────────────────────────────────────────
  if (lower.includes('what should i work') || lower.includes('next task') || lower.includes('work on next')) {
    const plan = await generateDailyPlan(user.id);
    if (plan.blocks.length === 0) return { response: "You have no active tasks. Enjoy the downtime or check with your Admin for new assignments!" };

    const topTask = plan.blocks[0];
    return {
      response: `Based on your deadlines and priorities, I recommend starting with:\n\n**${topTask.taskCode}** — ${topTask.taskTitle}\n\nReason: ${topTask.reason}\n\nEstimated time: ${topTask.estimatedHours}h\n\nWould you like to see your full daily plan?`
    };
  }

  // ── INTENT: Overdue tasks ────────────────────────────────────────────────
  if (lower.includes('overdue')) {
    const where: any = {
      dueDate: { lt: now },
      isDeleted: false,
      status: { name: { notIn: ['DONE', 'CANCELLED'] } }
    };

    // RBAC: employees can only see their own overdue
    if (isEmployee) where.assigneeId = user.id;

    const tasks = await prisma.task.findMany({
      where,
      include: { assignee: true, priority: true, status: true },
      orderBy: { dueDate: 'asc' },
      take: 10,
    });

    if (tasks.length === 0) return { response: 'No overdue tasks found! Everything is on track.' };

    const taskList = tasks.map(t => {
      const daysOverdue = differenceInDays(now, t.dueDate!);
      return `• **${t.taskId}** — ${t.title} [${t.priority?.name}] — ${daysOverdue}d overdue${isAdmin || isSuperAdmin ? ` — ${t.assignee?.name || 'Unassigned'}` : ''}`;
    }).join('\n');

    return { response: `Found **${tasks.length}** overdue task(s):\n\n${taskList}` };
  }

  // ── INTENT: Who is overloaded (admin/super admin only) ────────────────────
  if (lower.includes('overload') || lower.includes('who is overloaded')) {
    if (isEmployee) return { response: "I can only show you your own workload. Please contact your Admin for team workload information." };

    const { getAllWorkloads } = await import('./workload');
    const workloads = await getAllWorkloads();
    const overloaded = workloads.filter(w => w.status === 'OVERLOADED');

    if (overloaded.length === 0) return { response: 'No team members are currently overloaded. The team workload is balanced.' };

    const list = overloaded.map(w =>
      `• **${w.name}** (${w.departmentCode}) — ${w.capacityPercent}% capacity, ${w.activeTasks} active tasks, ${w.estimatedRemainingHours}h remaining`
    ).join('\n');

    return {
      response: `**${overloaded.length}** team member(s) are currently overloaded:\n\n${list}\n\nConsider redistributing their tasks to balance the workload.`
    };
  }

  // ── INTENT: Blocked tasks ─────────────────────────────────────────────────
  if (lower.includes('blocked')) {
    const where: any = {
      isDeleted: false,
      status: { name: 'BLOCKED' }
    };

    if (isEmployee) where.assigneeId = user.id;

    // Department filter
    if (lower.includes('fde') && !isEmployee) {
      const dept = await prisma.department.findFirst({ where: { code: 'FDE' } });
      if (dept) where.departmentId = dept.id;
    } else if (lower.includes('sales') && !isEmployee) {
      const dept = await prisma.department.findFirst({ where: { code: 'SAL' } });
      if (dept) where.departmentId = dept.id;
    } else if (lower.includes('marketing') && !isEmployee) {
      const dept = await prisma.department.findFirst({ where: { code: 'MKT' } });
      if (dept) where.departmentId = dept.id;
    }

    const tasks = await prisma.task.findMany({
      where,
      include: { assignee: true, priority: true, department: true },
      take: 10,
    });

    if (tasks.length === 0) return { response: 'No blocked tasks found!' };

    const list = tasks.map(t =>
      `• **${t.taskId}** — ${t.title} [${t.department?.code}]${isAdmin || isSuperAdmin ? ` — ${t.assignee?.name || 'Unassigned'}` : ''}`
    ).join('\n');

    return { response: `**${tasks.length}** blocked task(s):\n\n${list}` };
  }

  // ── INTENT: Project summary / status ──────────────────────────────────────
  if (lower.includes('project') && (lower.includes('summar') || lower.includes('status') || lower.includes('at risk'))) {
    const projects = await prisma.project.findMany({
      where: { isArchived: false },
      include: {
        tasks: {
          where: { isDeleted: false },
          include: { status: true }
        }
      },
      take: 10,
    });

    const healthMap = await Promise.all(
      projects.map(async p => ({ project: p, health: await assessProjectHealth(p.id) }))
    );

    const atRisk = healthMap.filter(h => h.health.health !== 'HEALTHY');
    if (atRisk.length === 0) return { response: 'All projects are currently healthy! No risks detected.' };

    const list = atRisk.map(h =>
      `• **${h.project.name}** — ${h.health.health} (score: ${h.health.healthScore}/100)\n  ${h.health.riskFactors.slice(0, 2).join('; ')}`
    ).join('\n\n');

    return { response: `**${atRisk.length}** project(s) need attention:\n\n${list}` };
  }

  // ── INTENT: Team summary (Super Admin only) ────────────────────────────────
  if (isSuperAdmin && (lower.includes('what is happening') || lower.includes('company today') || lower.includes('executive summary'))) {
    const [totalTasks, doneTasks, overdueTasks, blockedTasks, activeProjects] = await Promise.all([
      prisma.task.count({ where: { isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { status: { name: 'DONE' }, updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) } } }),
      prisma.task.count({ where: { dueDate: { lt: now }, isDeleted: false, status: { name: { notIn: ['DONE', 'CANCELLED'] } } } }),
      prisma.task.count({ where: { isDeleted: false, status: { name: 'BLOCKED' } } }),
      prisma.project.count({ where: { status: 'ACTIVE', isArchived: false } }),
    ]);

    const { getAllWorkloads } = await import('./workload');
    const workloads = await getAllWorkloads();
    const overloaded = workloads.filter(w => w.status === 'OVERLOADED').length;

    return {
      response: `## Company Overview\n\n📊 **Active Tasks**: ${totalTasks}\n✅ **Completed Today**: ${doneTasks}\n⚠️ **Overdue**: ${overdueTasks}\n🔴 **Blocked**: ${blockedTasks}\n📁 **Active Projects**: ${activeProjects}\n👥 **Overloaded Employees**: ${overloaded}\n\n${overloaded > 0 ? `⚡ **Recommendation**: ${overloaded} employee(s) are overloaded. Review workload distribution.` : '✅ Team workload appears balanced.'}\n${overdueTasks > 0 ? `\n🚨 **Action Required**: ${overdueTasks} overdue tasks need immediate attention.` : ''}`
    };
  }

  // ── DEFAULT ───────────────────────────────────────────────────────────────
  return {
    response: `I understand you're asking about: *"${message}"*\n\nHere are things I can help with:\n• **My tasks** — Show your assigned tasks\n• **What should I work on?** — Get prioritized recommendations\n• **Overdue tasks** — Find tasks past their deadline\n• **Blocked tasks** — Find blocked tasks${isAdmin || isSuperAdmin ? '\n• **Who is overloaded?** — Team workload overview\n• **Project status** — Project health and at-risk projects\n• **Company overview** — Executive summary' : ''}\n\nWhat would you like to know?`
  };
}
