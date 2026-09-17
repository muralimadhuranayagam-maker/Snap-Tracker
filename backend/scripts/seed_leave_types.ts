import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const types = [
    { name: 'CASUAL_LEAVE',     label: 'Casual Leave',     description: 'For personal reasons or short unplanned absences', maxDaysPerYear: 12 },
    { name: 'SICK_LEAVE',       label: 'Sick Leave',       description: 'For medical illness or health-related absences',    maxDaysPerYear: 6  },
    { name: 'EARNED_LEAVE',     label: 'Earned Leave',     description: 'Privilege leave earned through service',            maxDaysPerYear: 15 },
    { name: 'MATERNITY_LEAVE',  label: 'Maternity Leave',  description: 'For female employees around childbirth',            maxDaysPerYear: 180},
    { name: 'PATERNITY_LEAVE',  label: 'Paternity Leave',  description: 'For male employees around childbirth',              maxDaysPerYear: 15 },
    { name: 'COMPENSATORY_OFF', label: 'Compensatory Off', description: 'Compensation for working on holidays/weekends',     maxDaysPerYear: 0  },
    { name: 'UNPAID_LEAVE',     label: 'Unpaid Leave',     description: 'Leave without pay when other leaves are exhausted', maxDaysPerYear: 0  },
  ];

  for (const t of types) {
    await prisma.leaveType.upsert({ where: { name: t.name }, update: t, create: t });
    console.log('Upserted:', t.label);
  }
  console.log('Done!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
