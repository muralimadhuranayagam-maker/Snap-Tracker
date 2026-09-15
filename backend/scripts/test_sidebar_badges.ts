import { prisma } from '../src/lib/prisma';
import jwt from 'jsonwebtoken';
import http from 'http';

const JWT_SECRET = process.env.JWT_SECRET || 'snapserve-jwt-secret-2025';

function makeRequest(path: string, method = 'GET', body: any = null, token?: string): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (payload) headers['Content-Length'] = String(Buffer.byteLength(payload));

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path,
        method,
        headers,
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => (resData += chunk));
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(resData);
          } catch {
            parsed = resData;
          }
          resolve({ status: res.statusCode || 500, data: parsed });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function run() {
  console.log('--- STARTING SIDEBAR NOTIFICATION BADGES SUITE ---');

  // 1. Find Rahul and an Admin
  const rahul = await prisma.user.findFirst({
    where: { email: { contains: 'rahul' } },
    include: { role: true, department: true }
  });
  if (!rahul) throw new Error('User Rahul not found');

  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
    include: { role: true, department: true }
  });
  if (!admin) throw new Error('Admin not found');

  const rahulToken = jwt.sign(
    { userId: rahul.id, email: rahul.email, roleName: rahul.role.name, departmentId: rahul.departmentId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { userId: admin.id, email: admin.email, roleName: admin.role.name, departmentId: admin.departmentId },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  console.log(`Testing with User Rahul (${rahul.name}) and Admin (${admin.name})`);

  // 2. Clear all prior notifications and reset views for Rahul
  console.log('\n--- Step 1: Baseline Reset ---');
  await makeRequest('/api/notifications/viewed', 'POST', { entity: 'tasks' }, rahulToken);
  await makeRequest('/api/notifications/viewed', 'POST', { entity: 'tickets' }, rahulToken);
  await makeRequest('/api/notifications/viewed', 'POST', { entity: 'projects' }, rahulToken);

  // Mark all unread notifs as read for clean baseline
  await prisma.notification.updateMany({
    where: { userId: rahul.id, isRead: false },
    data: { isRead: true }
  });

  const baselineRes = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Baseline badges for Rahul:', baselineRes.data);
  if (baselineRes.data.tasks !== 0 || baselineRes.data.tickets !== 0 || baselineRes.data.projects !== 0) {
    throw new Error(`Baseline expected 0 across all badges, got ${JSON.stringify(baselineRes.data)}`);
  }
  console.log('✅ Baseline 0/0/0 verified');

  // 3. Test Tasks Notification Badge
  console.log('\n--- Step 2: Task Assignment Badge & Clear ---');
  const taskRes = await makeRequest('/api/tasks', 'POST', {
    title: 'Test Notification Task for Rahul ' + Date.now(),
    assigneeId: rahul.id,
    departmentId: rahul.departmentId,
  }, adminToken);
  console.log(`Created task assigned to Rahul: ${taskRes.data.taskId}`);

  const badgesAfterTask = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Badges after task created:', badgesAfterTask.data);
  if (badgesAfterTask.data.tasks < 1) {
    throw new Error(`Expected tasks badge >= 1, got ${badgesAfterTask.data.tasks}`);
  }
  console.log('✅ Task badge showed up as expected!');

  // Now Rahul opens /tasks (simulating page view)
  const viewTasksRes = await makeRequest('/api/notifications/viewed', 'POST', { entity: 'tasks' }, rahulToken);
  console.log('Called POST /api/notifications/viewed { entity: tasks }:', viewTasksRes.status);

  const badgesAfterViewTasks = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Badges after Rahul viewed tasks:', badgesAfterViewTasks.data);
  if (badgesAfterViewTasks.data.tasks !== 0) {
    throw new Error(`Expected tasks badge = 0 after view, got ${badgesAfterViewTasks.data.tasks}`);
  }
  console.log('✅ Task badge cleared to 0 after viewing!');

  // 4. Test Tickets Notification Badge
  console.log('\n--- Step 3: Ticket Assignment Badge & Clear ---');
  const ticketRes = await makeRequest('/api/tickets', 'POST', {
    title: 'Test Customer Issue Assigned to Rahul ' + Date.now(),
    category: 'Technical Bug',
    assigneeId: rahul.id,
  }, adminToken);
  console.log(`Created ticket assigned to Rahul: ${ticketRes.data.ticketId}`);

  const badgesAfterTicket = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Badges after ticket created:', badgesAfterTicket.data);
  if (badgesAfterTicket.data.tickets < 1) {
    throw new Error(`Expected tickets badge >= 1, got ${badgesAfterTicket.data.tickets}`);
  }
  console.log('✅ Ticket badge showed up as expected!');

  // Now Rahul opens /tickets (simulating page view)
  const viewTicketsRes = await makeRequest('/api/notifications/viewed', 'POST', { entity: 'tickets' }, rahulToken);
  console.log('Called POST /api/notifications/viewed { entity: tickets }:', viewTicketsRes.status);

  const badgesAfterViewTickets = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Badges after Rahul viewed tickets:', badgesAfterViewTickets.data);
  if (badgesAfterViewTickets.data.tickets !== 0) {
    throw new Error(`Expected tickets badge = 0 after view, got ${badgesAfterViewTickets.data.tickets}`);
  }
  console.log('✅ Ticket badge cleared to 0 after viewing!');

  // 5. Test Projects Notification Badge
  console.log('\n--- Step 4: Project Assignment Badge & Clear ---');
  let project = await prisma.project.findFirst({ where: { isArchived: false } });
  if (!project) {
    const projRes = await makeRequest('/api/projects', 'POST', {
      name: 'Badge Test Project ' + Date.now(),
      priority: 'HIGH'
    }, adminToken);
    project = projRes.data;
  }

  // Add Rahul as a member
  const memberRes = await makeRequest(`/api/projects/${project!.id}/members`, 'POST', {
    userId: rahul.id,
    role: 'CONTRIBUTOR'
  }, adminToken);
  console.log('Added Rahul to project:', memberRes.status);

  const badgesAfterProject = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Badges after Rahul added to project:', badgesAfterProject.data);
  if (badgesAfterProject.data.projects < 1) {
    throw new Error(`Expected projects badge >= 1, got ${badgesAfterProject.data.projects}`);
  }
  console.log('✅ Project badge showed up as expected!');

  // Now Rahul opens /projects (simulating page view)
  const viewProjectsRes = await makeRequest('/api/notifications/viewed', 'POST', { entity: 'projects' }, rahulToken);
  console.log('Called POST /api/notifications/viewed { entity: projects }:', viewProjectsRes.status);

  const badgesAfterViewProjects = await makeRequest('/api/notifications/sidebar-badges', 'GET', null, rahulToken);
  console.log('Badges after Rahul viewed projects:', badgesAfterViewProjects.data);
  if (badgesAfterViewProjects.data.projects !== 0) {
    throw new Error(`Expected projects badge = 0 after view, got ${badgesAfterViewProjects.data.projects}`);
  }
  console.log('✅ Project badge cleared to 0 after viewing!');

  console.log('\n🎉 ALL SIDEBAR NOTIFICATION BADGE TESTS PASSED SUCCESSFULLY! 🎉');
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
