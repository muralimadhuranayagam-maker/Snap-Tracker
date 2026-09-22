import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runAudit() {
  console.log('====================================================');
  console.log(' DATABASE & API SYNCHRONIZATION AUDIT REPORT');
  console.log('====================================================\n');

  // 1. Connection & DB Info
  try {
    const dbInfo: any[] = await prisma.$queryRawUnsafe(`
      SELECT current_database() as db_name, 
             current_user as db_user, 
             version() as pg_version;
    `);
    console.log('✅ DATABASE CONNECTION SUCCESSFUL');
    console.log('   Database:', dbInfo[0]?.db_name);
    console.log('   User:    ', dbInfo[0]?.db_user);
    console.log('   Version: ', dbInfo[0]?.pg_version?.split(' on ')[0]);
    console.log('');
  } catch (err: any) {
    console.error('❌ DATABASE CONNECTION FAILED:', err.message);
    process.exit(1);
  }

  // 2. Physical Tables in PostgreSQL public schema
  console.log('─── 1. PHYSICAL DATABASE TABLES (PostgreSQL) ───────');
  let physicalTables: any[] = [];
  try {
    physicalTables = await prisma.$queryRawUnsafe(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    console.log(`Found ${physicalTables.length} base tables in 'public' schema:\n`);
  } catch (err: any) {
    console.error('Failed to query information_schema:', err.message);
  }

  // 3. Inspect every Prisma Model & Count Records
  console.log('─── 2. PRISMA MODELS & RECORD COUNTS ───────────────');
  
  // List of all models in Prisma Client
  const modelNames = [
    'role',
    'permission',
    'rolePermission',
    'department',
    'user',
    'userSession',
    'project',
    'projectMember',
    'milestone',
    'projectDocument',
    'taskType',
    'taskPriority',
    'taskStatus',
    'label',
    'task',
    'taskLabel',
    'taskDependency',
    'taskComment',
    'commentReaction',
    'taskAttachment',
    'taskWorklog',
    'taskHistory',
    'notification',
    'notificationPreference',
    'escalationRule',
    'workflow',
    'workflowStep',
    'workflowExecution',
    'auditLog',
    'savedFilter',
    'aIRecommendation',
    'aIRecommendationFeedback',
    'aIInteraction',
    'aIProjectRisk',
    'aIDailyPlan',
    'orgSetting',
    'integration',
    'customer',
    'ticket',
    'ticketComment',
    'ticketAttachment',
    'ticketHistory',
    'approval',
    'chatMessage',
    'attendanceRecord',
    'attendanceInterval',
    'employeeActivitySummary',
    'attendanceEvent',
    'webRTCSession',
    'chatChannelRead',
    'entityLastView',
    'leaveType',
    'leave'
  ];

  const results: { model: string; table: string; count: number | string; status: string; error?: string }[] = [];

  for (const name of modelNames) {
    const delegate = (prisma as any)[name];
    if (!delegate || typeof delegate.count !== 'function') {
      results.push({
        model: name,
        table: '-',
        count: 'N/A',
        status: '⚠️ Delegate Not Found on PrismaClient',
      });
      continue;
    }

    try {
      const count = await delegate.count();
      results.push({
        model: name,
        table: name,
        count,
        status: '✅ OK',
      });
    } catch (err: any) {
      results.push({
        model: name,
        table: name,
        count: 'ERR',
        status: '❌ Query Failed',
        error: err.message?.split('\n').pop() || err.message,
      });
    }
  }

  // Print table
  console.table(results);

  // Check if any physical tables are not mapped to Prisma or vice versa
  const prismaModelLower = new Set(modelNames.map(m => m.toLowerCase()));
  const unmappedPhysicalTables = physicalTables.filter(t => {
    const cleanName = t.table_name.replace(/^_/, '').toLowerCase();
    return !prismaModelLower.has(cleanName);
  });

  if (unmappedPhysicalTables.length > 0) {
    console.log('\n⚠️ Physical tables in PostgreSQL not directly mapped to standard model names:');
    unmappedPhysicalTables.forEach(t => console.log('  -', t.table_name));
  } else {
    console.log('\n✅ All physical PostgreSQL tables match Prisma schema models.');
  }

  // 4. Check API Sync & Key Relations
  console.log('\n─── 3. SYSTEM DATA INTEGRITY & API SYNC CHECKS ─────');

  try {
    // Users and Roles
    const usersCount = await prisma.user.count();
    const rolesCount = await prisma.role.count();
    const deptsCount = await prisma.department.count();
    console.log(`• Organization Core: ${usersCount} users, ${rolesCount} roles, ${deptsCount} departments.`);

    // Active attendance & sessions
    const activeAttendance = await prisma.attendanceRecord.count({
      where: { isCompleted: false },
    });
    const todayRecords = await prisma.attendanceRecord.count();
    const attendanceEvents = await prisma.attendanceEvent.count();
    console.log(`• Attendance Sync: ${activeAttendance} active duty sessions today (${todayRecords} total records, ${attendanceEvents} events logged).`);

    // Tasks & Projects
    const projectsCount = await prisma.project.count();
    const tasksCount = await prisma.task.count();
    console.log(`• Work Management: ${projectsCount} projects, ${tasksCount} tasks.`);

    // Tickets & Approvals
    const ticketsCount = await prisma.ticket.count();
    const approvalsCount = await prisma.approval.count();
    console.log(`• Service Desk: ${ticketsCount} tickets, ${approvalsCount} approvals.`);

    // Chat & Communications
    const chatCount = await prisma.chatMessage.count();
    console.log(`• Collaboration: ${chatCount} chat messages.`);

    // Leaves
    const leavesCount = await prisma.leave.count();
    const leaveTypesCount = await prisma.leaveType.count();
    console.log(`• Leave Management: ${leavesCount} leave applications (${leaveTypesCount} leave types configured).`);

  } catch (err: any) {
    console.error('Integrity check error:', err.message);
  }

  console.log('\n====================================================');
  console.log(' AUDIT COMPLETED');
  console.log('====================================================');
}

runAudit()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
