import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
const prisma = new PrismaClient();

async function clean() {
  const user = await prisma.user.findFirst({ where: { email: 'rahul.kumar@snapserve.io' } });
  if (!user) return;
  const jwtSecret = process.env.JWT_SECRET || 'snapserve-super-secure-secret-key-2026';
  const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '1h' });

  const res = await fetch('http://localhost:4000/api/attendance/my-history?range=monthly', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  console.log('Response status:', res.status);
  console.log('Records returned:', data.records?.length, data);
}

clean()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
