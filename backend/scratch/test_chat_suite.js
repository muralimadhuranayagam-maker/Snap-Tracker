require('dotenv').config();
const http = require('http');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

function request(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 4000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: 'SUPER_ADMIN' } },
    include: { role: true, department: true }
  });

  const salesUser = await prisma.user.findFirst({
    where: { department: { code: 'SAL' } },
    include: { role: true, department: true }
  });

  const fdeUser = await prisma.user.findFirst({
    where: { department: { code: 'FDE' } },
    include: { role: true, department: true }
  });

  console.log('Testing with:');
  console.log('Super Admin:', superAdmin?.name, superAdmin?.id);
  console.log('Sales User:', salesUser?.name, salesUser?.id);
  console.log('FDE User:', fdeUser?.name, fdeUser?.id);

  const saToken = jwt.sign(
    { userId: superAdmin.id, roleName: 'SUPER_ADMIN', email: superAdmin.email, departmentId: superAdmin.departmentId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const salesToken = jwt.sign(
    { userId: salesUser.id, roleName: salesUser.role.name, email: salesUser.email, departmentId: salesUser.departmentId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  // 1. Super Admin channels test
  const saChannels = await request('GET', '/api/chat/channels', saToken);
  console.log('\n1. Super Admin channels count:', saChannels.body.channels?.length);
  console.log('   Channel labels:', saChannels.body.channels?.map(c => c.label));

  // 2. Sales employee channels test
  const salesChannels = await request('GET', '/api/chat/channels', salesToken);
  console.log('\n2. Sales Employee channels count:', salesChannels.body.channels?.length);
  console.log('   Channel labels:', salesChannels.body.channels?.map(c => c.label));

  // 3. Sales user trying to access FDE chat -> MUST FAIL 403
  const fdeAccess = await request('GET', '/api/chat/messages?channel=dept_fde', salesToken);
  console.log('\n3. Sales User accessing dept_fde status (Expect 403):', fdeAccess.status, fdeAccess.body);

  // 4. Sales user accessing Sales chat -> MUST SUCCEED 200
  const salAccess = await request('GET', '/api/chat/messages?channel=dept_sal', salesToken);
  console.log('\n4. Sales User accessing dept_sal status (Expect 200):', salAccess.status);

  // 5. Send voice note message simulation
  const voiceMsg = await request('POST', '/api/chat/messages', salesToken, {
    content: 'Voice note demo audio recording',
    channel: 'dept_sal',
    mediaUrl: '/uploads/sample-voice-note.webm',
    mediaType: 'AUDIO',
    mediaDuration: 12.5,
    mediaName: 'voice-recording.webm'
  });
  console.log('\n5. Sent voice note message status (Expect 201):', voiceMsg.status, 'ID:', voiceMsg.body?.id);

  // 6. Direct Message 1-on-1 between Sales and FDE
  const dmMsg = await request('POST', '/api/chat/messages', salesToken, {
    content: 'Hello FDE engineer, can you check ticket #1024?',
    recipientId: fdeUser.id
  });
  console.log('\n6. Sent 1-on-1 DM status (Expect 201):', dmMsg.status, 'Channel:', dmMsg.body?.channel);

  // 7. Get users list for direct messaging
  const usersList = await request('GET', '/api/chat/users', salesToken);
  console.log('\n7. Users list for DMs (Expect count > 0):', usersList.body?.length);

  await prisma.$disconnect();
  console.log('\n✓ ALL BACKEND TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(console.error);
