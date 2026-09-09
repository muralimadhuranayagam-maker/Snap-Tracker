import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { addDays, subDays } from 'date-fns';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');
  const now = new Date();

  // ─── PERMISSIONS ─────────────────────────────────────────────────────────
  const permissionNames = [
    'users:manage', 'users:create', 'users:delete', 'users:view',
    'roles:manage', 'departments:manage', 'departments:view',
    'projects:manage', 'projects:create', 'projects:view',
    'tasks:manage', 'tasks:create', 'tasks:assign', 'tasks:view',
    'tasks:reassign', 'tasks:delete', 'tasks:approve',
    'workflows:manage', 'reports:view', 'reports:export',
    'audit:view', 'settings:manage',
    'ai:use', 'ai:configure', 'ai:advanced',
    'notifications:configure',
  ];

  const permissions: Record<string, any> = {};
  for (const name of permissionNames) {
    permissions[name] = await prisma.permission.upsert({
      where: { name },
      create: { name, description: name.replace(':', ' ') },
      update: {},
    });
  }
  console.log('✅ Permissions created');

  // ─── ROLES ───────────────────────────────────────────────────────────────
  const superAdminRole = await prisma.role.upsert({
    where: { name: 'SUPER_ADMIN' },
    create: { name: 'SUPER_ADMIN', description: 'Full system access' },
    update: {},
  });
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    create: { name: 'ADMIN', description: 'Team management and oversight' },
    update: {},
  });
  const employeeRole = await prisma.role.upsert({
    where: { name: 'EMPLOYEE' },
    create: { name: 'EMPLOYEE', description: 'Task execution and collaboration' },
    update: {},
  });

  // Assign permissions to roles
  const superAdminPerms = permissionNames;
  const adminPerms = [
    'departments:view', 'projects:create', 'projects:view', 'projects:manage',
    'tasks:create', 'tasks:assign', 'tasks:view', 'tasks:reassign', 'tasks:approve',
    'reports:view', 'ai:use', 'ai:advanced', 'users:view',
  ];
  const employeePerms = ['tasks:view', 'tasks:create', 'projects:view', 'ai:use', 'departments:view', 'users:view'];

  await prisma.rolePermission.deleteMany({});
  for (const perm of superAdminPerms) {
    if (permissions[perm]) {
      await prisma.rolePermission.create({ data: { roleId: superAdminRole.id, permissionId: permissions[perm].id } });
    }
  }
  for (const perm of adminPerms) {
    if (permissions[perm]) {
      await prisma.rolePermission.create({ data: { roleId: adminRole.id, permissionId: permissions[perm].id } });
    }
  }
  for (const perm of employeePerms) {
    if (permissions[perm]) {
      await prisma.rolePermission.create({ data: { roleId: employeeRole.id, permissionId: permissions[perm].id } });
    }
  }
  console.log('✅ Roles and permissions assigned');

  // ─── DEPARTMENTS ─────────────────────────────────────────────────────────
  const fdeDept = await prisma.department.upsert({
    where: { code: 'FDE' },
    create: { name: 'FDE', code: 'FDE', description: 'Feature Development & Engineering', color: '#6366f1' },
    update: {},
  });
  const mktDept = await prisma.department.upsert({
    where: { code: 'MKT' },
    create: { name: 'Marketing', code: 'MKT', description: 'Marketing & Growth', color: '#f59e0b' },
    update: {},
  });
  const salDept = await prisma.department.upsert({
    where: { code: 'SAL' },
    create: { name: 'Sales', code: 'SAL', description: 'Sales & Business Development', color: '#10b981' },
    update: {},
  });
  console.log('✅ Departments created');

  // ─── USERS ───────────────────────────────────────────────────────────────
  const hash = (pw: string) => bcrypt.hashSync(pw, 12);

  const usersData = [
    // Super Admins
    { email: 'superadmin1@snapserve.io', name: 'Alex Thompson', password: hash('Admin@1234'), roleId: superAdminRole.id, title: 'CTO & Super Admin', departmentId: null },
    { email: 'superadmin2@snapserve.io', name: 'Sarah Chen', password: hash('Admin@1234'), roleId: superAdminRole.id, title: 'VP Engineering & Super Admin', departmentId: null },
    // Admins
    { email: 'admin1@snapserve.io', name: 'James Wilson', password: hash('Admin@1234'), roleId: adminRole.id, title: 'Operations Manager', departmentId: null },
    { email: 'admin2@snapserve.io', name: 'Priya Patel', password: hash('Admin@1234'), roleId: adminRole.id, title: 'Delivery Manager', departmentId: null },
    // FDE Team (10)
    { email: 'rahul.kumar@snapserve.io', name: 'Rahul Kumar', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Senior Software Engineer', departmentId: fdeDept.id },
    { email: 'arun.sharma@snapserve.io', name: 'Arun Sharma', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Full Stack Developer', departmentId: fdeDept.id },
    { email: 'neha.singh@snapserve.io', name: 'Neha Singh', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Backend Engineer', departmentId: fdeDept.id },
    { email: 'vikram.nair@snapserve.io', name: 'Vikram Nair', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Frontend Developer', departmentId: fdeDept.id },
    { email: 'ananya.mishra@snapserve.io', name: 'Ananya Mishra', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'QA Engineer', departmentId: fdeDept.id },
    { email: 'kiran.rao@snapserve.io', name: 'Kiran Rao', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'DevOps Engineer', departmentId: fdeDept.id },
    { email: 'sanjay.mehta@snapserve.io', name: 'Sanjay Mehta', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Software Engineer', departmentId: fdeDept.id },
    { email: 'divya.krishna@snapserve.io', name: 'Divya Krishna', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Senior Frontend Engineer', departmentId: fdeDept.id },
    { email: 'arjun.iyer@snapserve.io', name: 'Arjun Iyer', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Software Engineer', departmentId: fdeDept.id },
    { email: 'pooja.desai@snapserve.io', name: 'Pooja Desai', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Backend Developer', departmentId: fdeDept.id },
    // Marketing Team (5)
    { email: 'maya.roberts@snapserve.io', name: 'Maya Roberts', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Marketing Manager', departmentId: mktDept.id },
    { email: 'tom.baker@snapserve.io', name: 'Tom Baker', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Content Strategist', departmentId: mktDept.id },
    { email: 'lisa.nguyen@snapserve.io', name: 'Lisa Nguyen', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Digital Marketing Specialist', departmentId: mktDept.id },
    { email: 'chris.adams@snapserve.io', name: 'Chris Adams', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Graphic Designer', departmentId: mktDept.id },
    { email: 'emma.watson@snapserve.io', name: 'Emma Watson', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'SEO Specialist', departmentId: mktDept.id },
    // Sales Team (5)
    { email: 'david.cohen@snapserve.io', name: 'David Cohen', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Sales Manager', departmentId: salDept.id },
    { email: 'jennifer.lee@snapserve.io', name: 'Jennifer Lee', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Account Executive', departmentId: salDept.id },
    { email: 'michael.brown@snapserve.io', name: 'Michael Brown', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Sales Representative', departmentId: salDept.id },
    { email: 'sophia.garcia@snapserve.io', name: 'Sophia Garcia', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Business Development Manager', departmentId: salDept.id },
    { email: 'ryan.taylor@snapserve.io', name: 'Ryan Taylor', password: hash('Employee@1234'), roleId: employeeRole.id, title: 'Sales Representative', departmentId: salDept.id },
  ];

  const users: Record<string, any> = {};
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: u,
      update: { name: u.name, title: u.title },
    });
    users[user.email] = user;

    // Create notification preferences
    await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
  }
  console.log(`✅ ${usersData.length} users created`);

  // ─── TASK TYPES ──────────────────────────────────────────────────────────
  const taskTypesList = [
    { name: 'Task', icon: 'check-circle', color: '#6366f1', isSystem: true },
    { name: 'Bug', icon: 'bug', color: '#ef4444', isSystem: true },
    { name: 'Feature', icon: 'star', color: '#8b5cf6', isSystem: true },
    { name: 'Request', icon: 'inbox', color: '#6366f1', isSystem: true },
    { name: 'Customer Issue', icon: 'alert-circle', color: '#f59e0b', isSystem: true },
    { name: 'Internal Request', icon: 'users', color: '#3b82f6', isSystem: true },
    { name: 'Follow-up', icon: 'refresh-cw', color: '#64748b', isSystem: true },
    { name: 'Meeting', icon: 'video', color: '#0ea5e9', isSystem: true },
    { name: 'Research', icon: 'search', color: '#a855f7', isSystem: true },
    { name: 'Documentation', icon: 'file-text', color: '#64748b', isSystem: true },
    { name: 'Incident', icon: 'zap', color: '#dc2626', isSystem: true },
    { name: 'Approval', icon: 'check-square', color: '#10b981', isSystem: true },
  ];

  const taskTypes: Record<string, any> = {};
  for (const t of taskTypesList) {
    const tt = await prisma.taskType.upsert({
      where: { name: t.name },
      create: t,
      update: {},
    });
    taskTypes[t.name] = tt;
  }

  // ─── PRIORITIES ──────────────────────────────────────────────────────────
  const prioritiesList = [
    { name: 'LOW', level: 1, color: '#94a3b8', icon: 'arrow-down' },
    { name: 'MEDIUM', level: 2, color: '#3b82f6', icon: 'minus' },
    { name: 'HIGH', level: 3, color: '#f59e0b', icon: 'arrow-up' },
    { name: 'URGENT', level: 4, color: '#f97316', icon: 'chevrons-up' },
    { name: 'CRITICAL', level: 5, color: '#ef4444', icon: 'alert-circle' },
  ];

  const priorities: Record<string, any> = {};
  for (const p of prioritiesList) {
    const priority = await prisma.taskPriority.upsert({
      where: { name: p.name },
      create: { ...p, isSystem: true },
      update: {},
    });
    priorities[p.name] = priority;
  }

  // ─── TASK STATUSES ───────────────────────────────────────────────────────
  const statusesList = [
    { name: 'BACKLOG', category: 'PENDING', color: '#94a3b8', icon: 'inbox', order: 0, isSystem: true },
    { name: 'TODO', category: 'PENDING', color: '#3b82f6', icon: 'circle', order: 1, isSystem: true },
    { name: 'IN_PROGRESS', category: 'ACTIVE', color: '#6366f1', icon: 'play-circle', order: 2, isSystem: true },
    { name: 'BLOCKED', category: 'ACTIVE', color: '#ef4444', icon: 'x-circle', order: 3, isSystem: true },
    { name: 'IN_REVIEW', category: 'REVIEW', color: '#f59e0b', icon: 'eye', order: 4, isSystem: true },
    { name: 'APPROVED', category: 'REVIEW', color: '#10b981', icon: 'check-circle', order: 5, isSystem: true },
    { name: 'DONE', category: 'DONE', color: '#22c55e', icon: 'check-circle-2', order: 6, isSystem: true, isTerminal: true },
    { name: 'CANCELLED', category: 'CANCELLED', color: '#6b7280', icon: 'ban', order: 7, isSystem: true, isTerminal: true },
  ];

  const statuses: Record<string, any> = {};
  for (const s of statusesList) {
    const status = await prisma.taskStatus.upsert({
      where: { name: s.name },
      create: s,
      update: {},
    });
    statuses[s.name] = status;
  }

  // ─── LABELS ───────────────────────────────────────────────────────────────
  const labelsList = [
    { name: 'customer-facing', color: '#f59e0b' },
    { name: 'backend', color: '#6366f1' },
    { name: 'frontend', color: '#8b5cf6' },
    { name: 'api', color: '#0ea5e9' },
    { name: 'security', color: '#ef4444' },
    { name: 'performance', color: '#f97316' },
    { name: 'urgent-fix', color: '#dc2626' },
    { name: 'campaign', color: '#f59e0b' },
    { name: 'q3-priority', color: '#10b981' },
    { name: 'technical-debt', color: '#94a3b8' },
  ];

  const labels: Record<string, any> = {};
  for (const l of labelsList) {
    const label = await prisma.label.upsert({
      where: { name: l.name },
      create: l,
      update: {},
    });
    labels[l.name] = label;
  }
  console.log('✅ Task types, priorities, statuses, labels created');

  // ─── CUSTOMERS ─────────────────────────────────────────────────────────────
  const cust1 = await prisma.customer.upsert({
    where: { code: 'ABC' },
    create: {
      name: 'ABC Corporation',
      code: 'ABC',
      tier: 'ENTERPRISE',
      industry: 'FinTech & Banking',
      healthScore: 78.0,
      primaryContactName: 'Jonathan Vance',
      primaryContactEmail: 'jvance@abccorp.com',
      primaryContactPhone: '+1-555-0199',
      arr: 120000,
      status: 'ACTIVE',
    },
    update: { name: 'ABC Corporation' },
  });

  const cust2 = await prisma.customer.upsert({
    where: { code: 'GLB' },
    create: {
      name: 'Globex Logistics',
      code: 'GLB',
      tier: 'GROWTH',
      industry: 'Supply Chain & Freight',
      healthScore: 92.0,
      primaryContactName: 'Elena Rostova',
      primaryContactEmail: 'elena@globex.io',
      primaryContactPhone: '+1-555-0245',
      arr: 48000,
      status: 'ACTIVE',
    },
    update: { name: 'Globex Logistics' },
  });

  const cust3 = await prisma.customer.upsert({
    where: { code: 'ACM' },
    create: {
      name: 'Acme Cloud Solutions',
      code: 'ACM',
      tier: 'STANDARD',
      industry: 'SaaS & Cloud',
      healthScore: 85.0,
      primaryContactName: 'Marcus Wright',
      primaryContactEmail: 'marcus@acmecloud.com',
      primaryContactPhone: '+1-555-0312',
      arr: 24000,
      status: 'ONBOARDING',
    },
    update: { name: 'Acme Cloud Solutions' },
  });
  console.log('✅ Customers created');

  // ─── PROJECTS ─────────────────────────────────────────────────────────────
  const proj1 = await prisma.project.upsert({
    where: { id: 'proj-abc-impl' },
    create: {
      id: 'proj-abc-impl',
      name: 'ABC Corp Customer Implementation',
      description: 'Full onboarding and implementation for ABC Corp, a key enterprise customer.',
      departmentId: fdeDept.id,
      customerId: cust1.id,
      priority: 'CRITICAL',
      status: 'ACTIVE',
      startDate: subDays(now, 14),
      dueDate: addDays(now, 21),
      color: '#ef4444',
      createdById: users['admin1@snapserve.io'].id,
    },
    update: { customerId: cust1.id },
  });

  const proj2 = await prisma.project.upsert({
    where: { id: 'proj-q3-campaign' },
    create: {
      id: 'proj-q3-campaign',
      name: 'Q3 Marketing Campaign',
      description: 'Multi-channel marketing campaign targeting enterprise customers in Q3.',
      departmentId: mktDept.id,
      priority: 'HIGH',
      status: 'ACTIVE',
      startDate: subDays(now, 7),
      dueDate: addDays(now, 30),
      color: '#f59e0b',
      createdById: users['admin1@snapserve.io'].id,
    },
    update: {},
  });

  const proj3 = await prisma.project.upsert({
    where: { id: 'proj-platform-v2' },
    create: {
      id: 'proj-platform-v2',
      name: 'Platform v2.0 Development',
      description: 'Major platform upgrade with new API, improved performance, and new features.',
      departmentId: fdeDept.id,
      priority: 'HIGH',
      status: 'ACTIVE',
      startDate: subDays(now, 30),
      dueDate: addDays(now, 60),
      color: '#6366f1',
      createdById: users['superadmin1@snapserve.io'].id,
    },
    update: {},
  });

  const proj4 = await prisma.project.upsert({
    where: { id: 'proj-sales-pipeline' },
    create: {
      id: 'proj-sales-pipeline',
      name: 'Enterprise Sales Pipeline Q3',
      description: 'Manage enterprise accounts and deals for Q3 targets.',
      departmentId: salDept.id,
      priority: 'HIGH',
      status: 'ACTIVE',
      startDate: subDays(now, 5),
      dueDate: addDays(now, 45),
      color: '#10b981',
      createdById: users['admin1@snapserve.io'].id,
    },
    update: {},
  });

  // Add members to projects
  for (const [projId, memberEmails] of [
    [proj1.id, ['rahul.kumar@snapserve.io', 'arun.sharma@snapserve.io', 'ananya.mishra@snapserve.io', 'admin1@snapserve.io']],
    [proj2.id, ['maya.roberts@snapserve.io', 'tom.baker@snapserve.io', 'lisa.nguyen@snapserve.io', 'chris.adams@snapserve.io']],
    [proj3.id, ['rahul.kumar@snapserve.io', 'vikram.nair@snapserve.io', 'neha.singh@snapserve.io', 'kiran.rao@snapserve.io']],
    [proj4.id, ['david.cohen@snapserve.io', 'jennifer.lee@snapserve.io', 'sophia.garcia@snapserve.io']],
  ] as [string, string[]][]) {
    for (const email of memberEmails) {
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: projId, userId: users[email].id } },
        create: { projectId: projId, userId: users[email].id, role: 'MEMBER' },
        update: {},
      });
    }
  }

  // ─── MILESTONES ───────────────────────────────────────────────────────────
  const milestones = await Promise.all([
    prisma.milestone.upsert({ where: { id: 'ms-1' }, create: { id: 'ms-1', projectId: proj1.id, name: 'Requirements Sign-off', order: 1, dueDate: subDays(now, 7), status: 'COMPLETED' }, update: {} }),
    prisma.milestone.upsert({ where: { id: 'ms-2' }, create: { id: 'ms-2', projectId: proj1.id, name: 'Development Complete', order: 2, dueDate: addDays(now, 7), status: 'IN_PROGRESS' }, update: {} }),
    prisma.milestone.upsert({ where: { id: 'ms-3' }, create: { id: 'ms-3', projectId: proj1.id, name: 'Customer UAT', order: 3, dueDate: addDays(now, 14), status: 'PENDING' }, update: {} }),
    prisma.milestone.upsert({ where: { id: 'ms-4' }, create: { id: 'ms-4', projectId: proj1.id, name: 'Go Live', order: 4, dueDate: addDays(now, 21), status: 'PENDING' }, update: {} }),
  ]);
  console.log('✅ Projects and milestones created');

  // ─── TASKS ────────────────────────────────────────────────────────────────
  const rahul = users['rahul.kumar@snapserve.io'];
  const arun = users['arun.sharma@snapserve.io'];
  const neha = users['neha.singh@snapserve.io'];
  const vikram = users['vikram.nair@snapserve.io'];
  const ananya = users['ananya.mishra@snapserve.io'];
  const kiran = users['kiran.rao@snapserve.io'];
  const sanjay = users['sanjay.mehta@snapserve.io'];
  const divya = users['divya.krishna@snapserve.io'];
  const arjun = users['arjun.iyer@snapserve.io'];
  const pooja = users['pooja.desai@snapserve.io'];
  const maya = users['maya.roberts@snapserve.io'];
  const tom = users['tom.baker@snapserve.io'];
  const lisa = users['lisa.nguyen@snapserve.io'];
  const chris = users['chris.adams@snapserve.io'];
  const emma = users['emma.watson@snapserve.io'];
  const david = users['david.cohen@snapserve.io'];
  const jennifer = users['jennifer.lee@snapserve.io'];
  const michael = users['michael.brown@snapserve.io'];
  const sophia = users['sophia.garcia@snapserve.io'];
  const ryan = users['ryan.taylor@snapserve.io'];
  const admin1 = users['admin1@snapserve.io'];
  const admin2 = users['admin2@snapserve.io'];

  const tasksData = [
    // ── FDE TASKS (ABC Corp Project) ──────────────────────────────────────
    {
      id: 'task-fde-1001', taskId: 'FDE-1001',
      title: 'Integrate ABC Corp API with SnapServe backend',
      description: 'Implement the REST API integration with ABC Corp\'s customer management system. Need to handle authentication, data sync, and error handling.',
      departmentId: fdeDept.id, projectId: proj1.id, milestoneId: milestones[1].id,
      taskTypeId: taskTypes['Feature'].id, priorityId: priorities['CRITICAL'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: rahul.id, reporterId: admin1.id, reviewerId: admin2.id,
      startDate: subDays(now, 5), dueDate: addDays(now, 2), estimatedHours: 16, actualHours: 9,
      aiDeadlineRisk: 'HIGH', aiPriorityScore: 92,
    },
    {
      id: 'task-fde-1002', taskId: 'FDE-1002',
      title: 'Fix authentication token expiry bug',
      description: 'JWT tokens are expiring prematurely causing customer session drops. Traced to a timezone conversion issue.',
      departmentId: fdeDept.id, projectId: proj1.id,
      taskTypeId: taskTypes['Bug'].id, priorityId: priorities['URGENT'].id,
      statusId: statuses['IN_REVIEW'].id, assigneeId: neha.id, reporterId: rahul.id, reviewerId: admin1.id,
      startDate: subDays(now, 3), dueDate: addDays(now, 1), estimatedHours: 6, actualHours: 5,
    },
    {
      id: 'task-fde-1003', taskId: 'FDE-1003',
      title: 'Build customer dashboard UI for ABC Corp',
      description: 'Create the customer-facing dashboard with analytics, user management, and billing sections.',
      departmentId: fdeDept.id, projectId: proj1.id, milestoneId: milestones[1].id,
      taskTypeId: taskTypes['Feature'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: vikram.id, reporterId: admin1.id,
      startDate: subDays(now, 2), dueDate: addDays(now, 5), estimatedHours: 24, actualHours: 8,
    },
    {
      id: 'task-fde-1004', taskId: 'FDE-1004',
      title: 'Waiting for ABC Corp API credentials from Sales',
      description: 'Cannot complete the integration until Sales provides the production API keys and endpoint documentation from ABC Corp.',
      departmentId: fdeDept.id, projectId: proj1.id,
      taskTypeId: taskTypes['Request'].id, priorityId: priorities['CRITICAL'].id,
      statusId: statuses['BLOCKED'].id, assigneeId: arun.id, reporterId: rahul.id,
      dueDate: subDays(now, 1), estimatedHours: 2,
      aiDeadlineRisk: 'CRITICAL',
    },
    {
      id: 'task-fde-1005', taskId: 'FDE-1005',
      title: 'Performance optimization for data sync service',
      description: 'The data sync job is taking 45 minutes for large datasets. Target: under 5 minutes.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['TODO'].id, assigneeId: neha.id, reporterId: admin1.id,
      dueDate: addDays(now, 10), estimatedHours: 12,
    },
    {
      id: 'task-fde-1006', taskId: 'FDE-1006',
      title: 'Write API documentation for v2 endpoints',
      description: 'Document all new REST API endpoints with examples, request/response schemas, and error codes.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Documentation'].id, priorityId: priorities['MEDIUM'].id,
      statusId: statuses['BACKLOG'].id, assigneeId: arjun.id, reporterId: admin1.id,
      dueDate: addDays(now, 20), estimatedHours: 8,
    },
    {
      id: 'task-fde-1007', taskId: 'FDE-1007',
      title: 'Set up CI/CD pipeline for platform v2',
      description: 'Implement automated build, test, and deployment pipeline using GitHub Actions and Docker.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: kiran.id, reporterId: admin1.id,
      startDate: subDays(now, 3), dueDate: addDays(now, 7), estimatedHours: 20, actualHours: 12,
    },
    {
      id: 'task-fde-1008', taskId: 'FDE-1008',
      title: 'Implement real-time notification system',
      description: 'Build WebSocket-based real-time notification system for the platform.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Feature'].id, priorityId: priorities['MEDIUM'].id,
      statusId: statuses['DONE'].id, assigneeId: sanjay.id, reporterId: admin1.id,
      startDate: subDays(now, 14), dueDate: subDays(now, 5), estimatedHours: 16, actualHours: 18,
      completedAt: subDays(now, 3),
    },
    {
      id: 'task-fde-1009', taskId: 'FDE-1009',
      title: 'Conduct security audit on customer data endpoints',
      description: 'Review all customer data endpoints for PII exposure, injection vulnerabilities, and access control issues.',
      departmentId: fdeDept.id, projectId: proj1.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['URGENT'].id,
      statusId: statuses['TODO'].id, assigneeId: pooja.id, reporterId: admin2.id,
      dueDate: addDays(now, 3), estimatedHours: 10,
    },
    {
      id: 'task-fde-1010', taskId: 'FDE-1010',
      title: 'Write unit tests for authentication module',
      description: 'Achieve 90%+ test coverage for the auth module including edge cases.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['MEDIUM'].id,
      statusId: statuses['DONE'].id, assigneeId: ananya.id, reporterId: admin1.id,
      startDate: subDays(now, 10), dueDate: subDays(now, 3), estimatedHours: 8, actualHours: 7,
      completedAt: subDays(now, 4),
    },
    {
      id: 'task-fde-1011', taskId: 'FDE-1011',
      title: 'Investigate production memory leak',
      description: 'Production servers showing 15% memory increase per hour. Needs immediate diagnosis.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Incident'].id, priorityId: priorities['CRITICAL'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: rahul.id, reporterId: kiran.id,
      dueDate: addDays(now, 0), estimatedHours: 6, actualHours: 3,
      aiDeadlineRisk: 'CRITICAL',
    },
    {
      id: 'task-fde-1012', taskId: 'FDE-1012',
      title: 'Refactor legacy database queries',
      description: 'Convert N+1 query patterns in the orders module to use proper JOIN queries.',
      departmentId: fdeDept.id, projectId: proj3.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['LOW'].id,
      statusId: statuses['BACKLOG'].id, assigneeId: divya.id, reporterId: admin1.id,
      dueDate: addDays(now, 30), estimatedHours: 12,
    },

    // ── OVERDUE FDE TASKS ──────────────────────────────────────────────────
    {
      id: 'task-fde-1013', taskId: 'FDE-1013',
      title: 'ABC Corp QA testing - environment setup',
      description: 'Set up the staging environment mirrors for ABC Corp UAT testing.',
      departmentId: fdeDept.id, projectId: proj1.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: ananya.id, reporterId: admin1.id,
      dueDate: subDays(now, 2), estimatedHours: 8, actualHours: 4,
      aiDeadlineRisk: 'CRITICAL',
    },

    // ── MARKETING TASKS ────────────────────────────────────────────────────
    {
      id: 'task-mkt-1001', taskId: 'MKT-1001',
      title: 'Create Q3 campaign landing pages',
      description: 'Design and implement 3 landing pages for the Q3 enterprise campaign targeting financial services.',
      departmentId: mktDept.id, projectId: proj2.id,
      taskTypeId: taskTypes['Feature'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: maya.id, reporterId: admin1.id,
      startDate: subDays(now, 3), dueDate: addDays(now, 7), estimatedHours: 16, actualHours: 6,
    },
    {
      id: 'task-mkt-1002', taskId: 'MKT-1002',
      title: 'Write blog posts for product launch',
      description: '3 SEO-optimized blog posts announcing v2.0 platform launch targeting CTOs and Engineering Managers.',
      departmentId: mktDept.id, projectId: proj2.id,
      taskTypeId: taskTypes['Documentation'].id, priorityId: priorities['MEDIUM'].id,
      statusId: statuses['TODO'].id, assigneeId: tom.id, reporterId: maya.id,
      dueDate: addDays(now, 14), estimatedHours: 12,
    },
    {
      id: 'task-mkt-1003', taskId: 'MKT-1003',
      title: 'Set up email campaign automation',
      description: 'Configure Mailchimp sequences for the enterprise nurture campaign.',
      departmentId: mktDept.id, projectId: proj2.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_REVIEW'].id, assigneeId: lisa.id, reporterId: maya.id, reviewerId: admin1.id,
      startDate: subDays(now, 5), dueDate: addDays(now, 2), estimatedHours: 8, actualHours: 7,
    },
    {
      id: 'task-mkt-1004', taskId: 'MKT-1004',
      title: 'Design social media graphics for campaign',
      description: '20 graphics for LinkedIn, Twitter, and Instagram Q3 campaign.',
      departmentId: mktDept.id, projectId: proj2.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['MEDIUM'].id,
      statusId: statuses['DONE'].id, assigneeId: chris.id, reporterId: maya.id,
      startDate: subDays(now, 10), dueDate: subDays(now, 3), estimatedHours: 16, actualHours: 14,
      completedAt: subDays(now, 4),
    },
    {
      id: 'task-mkt-1005', taskId: 'MKT-1005',
      title: 'SEO audit and keyword research for Q3 campaign',
      description: 'Identify target keywords, audit current pages, create optimization plan.',
      departmentId: mktDept.id, projectId: proj2.id,
      taskTypeId: taskTypes['Research'].id, priorityId: priorities['MEDIUM'].id,
      statusId: statuses['DONE'].id, assigneeId: emma.id, reporterId: maya.id,
      startDate: subDays(now, 8), dueDate: subDays(now, 2), estimatedHours: 10, actualHours: 9,
      completedAt: subDays(now, 2),
    },
    {
      id: 'task-mkt-1006', taskId: 'MKT-1006',
      title: 'Create customer success case study - XYZ Corp',
      description: 'Interview XYZ Corp customer success team and write the case study with metrics.',
      departmentId: mktDept.id,
      taskTypeId: taskTypes['Documentation'].id, priorityId: priorities['LOW'].id,
      statusId: statuses['BACKLOG'].id, assigneeId: tom.id, reporterId: maya.id,
      dueDate: addDays(now, 21), estimatedHours: 8,
    },

    // ── SALES TASKS ────────────────────────────────────────────────────────
    {
      id: 'task-sal-1001', taskId: 'SAL-1001',
      title: 'Send ABC Corp API credentials to FDE team',
      description: 'Coordinate with ABC Corp to obtain production API credentials and share with FDE team for integration work.',
      departmentId: salDept.id, projectId: proj1.id,
      taskTypeId: taskTypes['Request'].id, priorityId: priorities['CRITICAL'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: jennifer.id, reporterId: david.id,
      dueDate: subDays(now, 1), estimatedHours: 2, actualHours: 1,
      aiDeadlineRisk: 'CRITICAL',
    },
    {
      id: 'task-sal-1002', taskId: 'SAL-1002',
      title: 'Enterprise proposal for DEF Inc',
      description: 'Prepare comprehensive proposal for DEF Inc platform subscription - 500 seat enterprise deal.',
      departmentId: salDept.id, projectId: proj4.id,
      taskTypeId: taskTypes['Request'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: sophia.id, reporterId: david.id,
      dueDate: addDays(now, 5), estimatedHours: 8, actualHours: 3,
    },
    {
      id: 'task-sal-1003', taskId: 'SAL-1003',
      title: 'Follow up with GHI Corp on renewal',
      description: 'GHI Corp contract expires in 30 days. Schedule renewal discussion and prepare upsell proposal.',
      departmentId: salDept.id, projectId: proj4.id,
      taskTypeId: taskTypes['Follow-up'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['TODO'].id, assigneeId: michael.id, reporterId: david.id,
      dueDate: addDays(now, 3), estimatedHours: 3,
    },
    {
      id: 'task-sal-1004', taskId: 'SAL-1004',
      title: 'Gather customer requirements from JKL Corp',
      description: 'Initial discovery meeting with JKL Corp to document their technical requirements for FDE feasibility review.',
      departmentId: salDept.id, projectId: proj4.id,
      taskTypeId: taskTypes['Customer Issue'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['DONE'].id, assigneeId: ryan.id, reporterId: david.id,
      startDate: subDays(now, 5), dueDate: subDays(now, 2), estimatedHours: 4, actualHours: 3,
      completedAt: subDays(now, 3),
    },
    {
      id: 'task-sal-1005', taskId: 'SAL-1005',
      title: 'Prepare demo for MNO Corp',
      description: 'Customize platform demo for MNO Corp use case in healthcare vertical.',
      departmentId: salDept.id, projectId: proj4.id,
      taskTypeId: taskTypes['Meeting'].id, priorityId: priorities['URGENT'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: jennifer.id, reporterId: david.id,
      dueDate: addDays(now, 1), estimatedHours: 6, actualHours: 2,
      aiDeadlineRisk: 'HIGH',
    },
    {
      id: 'task-sal-1006', taskId: 'SAL-1006',
      title: 'Overdue: Q2 sales pipeline report',
      description: 'Compile Q2 won/lost analysis, pipeline velocity metrics, and forecast for Q3.',
      departmentId: salDept.id,
      taskTypeId: taskTypes['Task'].id, priorityId: priorities['HIGH'].id,
      statusId: statuses['IN_PROGRESS'].id, assigneeId: david.id, reporterId: admin1.id,
      dueDate: subDays(now, 4), estimatedHours: 6, actualHours: 2,
      aiDeadlineRisk: 'CRITICAL',
    },
  ];

  const createdTasks: Record<string, any> = {};
  for (const t of tasksData) {
    const { id, ...taskData } = t;
    const task = await prisma.task.upsert({
      where: { id },
      create: { id, ...taskData },
      update: {},
    });
    createdTasks[t.taskId] = task;
  }
  console.log(`✅ ${tasksData.length} tasks created`);

  // ─── TASK DEPENDENCIES ────────────────────────────────────────────────────
  // FDE-1001 (API integration) is BLOCKED BY SAL-1001 (credentials)
  await prisma.taskDependency.upsert({
    where: { sourceId_targetId_type: { sourceId: createdTasks['SAL-1001'].id, targetId: createdTasks['FDE-1001'].id, type: 'BLOCKS' } },
    create: { sourceId: createdTasks['SAL-1001'].id, targetId: createdTasks['FDE-1001'].id, type: 'BLOCKS' },
    update: {},
  });
  // FDE-1004 depends on SAL-1001
  await prisma.taskDependency.upsert({
    where: { sourceId_targetId_type: { sourceId: createdTasks['SAL-1001'].id, targetId: createdTasks['FDE-1004'].id, type: 'BLOCKS' } },
    create: { sourceId: createdTasks['SAL-1001'].id, targetId: createdTasks['FDE-1004'].id, type: 'BLOCKS' },
    update: {},
  });
  // FDE-1002 depends on FDE-1001 being done
  await prisma.taskDependency.upsert({
    where: { sourceId_targetId_type: { sourceId: createdTasks['FDE-1001'].id, targetId: createdTasks['FDE-1009'].id, type: 'DEPENDS_ON' } },
    create: { sourceId: createdTasks['FDE-1001'].id, targetId: createdTasks['FDE-1009'].id, type: 'DEPENDS_ON' },
    update: {},
  });

  // ─── COMMENTS ─────────────────────────────────────────────────────────────
  const commentData = [
    {
      taskId: createdTasks['FDE-1001'].id, userId: rahul.id,
      content: 'Started working on the REST client implementation. Auth handshake is working but data sync is throwing a 429 rate limit. Need to implement backoff strategy.',
    },
    {
      taskId: createdTasks['FDE-1001'].id, userId: admin1.id,
      content: 'Rahul, please coordinate with Sales (@jennifer.lee) to check if we can request a rate limit increase from ABC Corp.',
    },
    {
      taskId: createdTasks['FDE-1001'].id, userId: rahul.id,
      content: 'Update: Implemented exponential backoff. Rate limit issue resolved. Now working on the data transformation layer.',
    },
    {
      taskId: createdTasks['FDE-1004'].id, userId: arun.id,
      content: 'Waiting for Sales to send customer credentials. This is blocking FDE-1001 as well. The entire ABC Corp integration is stalled.',
    },
    {
      taskId: createdTasks['SAL-1001'].id, userId: jennifer.id,
      content: 'I have sent a request to the ABC Corp contact. They said they will send the credentials by EOD tomorrow.',
    },
    {
      taskId: createdTasks['FDE-1002'].id, userId: neha.id,
      content: 'Root cause found: UTC offset was being applied twice in the token generation. Fix is ready for review.',
    },
    {
      taskId: createdTasks['MKT-1001'].id, userId: maya.id,
      content: 'First draft of landing pages is ready. Waiting for FDE team to review technical copy accuracy.',
    },
    {
      taskId: createdTasks['FDE-1011'].id, userId: rahul.id,
      content: 'Found it. The WebSocket connection pool is not being properly cleaned up on disconnect. Memory is leaking in the connection handlers.',
    },
    {
      taskId: createdTasks['FDE-1011'].id, userId: kiran.id,
      content: 'Good catch Rahul. Can you implement the fix? I\'ll monitor the memory metrics from the ops side.',
    },
  ];

  for (const c of commentData) {
    await prisma.taskComment.create({ data: c }).catch(() => {});
  }

  // ─── WORKLOGS ─────────────────────────────────────────────────────────────
  const worklogData = [
    { taskId: createdTasks['FDE-1001'].id, userId: rahul.id, hours: 4, description: 'REST client setup and authentication', logDate: subDays(now, 3) },
    { taskId: createdTasks['FDE-1001'].id, userId: rahul.id, hours: 3, description: 'Rate limit backoff implementation', logDate: subDays(now, 2) },
    { taskId: createdTasks['FDE-1001'].id, userId: rahul.id, hours: 2, description: 'Data transformation layer', logDate: subDays(now, 1) },
    { taskId: createdTasks['FDE-1002'].id, userId: neha.id, hours: 3, description: 'Bug investigation and root cause analysis', logDate: subDays(now, 2) },
    { taskId: createdTasks['FDE-1002'].id, userId: neha.id, hours: 2, description: 'Fix implementation and tests', logDate: subDays(now, 1) },
    { taskId: createdTasks['FDE-1003'].id, userId: vikram.id, hours: 4, description: 'Analytics section design and component setup', logDate: subDays(now, 2) },
    { taskId: createdTasks['FDE-1003'].id, userId: vikram.id, hours: 4, description: 'User management table implementation', logDate: subDays(now, 1) },
    { taskId: createdTasks['FDE-1007'].id, userId: kiran.id, hours: 6, description: 'GitHub Actions workflow setup', logDate: subDays(now, 2) },
    { taskId: createdTasks['FDE-1007'].id, userId: kiran.id, hours: 6, description: 'Docker containerization and registry setup', logDate: subDays(now, 1) },
    { taskId: createdTasks['MKT-1001'].id, userId: maya.id, hours: 3, description: 'Wireframe and content structure', logDate: subDays(now, 2) },
    { taskId: createdTasks['MKT-1001'].id, userId: maya.id, hours: 3, description: 'First page implementation', logDate: subDays(now, 1) },
    { taskId: createdTasks['MKT-1003'].id, userId: lisa.id, hours: 4, description: 'Email sequence design', logDate: subDays(now, 3) },
    { taskId: createdTasks['MKT-1003'].id, userId: lisa.id, hours: 3, description: 'Automation rules setup', logDate: subDays(now, 1) },
    { taskId: createdTasks['SAL-1002'].id, userId: sophia.id, hours: 2, description: 'Requirements gathering and research', logDate: subDays(now, 2) },
    { taskId: createdTasks['SAL-1002'].id, userId: sophia.id, hours: 1, description: 'Initial proposal draft', logDate: subDays(now, 1) },
  ];

  for (const w of worklogData) {
    await prisma.taskWorklog.create({ data: w }).catch(() => {});
  }

  // Update actualHours on tasks
  for (const taskKey of Object.keys(createdTasks)) {
    const total = await prisma.taskWorklog.aggregate({
      where: { taskId: createdTasks[taskKey].id },
      _sum: { hours: true }
    });
    if (total._sum.hours) {
      await prisma.task.update({ where: { id: createdTasks[taskKey].id }, data: { actualHours: total._sum.hours } });
    }
  }
  console.log('✅ Comments and worklogs created');

  // ─── TASK HISTORY ─────────────────────────────────────────────────────────
  const historyData = [
    { taskId: createdTasks['FDE-1001'].id, userId: admin1.id, action: 'TASK_CREATED', field: 'status', newValue: 'BACKLOG' },
    { taskId: createdTasks['FDE-1001'].id, userId: admin1.id, action: 'STATUS_CHANGED', field: 'status', oldValue: 'BACKLOG', newValue: 'TODO' },
    { taskId: createdTasks['FDE-1001'].id, userId: rahul.id, action: 'STATUS_CHANGED', field: 'status', oldValue: 'TODO', newValue: 'IN_PROGRESS' },
    { taskId: createdTasks['FDE-1002'].id, userId: neha.id, action: 'STATUS_CHANGED', field: 'status', oldValue: 'IN_PROGRESS', newValue: 'IN_REVIEW' },
    { taskId: createdTasks['FDE-1004'].id, userId: arun.id, action: 'STATUS_CHANGED', field: 'status', oldValue: 'IN_PROGRESS', newValue: 'BLOCKED' },
  ];

  for (const h of historyData) {
    await prisma.taskHistory.create({ data: { ...h, createdAt: subDays(now, 2) } }).catch(() => {});
  }

  // ─── AI RECOMMENDATIONS (DEMO) ────────────────────────────────────────────
  await prisma.aIRecommendation.deleteMany({});
  const aiRecs = [
    {
      type: 'DEADLINE_RISK',
      taskId: createdTasks['FDE-1004'].id,
      title: '⚠️ FDE-1004 is CRITICAL risk',
      message: 'FDE-1004 is blocked and overdue. This is blocking the entire ABC Corp API integration (FDE-1001). Immediate action required.',
      reasoning: JSON.stringify({
        factors: ['Overdue by 1 day', 'Blocked by SAL-1001', 'Critical priority', 'Blocks FDE-1001 and FDE-1001'],
        probability: 0.94,
        confidence: 'HIGH',
      }),
      confidence: 0.94,
    },
    {
      type: 'WORKLOAD',
      title: '👥 Rahul is near capacity',
      message: 'Rahul Kumar has 3 active high-priority tasks. Consider redistributing non-critical tasks to Arjun or Sanjay.',
      reasoning: JSON.stringify({
        factors: ['3 active tasks', 'Estimated 11h remaining this week', '82% capacity'],
        affectedUserId: rahul.id,
        suggestions: ['Reassign FDE-1012 to Arjun', 'Reassign FDE-1006 to Pooja'],
      }),
      confidence: 0.82,
    },
    {
      type: 'BLOCKER',
      taskId: createdTasks['SAL-1001'].id,
      title: '🔗 SAL-1001 is blocking 2 FDE tasks',
      message: 'Sales task SAL-1001 (API credentials) is overdue and blocking FDE-1001 and FDE-1004. This puts the ABC Corp project at risk.',
      reasoning: JSON.stringify({
        blockedTasks: ['FDE-1001', 'FDE-1004'],
        blockerDept: 'Sales',
        blockerAssignee: 'Jennifer Lee',
        daysOverdue: 1,
      }),
      confidence: 0.97,
    },
    {
      type: 'PROJECT_RISK',
      title: '📅 ABC Corp project is AT RISK',
      message: '2 blocked tasks and 1 overdue task in the ABC Corp implementation. Customer delivery may be impacted.',
      reasoning: JSON.stringify({
        factors: ['2 blocked tasks', '1 overdue task', 'Cross-department dependency unresolved'],
        healthScore: 45,
        recommendation: 'Escalate SAL-1001 immediately to resolve the blocking dependency.',
      }),
      confidence: 0.88,
    },
    {
      type: 'UNASSIGNED',
      title: '📌 5 tasks need owners',
      message: '5 tasks in BACKLOG have no assignee. Assign them to prevent delays.',
      reasoning: JSON.stringify({
        taskIds: [createdTasks['FDE-1006'].taskId, createdTasks['FDE-1012'].taskId, createdTasks['MKT-1006'].taskId],
        count: 5,
      }),
      confidence: 1.0,
    },
  ];

  for (const rec of aiRecs) {
    await prisma.aIRecommendation.create({ data: rec });
  }

  // ─── WORKFLOWS ────────────────────────────────────────────────────────────
  await prisma.workflow.deleteMany({ where: { isSystem: true } });
  await prisma.workflow.create({
    data: {
      name: 'Sales → FDE Feasibility Auto-Task',
      description: 'When Sales creates a Customer Issue, automatically create an FDE feasibility task.',
      trigger: 'TASK_CREATED',
      isActive: true,
      isSystem: true,
      config: JSON.stringify({ condition: { department: 'SAL', taskType: 'Customer Issue' } }),
      steps: {
        create: [
          {
            order: 1,
            type: 'CREATE_TASK',
            config: JSON.stringify({
              departmentCode: 'FDE',
              title: 'Feasibility review: {{triggerTitle}}',
              taskType: 'Research',
              description: 'Auto-generated feasibility review for customer requirement.',
            }),
          },
          {
            order: 2,
            type: 'NOTIFY',
            config: JSON.stringify({
              to: 'ADMINS',
              title: 'New FDE feasibility task created',
              message: 'A new FDE feasibility task was created from SAL: {{taskId}}',
            }),
          },
        ]
      }
    }
  });

  // ─── NOTIFICATIONS ────────────────────────────────────────────────────────
  const notifData = [
    { userId: rahul.id, taskId: createdTasks['FDE-1001'].id, type: 'TASK_ASSIGNED', title: 'Task assigned to you', message: 'James Wilson assigned FDE-1001 to you', isRead: false },
    { userId: admin1.id, taskId: createdTasks['FDE-1004'].id, type: 'TASK_OVERDUE', title: 'Task overdue', message: 'FDE-1004 is past its due date and blocking critical work', isRead: false },
    { userId: admin2.id, taskId: createdTasks['SAL-1001'].id, type: 'TASK_OVERDUE', title: 'Critical task overdue', message: 'SAL-1001 is overdue and blocking FDE integration tasks', isRead: false },
    { userId: neha.id, taskId: createdTasks['FDE-1002'].id, type: 'REVIEW_REQUESTED', title: 'Review requested', message: 'Rahul Kumar requested your review on FDE-1002', isRead: false },
    { userId: arun.id, taskId: createdTasks['FDE-1004'].id, type: 'TASK_BLOCKED', title: 'Task is blocked', message: 'FDE-1004 has been marked as blocked - waiting for Sales credentials', isRead: true },
    { userId: jennifer.id, taskId: createdTasks['SAL-1001'].id, type: 'TASK_OVERDUE', title: 'Your task is overdue', message: 'SAL-1001 was due yesterday. FDE team is waiting on this.', isRead: false },
  ];

  for (const n of notifData) {
    await prisma.notification.create({ data: n as any }).catch(() => {});
  }

  // ─── TICKETS ─────────────────────────────────────────────────────────────
  const tkt1 = await prisma.ticket.upsert({
    where: { id: 'tkt-2026-0001' },
    create: {
      id: 'tkt-2026-0001',
      ticketId: 'TKT-2026-0001',
      title: 'ABC Corp API integration request',
      description: 'Customer needs REST API integration with their core banking platform for automated onboarding.',
      category: 'Customer Implementation',
      subcategory: 'API Integration',
      departmentId: fdeDept.id,
      customerId: cust1.id,
      projectId: proj1.id,
      priority: 'HIGH',
      severity: 'HIGH',
      status: 'RESOLVED',
      reporterId: users['david.cohen@snapserve.io'].id,
      assigneeId: users['rahul.kumar@snapserve.io'].id,
      slaHours: 24,
      slaTarget: subDays(now, 2),
      resolvedAt: subDays(now, 1),
    },
    update: {},
  });

  const tkt2 = await prisma.ticket.upsert({
    where: { id: 'tkt-2026-0002' },
    create: {
      id: 'tkt-2026-0002',
      ticketId: 'TKT-2026-0002',
      title: 'SSO SAML authentication gateway timeout on client node',
      description: 'Users from ABC Corp reporting 504 Gateway Timeout during authentication handshake on staging node.',
      category: 'Technical Bug',
      subcategory: 'SSO & Auth',
      departmentId: fdeDept.id,
      customerId: cust1.id,
      projectId: proj1.id,
      priority: 'CRITICAL',
      severity: 'CRITICAL',
      status: 'IN_PROGRESS',
      reporterId: users['jennifer.lee@snapserve.io'].id,
      assigneeId: users['neha.singh@snapserve.io'].id,
      slaHours: 4,
      slaTarget: addDays(now, 1),
    },
    update: {},
  });

  const tkt3 = await prisma.ticket.upsert({
    where: { id: 'tkt-2026-0003' },
    create: {
      id: 'tkt-2026-0003',
      ticketId: 'TKT-2026-0003',
      title: 'Custom onboarding workflow request for Globex',
      description: 'Globex Logistics requested a customized bulk cargo tracking webhook integration before kickoff.',
      category: 'Feature Request',
      subcategory: 'Webhooks',
      departmentId: fdeDept.id,
      customerId: cust2.id,
      priority: 'MEDIUM',
      severity: 'MEDIUM',
      status: 'NEW',
      reporterId: users['michael.brown@snapserve.io'].id,
      slaHours: 24,
      slaTarget: addDays(now, 2),
    },
    update: {},
  });

  const tkt4 = await prisma.ticket.upsert({
    where: { id: 'tkt-2026-0004' },
    create: {
      id: 'tkt-2026-0004',
      ticketId: 'TKT-2026-0004',
      title: 'Q3 Enterprise Growth Campaign graphics review needed',
      description: 'Marketing deliverables for LinkedIn and Twitter launch need approval and cross-team review.',
      category: 'Internal Request',
      subcategory: 'Brand Assets',
      departmentId: mktDept.id,
      priority: 'HIGH',
      severity: 'MEDIUM',
      status: 'TRIAGED',
      reporterId: users['maya.roberts@snapserve.io'].id,
      assigneeId: users['chris.adams@snapserve.io'].id,
      slaHours: 48,
      slaTarget: addDays(now, 3),
    },
    update: {},
  });

  // Link task-fde-1001 to tkt1
  await prisma.task.update({
    where: { id: 'task-fde-1001' },
    data: { ticketId: tkt1.id, customerId: cust1.id }
  }).catch(() => {});

  // Link task-fde-1004 to cust1
  await prisma.task.update({
    where: { id: 'task-fde-1004' },
    data: { customerId: cust1.id }
  }).catch(() => {});

  // ─── APPROVALS ─────────────────────────────────────────────────────────────
  await prisma.approval.upsert({
    where: { id: 'appr-q3-campaign' },
    create: {
      id: 'appr-q3-campaign',
      title: 'Q3 Enterprise Growth Campaign Launch Sign-Off',
      description: 'Requires operational approval before running paid ad spend on Monday across social channels.',
      type: 'CAMPAIGN_LAUNCH',
      status: 'PENDING',
      requesterId: users['maya.roberts@snapserve.io'].id,
      approverId: users['admin1@snapserve.io'].id,
      entityType: 'Project',
      entityId: proj2.id,
      notes: 'Creative assets finalized and signed off by design lead.',
    },
    update: {},
  });

  await prisma.approval.upsert({
    where: { id: 'appr-abc-deploy' },
    create: {
      id: 'appr-abc-deploy',
      title: 'ABC Corp Production Gateway Deployment',
      description: 'Final deployment sign-off for ABC Corp high-throughput API gateway.',
      type: 'DEPLOYMENT',
      status: 'APPROVED',
      requesterId: users['rahul.kumar@snapserve.io'].id,
      approverId: users['superadmin1@snapserve.io'].id,
      entityType: 'Task',
      entityId: 'task-fde-1001',
      decisionAt: subDays(now, 1),
      notes: 'Tested in staging sandbox with 0 regressions. Approved for live roll-out.',
    },
    update: {},
  });
  console.log('✅ Tickets and Approvals created');

  // ─── ORG SETTINGS ─────────────────────────────────────────────────────────
  const orgSettings = [
    { key: 'org_name', value: 'SnapServe', category: 'general' },
    { key: 'work_hours_per_day', value: '8', category: 'workload' },
    { key: 'default_currency', value: 'USD', category: 'general' },
    { key: 'ai_enabled', value: 'true', category: 'ai' },
    { key: 'escalation_enabled', value: 'true', category: 'notifications' },
    { key: 'overdue_escalation_hours', value: '24', category: 'notifications' },
  ];

  for (const s of orgSettings) {
    await prisma.orgSetting.upsert({ where: { key: s.key }, create: s, update: { value: s.value } });
  }

  console.log('✅ Notifications, workflows, and org settings created');
  console.log('');
  console.log('🎉 Seed complete! Login credentials:');
  console.log('   Super Admin:  superadmin1@snapserve.io / Admin@1234');
  console.log('   Super Admin:  superadmin2@snapserve.io / Admin@1234');
  console.log('   Admin:        admin1@snapserve.io / Admin@1234');
  console.log('   Admin:        admin2@snapserve.io / Admin@1234');
  console.log('   FDE:          rahul.kumar@snapserve.io / Employee@1234');
  console.log('   Marketing:    maya.roberts@snapserve.io / Employee@1234');
  console.log('   Sales:        david.cohen@snapserve.io / Employee@1234');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
