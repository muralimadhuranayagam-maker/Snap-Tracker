import { prisma } from '../lib/prisma';

export interface WorkloadStats {
  userId: string;
  name: string;
  email: string;
  departmentCode: string;
  activeTasks: number;
  estimatedRemainingHours: number;
  overdueCount: number;
  blockedCount: number;
  capacityPercent: number; // 100% = full 8h/day workday
  status: 'HEALTHY' | 'HIGH' | 'OVERLOADED';
  deadlinePressure: 'LOW' | 'MEDIUM' | 'HIGH';
}

const WORK_HOURS_PER_DAY = 8;
const HIGH_THRESHOLD = 85;
const OVERLOAD_THRESHOLD = 100;

export async function calculateUserWorkload(userId: string): Promise<WorkloadStats | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { department: true }
  });
  if (!user) return null;

  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const activeTasks = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      isDeleted: false,
      status: {
        name: { notIn: ['DONE', 'CANCELLED'] }
      }
    },
    include: {
      status: true,
      priority: true,
      worklogs: {
        select: { hours: true }
      }
    }
  });

  const overdueCount = activeTasks.filter(
    t => t.dueDate && t.dueDate < now
  ).length;

  const blockedCount = activeTasks.filter(
    t => t.status?.name === 'BLOCKED'
  ).length;

  // Calculate remaining hours for each task
  let totalEstimatedRemaining = 0;
  for (const task of activeTasks) {
    const loggedHours = task.worklogs.reduce((sum, w) => sum + w.hours, 0);
    const estimated = task.estimatedHours || 4; // default 4h estimate
    const remaining = Math.max(0, estimated - loggedHours);
    totalEstimatedRemaining += remaining;
  }

  // Upcoming deadline pressure (tasks due in next 7 days)
  const urgentDeadlineCount = activeTasks.filter(
    t => t.dueDate && t.dueDate >= now && t.dueDate <= oneWeekFromNow
  ).length;

  // Capacity: based on remaining hours vs available hours this week
  const availableHoursThisWeek = WORK_HOURS_PER_DAY * 5; // 40h week
  const capacityPercent = Math.round((totalEstimatedRemaining / availableHoursThisWeek) * 100);

  let status: WorkloadStats['status'] = 'HEALTHY';
  if (capacityPercent >= OVERLOAD_THRESHOLD) status = 'OVERLOADED';
  else if (capacityPercent >= HIGH_THRESHOLD) status = 'HIGH';

  let deadlinePressure: WorkloadStats['deadlinePressure'] = 'LOW';
  if (urgentDeadlineCount >= 5) deadlinePressure = 'HIGH';
  else if (urgentDeadlineCount >= 2) deadlinePressure = 'MEDIUM';

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    departmentCode: user.department?.code || 'N/A',
    activeTasks: activeTasks.length,
    estimatedRemainingHours: Math.round(totalEstimatedRemaining * 10) / 10,
    overdueCount,
    blockedCount,
    capacityPercent,
    status,
    deadlinePressure,
  };
}

export async function getDepartmentWorkload(departmentId: string) {
  const members = await prisma.user.findMany({
    where: {
      departmentId,
      isActive: true,
      role: { name: 'EMPLOYEE' }
    },
    select: { id: true }
  });

  const workloads = await Promise.all(
    members.map(m => calculateUserWorkload(m.id))
  );

  return workloads.filter(Boolean) as WorkloadStats[];
}

export async function getAllWorkloads() {
  const employees = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true }
  });

  const workloads = await Promise.all(
    employees.map(e => calculateUserWorkload(e.id))
  );

  return workloads.filter(Boolean) as WorkloadStats[];
}

// AI Allocation: Score candidates for a task
export interface AllocCandidate {
  userId: string;
  name: string;
  departmentCode: string;
  matchScore: number; // 0-100
  workloadScore: number;
  skillScore: number;
  availabilityScore: number;
  factors: string[];
}

export async function scoreAllocCandidates(
  departmentId: string,
  estimatedHours: number = 4,
  taskTypeId?: string,
  excludeUserId?: string
): Promise<AllocCandidate[]> {
  const candidates = await prisma.user.findMany({
    where: {
      departmentId,
      isActive: true,
      role: { name: 'EMPLOYEE' },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    include: { department: true }
  });

  const scored: AllocCandidate[] = [];

  for (const candidate of candidates) {
    const workload = await calculateUserWorkload(candidate.id);
    if (!workload) continue;

    // Workload score: inverse of capacity usage (lower load = better score)
    const workloadScore = Math.max(0, 100 - workload.capacityPercent);

    // Availability score: penalize overloaded/high status
    let availabilityScore = 100;
    if (workload.status === 'OVERLOADED') availabilityScore = 20;
    else if (workload.status === 'HIGH') availabilityScore = 55;

    // Skill score: use historical task completion in similar type
    // In a real system this would query task history; we use a heuristic here
    const completedTasks = await prisma.task.count({
      where: {
        assigneeId: candidate.id,
        status: { name: 'DONE' },
        ...(taskTypeId ? { taskTypeId } : {}),
      }
    });
    const skillScore = Math.min(100, 50 + completedTasks * 5);

    // Weighted combined score
    const matchScore = Math.round(
      (workloadScore * 0.4) +
      (availabilityScore * 0.3) +
      (skillScore * 0.3)
    );

    const factors: string[] = [
      `Current capacity: ${workload.capacityPercent}%`,
      `Active tasks: ${workload.activeTasks}`,
      `Status: ${workload.status}`,
      `Completed similar tasks: ${completedTasks}`,
    ];

    scored.push({
      userId: candidate.id,
      name: candidate.name,
      departmentCode: candidate.department?.code || '',
      matchScore,
      workloadScore,
      skillScore,
      availabilityScore,
      factors,
    });
  }

  return scored.sort((a, b) => b.matchScore - a.matchScore);
}
