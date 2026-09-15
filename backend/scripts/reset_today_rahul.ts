import { prisma } from '../src/lib/prisma';

async function reset() {
  const todayStr = new Date().toISOString().split('T')[0];
  const users = await prisma.user.findMany({
    where: {
      email: {
        in: ['rahul.kumar@snapserve.io', 'superadmin1@snapserve.io'],
      },
    },
  });

  for (const user of users) {
    await prisma.attendanceRecord.deleteMany({ where: { userId: user.id, date: todayStr } });
    await prisma.employeeActivitySummary.deleteMany({ where: { userId: user.id, date: todayStr } });
    await prisma.attendanceEvent.deleteMany({ where: { userId: user.id, date: todayStr } });
    console.log(`Reset today record for ${user.name} (${user.email}) successfully`);
  }
}

reset()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
