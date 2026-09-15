import { prisma } from '../lib/prisma';

async function mapRemainingTasks() {
  await prisma.task.updateMany({
    where: { id: 'task-mkt-1006' },
    data: { projectId: 'proj-q3-campaign' }
  });

  await prisma.task.updateMany({
    where: { id: 'task-sal-1006' },
    data: { projectId: 'proj-sales-pipeline' }
  });

  const unmapped = await prisma.task.findMany({
    where: { isDeleted: false, projectId: null },
    select: { id: true, taskId: true }
  });

  for (const t of unmapped) {
    await prisma.task.update({
      where: { id: t.id },
      data: { projectId: 'proj-platform-v2' }
    });
    console.log(`Mapped ${t.taskId} to Platform v2.0`);
  }

  const total = await prisma.task.count({ where: { isDeleted: false } });
  const mapped = await prisma.task.count({ where: { isDeleted: false, projectId: { not: null } } });
  const unmappedCount = await prisma.task.count({ where: { isDeleted: false, projectId: null } });

  console.log({ total, mapped, unmappedCount });
}

mapRemainingTasks()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
