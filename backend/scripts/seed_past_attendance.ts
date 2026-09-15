import { prisma } from '../src/lib/prisma';

async function seedPast() {
  const user = await prisma.user.findFirst({ where: { email: 'rahul.kumar@snapserve.io' } });
  if (!user) return;

  console.log('Seeding 14 past days of attendance for Rahul Kumar...');
  const now = new Date();

  for (let i = 1; i <= 14; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue; // Skip weekends

    const dateStr = d.toISOString().split('T')[0];

    // 9:00 AM clock in
    const clockIn = new Date(d);
    clockIn.setHours(9, 2 + Math.floor(Math.random() * 15), 0, 0);

    // 5:30 PM clock out
    const clockOut = new Date(d);
    clockOut.setHours(17, 30 + Math.floor(Math.random() * 25), 0, 0);

    const verifiedHours = 7 + (Math.random() * 0.8);
    const verifiedSec = Math.floor(verifiedHours * 3600);
    const breakSec = 15 * 60;
    const lunchSec = 45 * 60;
    const meetingSec = Math.floor((25 + Math.random() * 35) * 60);
    const totalAttendanceSec = Math.floor((clockOut.getTime() - clockIn.getTime()) / 1000);

    await prisma.attendanceRecord.upsert({
      where: { userId_date: { userId: user.id, date: dateStr } },
      update: {},
      create: {
        userId: user.id,
        date: dateStr,
        status: 'PRESENT',
        currentState: 'WORKDAY_COMPLETED',
        clockIn,
        clockOut,
        attendanceMarkedAt: clockIn,
        workStartedAt: clockIn,
        workEndedAt: clockOut,
        verifiedWorkingSeconds: verifiedSec,
        breakSeconds: breakSec,
        lunchSeconds: lunchSec,
        meetingSeconds: meetingSec,
        faceMissingSeconds: 120,
        totalAttendanceSeconds: totalAttendanceSec,
        isCompleted: true,
      },
    });
  }
  console.log('Successfully seeded past attendance history!');
}

seedPast()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
