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
  const employeePerms = ['tasks:view', 'projects:view', 'ai:use', 'departments:view', 'users:view'];

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
    { email: 'superadmin1@snapserve.io', name: 'System Admin', password: hash('Admin@1234'), roleId: superAdminRole.id, title: 'Super Admin', departmentId: null },
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
  console.log(`✅ ${usersData.length} user created`);

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
    { name: 'IN_PROGRESS', category: 'ACTIVE', color: '#6366f1', icon: 'play-circle', order: 1, isSystem: true },
    { name: 'BLOCKED', category: 'ACTIVE', color: '#ef4444', icon: 'x-circle', order: 2, isSystem: true },
    { name: 'IN_REVIEW', category: 'REVIEW', color: '#f59e0b', icon: 'eye', order: 3, isSystem: true },
    { name: 'DONE', category: 'DONE', color: '#22c55e', icon: 'check-circle-2', order: 4, isSystem: true, isTerminal: true },
    { name: 'TODO', category: 'PENDING', color: '#3b82f6', icon: 'circle', order: 10, isSystem: true },
    { name: 'APPROVED', category: 'REVIEW', color: '#10b981', icon: 'check-circle', order: 11, isSystem: true },
    { name: 'CANCELLED', category: 'CANCELLED', color: '#6b7280', icon: 'ban', order: 12, isSystem: true, isTerminal: true },
  ];

  const statuses: Record<string, any> = {};
  for (const s of statusesList) {
    const status = await prisma.taskStatus.upsert({
      where: { name: s.name },
      create: s,
      update: { order: s.order },
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

  // (Mock operational data removed for production)

  // ─── WORKFLOWS ────────────────────────────────────────────────────────────
  await prisma.workflow.deleteMany({ where: { isSystem: true } });

  // (Mock operational data removed for production)

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
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
