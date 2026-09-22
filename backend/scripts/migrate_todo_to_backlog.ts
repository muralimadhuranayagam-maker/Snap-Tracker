import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Updating task statuses and migrating TODO tasks to BACKLOG...');

  const statusOrders: Record<string, number> = {
    BACKLOG: 0,
    IN_PROGRESS: 1,
    BLOCKED: 2,
    IN_REVIEW: 3,
    DONE: 4,
    TODO: 10,
    APPROVED: 11,
    CANCELLED: 12,
  };

  for (const [name, order] of Object.entries(statusOrders)) {
    await prisma.taskStatus.updateMany({
      where: { name },
      data: { order }
    });
  }

  const backlogStatus = await prisma.taskStatus.findFirst({ where: { name: 'BACKLOG' } });
  const todoStatus = await prisma.taskStatus.findFirst({ where: { name: 'TODO' } });

  if (backlogStatus && todoStatus) {
    const updated = await prisma.task.updateMany({
      where: { statusId: todoStatus.id },
      data: { statusId: backlogStatus.id }
    });
    console.log(`✅ Migrated ${updated.count} tasks from TODO to BACKLOG.`);
  }

  console.log('✅ Task statuses successfully updated.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
