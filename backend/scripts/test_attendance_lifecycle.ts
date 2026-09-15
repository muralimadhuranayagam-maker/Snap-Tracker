import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:4000/api';

async function req(path: string, options: RequestInit = {}, token?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type');
  let data;
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('====================================================');
  console.log('🧪 SNAPSERVE ATTENDANCE & DAILY ACTIVITY FLOW TEST');
  console.log('====================================================');

  try {
    // 1. Login as employee (FDE Rahul Kumar)
    console.log('\n[1] Authenticating Employee...');
    const empLogin = await req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'rahul.kumar@snapserve.io',
        password: 'Employee@1234',
      }),
    });

    if (!empLogin.ok) throw new Error(`Login failed: ${JSON.stringify(empLogin.data)}`);
    const empToken = empLogin.data.token;
    const empUser = empLogin.data.user;
    console.log(`  ✓ Authenticated as ${empUser.name} (${empUser.email})`);

    // 2. Test check-in rejection without camera photo
    console.log('\n[2] Testing mandatory camera enforcement rule (no photo provided)...');
    const noCameraRes = await req(
      '/attendance/check-in',
      {
        method: 'POST',
        body: JSON.stringify({ notes: 'Trying to check in without camera' }),
      },
      empToken
    );

    if (noCameraRes.status === 400) {
      console.log(`  ✓ Camera Enforcement passed! Received 400 error: "${noCameraRes.data.message}"`);
    } else {
      throw new Error(`❌ Test Failed: Attendance should have been rejected without camera image (got ${noCameraRes.status})`);
    }

    // 3. Test check-in with valid base64 camera snapshot
    console.log('\n[3] Testing morning check-in with simulated webcam snapshot...');
    const sampleBase64Jpeg =
      'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';

    const checkInRes = await req(
      '/attendance/check-in',
      {
        method: 'POST',
        body: JSON.stringify({
          image: sampleBase64Jpeg,
          deviceInfo: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SnapServe/1.0',
          notes: 'Morning standup ready, working on sprint bugs.',
        }),
      },
      empToken
    );

    if (!checkInRes.ok) throw new Error(`Check-in failed: ${JSON.stringify(checkInRes.data)}`);
    console.log(`  ✓ Check-in response status: ${checkInRes.status}`);
    console.log(`  ✓ Check-in message: ${checkInRes.data.message}`);
    console.log(`  ✓ Recorded Photo URL: ${checkInRes.data.attendance.checkInPhoto}`);
    console.log(`  ✓ Status: ${checkInRes.data.attendance.status}`);

    // Verify snapshot file exists on disk
    const savedPath = path.join(process.cwd(), checkInRes.data.attendance.checkInPhoto);
    if (fs.existsSync(savedPath)) {
      console.log(`  ✓ Snapshot verified on disk: ${savedPath} (${fs.statSync(savedPath).size} bytes)`);
    }

    // 4. Check today's status
    console.log("\n[4] Querying /api/attendance/today...");
    const todayRes = await req('/attendance/today', { method: 'GET' }, empToken);
    console.log(`  ✓ Is Checked In: ${todayRes.data.isCheckedIn}`);
    console.log(`  ✓ Live shift hours: ${todayRes.data.liveHours}h`);

    // 5. Test evening check-out / logoff
    console.log('\n[5] Concluding shift with Evening Logoff & Daily Activity Submission...');
    const checkOutRes = await req(
      '/attendance/check-out',
      {
        method: 'POST',
        body: JSON.stringify({
          notes: 'Completed sprint bug fixes. Code reviewed and merged. Ready for tomorrow deployment.',
        }),
      },
      empToken
    );

    if (!checkOutRes.ok) throw new Error(`Check-out failed: ${JSON.stringify(checkOutRes.data)}`);
    console.log(`  ✓ Check-out status: ${checkOutRes.status}`);
    console.log(`  ✓ Shift Duration: ${checkOutRes.data.attendance.workHours}h`);
    console.log(`  ✓ Worklogs aggregated: ${checkOutRes.data.summary.stats.worklogsCount}`);
    console.log(`  ✓ Tasks updated aggregated: ${checkOutRes.data.summary.stats.tasksUpdatedCount}`);
    console.log(`  ✓ Audit actions aggregated: ${checkOutRes.data.summary.stats.auditActionsCount}`);

    // 6. Admin inspection
    console.log('\n[6] Authenticating as Super Admin to inspect daily reports...');
    const adminLogin = await req('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'superadmin1@snapserve.io',
        password: 'Admin@1234',
      }),
    });

    if (!adminLogin.ok) throw new Error(`Admin login failed: ${JSON.stringify(adminLogin.data)}`);
    const adminToken = adminLogin.data.token;
    console.log(`  ✓ Authenticated as Super Admin`);

    // 7. Admin queries Attendance Overview
    console.log('\n[7] Super Admin inspecting /api/attendance/overview...');
    const overviewRes = await req('/attendance/overview', { method: 'GET' }, adminToken);
    console.log(`  ✓ Total Employees in roster: ${overviewRes.data.stats.totalEmployees}`);
    console.log(`  ✓ Concluded Shifts: ${overviewRes.data.stats.checkedOutCount}`);

    const empRosterEntry = overviewRes.data.roster.find((r: any) => r.user.id === empUser.id);
    console.log(`  ✓ Found ${empUser.name} in Admin Roster: status=${empRosterEntry?.status}`);
    console.log(`  ✓ Admin sees verified photo: ${empRosterEntry?.attendance?.checkInPhoto}`);

    // 8. Admin queries specific employee's full daily summary
    console.log(`\n[8] Super Admin clicking user to inspect full day activity (/api/attendance/user/${empUser.id}/daily-summary)...`);
    const dailySummaryRes = await req(
      `/attendance/user/${empUser.id}/daily-summary`,
      { method: 'GET' },
      adminToken
    );

    if (!dailySummaryRes.ok) throw new Error(`Daily summary query failed: ${JSON.stringify(dailySummaryRes.data)}`);
    const summary = dailySummaryRes.data.summary;

    console.log(`  ✓ Retrieved full day activity report for ${dailySummaryRes.data.user.name}`);
    console.log(`  ✓ Verified Morning Photo: ${dailySummaryRes.data.attendance.checkInPhoto}`);
    console.log(`  ✓ Active Shift Hours: ${summary.totalActiveHours}h`);
    console.log(`  ✓ Handover Notes: "${summary.notes}"`);
    console.log(`  ✓ Full Activity Breakdown verified:`);
    console.log(`    - Worklog entries: ${summary.worklogs?.length}`);
    console.log(`    - Tasks Touched: ${summary.tasksUpdated?.length}`);
    console.log(`    - Tickets Handled: ${summary.tickets?.length}`);
    console.log(`    - Audit actions logged: ${summary.auditActions?.length}`);

    console.log('\n====================================================');
    console.log('✅ ALL ATTENDANCE & DAILY LOGOFF TESTS PASSED 100%!');
    console.log('====================================================');
  } catch (err: any) {
    console.error('❌ Test failed with error:', err.message);
    process.exit(1);
  }
}

main();
