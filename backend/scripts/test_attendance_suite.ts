import { prisma } from '../src/lib/prisma';
import jwt from 'jsonwebtoken';

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING REAL-WORLD ATTENDANCE & ACTIVITY SUITE');
  console.log('====================================================');

  // Find users for testing
  const allUsers = await prisma.user.findMany({
    include: { role: true },
  });

  const superAdmin = allUsers.find((u) => u.role.name === 'SUPER_ADMIN');
  const regularEmployee = allUsers.find((u) => u.role.name === 'EMPLOYEE' || u.role.name === 'FDE');

  if (!superAdmin || !regularEmployee) {
    throw new Error('Required test users (SUPER_ADMIN and EMPLOYEE) not found in DB.');
  }

  console.log(`Using Super Admin: ${superAdmin.email} (${superAdmin.role.name})`);
  console.log(`Using Regular Employee: ${regularEmployee.email} (${regularEmployee.role.name})`);

  const jwtSecret = process.env.JWT_SECRET || 'snapserve-super-secure-secret-key-2026';

  const employeeToken = jwt.sign({ userId: regularEmployee.id }, jwtSecret, { expiresIn: '1h' });
  const adminToken = jwt.sign({ userId: superAdmin.id }, jwtSecret, { expiresIn: '1h' });

  const BASE_URL = 'http://localhost:4000/api/attendance';

  // Clean today's record for fresh test execution
  const todayStr = new Date().toISOString().split('T')[0];
  await prisma.attendanceRecord.deleteMany({
    where: { userId: regularEmployee.id, date: todayStr },
  });
  await prisma.employeeActivitySummary.deleteMany({
    where: { userId: regularEmployee.id, date: todayStr },
  });
  await prisma.attendanceEvent.deleteMany({
    where: { userId: regularEmployee.id, date: todayStr },
  });

  console.log('\n--- TEST 1: Employee marks daily attendance ---');
  let res = await fetch(`${BASE_URL}/mark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  let data: any = await res.json();
  console.log('Mark Attendance response:', res.status, data.record?.currentState);
  if (res.status !== 201 || data.record?.currentState !== 'ATTENDANCE_MARKED') {
    throw new Error('TEST 1 FAILED');
  }

  console.log('\n--- TEST 2: Duplicate daily attendance prevention ---');
  res = await fetch(`${BASE_URL}/mark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Duplicate mark response:', res.status, data.message);
  if (res.status !== 200 || !data.message.includes('already marked')) {
    throw new Error('TEST 2 FAILED');
  }

  console.log('\n--- TEST 3: Employee starts working (face session) ---');
  res = await fetch(`${BASE_URL}/start-work`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Start work response:', res.status, data.record?.currentState, 'Active interval:', data.activeInterval?.type);
  if (res.status !== 200 || data.record?.currentState !== 'WORKING' || data.activeInterval?.type !== 'WORK') {
    throw new Error('TEST 3 FAILED');
  }

  console.log('\n--- TEST 4: Face presence detection heartbeat (Working state) ---');
  // Simulate 3 seconds of face verified working
  await new Promise((r) => setTimeout(r, 1000));
  res = await fetch(`${BASE_URL}/face-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
    body: JSON.stringify({ isFaceDetected: true, confidence: 94 }),
  });
  data = await res.json();
  console.log('Face status response:', data.status, 'Verified working seconds:', data.verifiedWorkingSeconds);
  if (data.status !== 'ok' || data.currentState !== 'WORKING') {
    throw new Error('TEST 4 FAILED');
  }

  console.log('\n--- TEST 5: Face disappears (transitions to FACE_NOT_DETECTED) ---');
  res = await fetch(`${BASE_URL}/face-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
    body: JSON.stringify({ isFaceDetected: false, confidence: 0 }),
  });
  data = await res.json();
  console.log('Face lost response:', data.status, 'Current state:', data.currentState);
  if (data.status !== 'ok' || data.currentState !== 'FACE_NOT_DETECTED') {
    throw new Error('TEST 5 FAILED');
  }

  console.log('\n--- TEST 6: Face returns (transitions back to WORKING) ---');
  await new Promise((r) => setTimeout(r, 1000));
  res = await fetch(`${BASE_URL}/face-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
    body: JSON.stringify({ isFaceDetected: true, confidence: 92 }),
  });
  data = await res.json();
  console.log('Face returned response:', data.status, 'Current state:', data.currentState, 'Face missing seconds:', data.faceMissingSeconds);
  if (data.status !== 'ok' || data.currentState !== 'WORKING' || data.faceMissingSeconds <= 0) {
    throw new Error('TEST 6 FAILED');
  }

  console.log('\n--- TEST 7: Activity monitoring heartbeat (Mouse/Keyboard events) ---');
  const initialVerified = data.verifiedWorkingSeconds;
  res = await fetch(`${BASE_URL}/activity-heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${employeeToken}` },
    body: JSON.stringify({
      mouseActiveSeconds: 45,
      keyboardActiveSeconds: 30,
      idleSeconds: 10,
      mouseEventCount: 500,
      mouseClickCount: 35,
      scrollCount: 20,
      keyboardEventCount: 150,
    }),
  });
  data = await res.json();
  console.log('Activity heartbeat response:', res.status, data.status);
  if (res.status !== 200 || data.status !== 'ok') {
    throw new Error('TEST 7 FAILED');
  }

  console.log('\n--- TEST 8: VERIFY CRITICAL BUSINESS RULE: Mouse/Keyboard activity DOES NOT increase working hours! ---');
  const recordAfterActivity = await prisma.attendanceRecord.findUnique({
    where: { userId_date: { userId: regularEmployee.id, date: todayStr } },
  });
  console.log(`Working seconds before activity: ${initialVerified}, after activity: ${recordAfterActivity?.verifiedWorkingSeconds}`);
  if (recordAfterActivity?.verifiedWorkingSeconds !== initialVerified) {
    throw new Error('CRITICAL FAILURE: Mouse/Keyboard activity improperly affected working hours!');
  }
  console.log('✓ PASS: Official working hours were completely unaffected by mouse/keyboard activity.');

  console.log('\n--- TEST 9: Break workflow (Start & End) ---');
  res = await fetch(`${BASE_URL}/break-start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Break start response:', data.record?.currentState);
  if (data.record?.currentState !== 'ON_BREAK') {
    throw new Error('TEST 9 (Break Start) FAILED');
  }

  await new Promise((r) => setTimeout(r, 1000));

  res = await fetch(`${BASE_URL}/break-end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Break end response:', data.record?.currentState, 'Break seconds recorded:', data.record?.breakSeconds);
  if (data.record?.currentState !== 'WORKING' || data.record?.breakSeconds <= 0) {
    throw new Error('TEST 9 (Break End) FAILED');
  }

  console.log('\n--- TEST 10: Lunch workflow (Start & End) ---');
  res = await fetch(`${BASE_URL}/lunch-start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Lunch start response:', data.record?.currentState);
  if (data.record?.currentState !== 'ON_LUNCH') {
    throw new Error('TEST 10 (Lunch Start) FAILED');
  }

  await new Promise((r) => setTimeout(r, 1000));

  res = await fetch(`${BASE_URL}/lunch-end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Lunch end response:', data.record?.currentState, 'Lunch seconds recorded:', data.record?.lunchSeconds);
  if (data.record?.currentState !== 'WORKING' || data.record?.lunchSeconds <= 0) {
    throw new Error('TEST 10 (Lunch End) FAILED');
  }

  console.log('\n--- TEST 10B: Meeting workflow (Camera turned off & Meeting time added to working hours) ---');
  const workingSecBeforeMeeting = data.record?.verifiedWorkingSeconds || 0;
  res = await fetch(`${BASE_URL}/meeting-start`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Meeting start response:', data.record?.currentState);
  if (data.record?.currentState !== 'IN_MEETING') {
    throw new Error('TEST 10B (Meeting Start) FAILED');
  }

  // Simulate 2 seconds of meeting time
  await new Promise((r) => setTimeout(r, 2000));

  // Check GET /today during meeting: meeting time should dynamically accumulate into verifiedWorkingSeconds
  res = await fetch(`${BASE_URL}/today`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('During meeting GET /today:', {
    currentState: data.record?.currentState,
    meetingSeconds: data.record?.meetingSeconds,
    verifiedWorkingSeconds: data.record?.verifiedWorkingSeconds,
  });
  if (data.record?.currentState !== 'IN_MEETING' || data.record?.meetingSeconds < 2) {
    throw new Error('TEST 10B (During meeting GET /today) FAILED');
  }

  // End meeting
  res = await fetch(`${BASE_URL}/meeting-end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Meeting end response:', {
    currentState: data.record?.currentState,
    meetingSeconds: data.record?.meetingSeconds,
    verifiedWorkingSeconds: data.record?.verifiedWorkingSeconds,
  });
  if (
    data.record?.currentState !== 'WORKING' ||
    data.record?.meetingSeconds < 2 ||
    data.record?.verifiedWorkingSeconds <= workingSecBeforeMeeting
  ) {
    throw new Error('TEST 10B (Meeting End) FAILED: Meeting time not properly added to working hours!');
  }
  console.log('✓ PASS: Meeting time correctly added to official working hours and camera state restored.');

  console.log('\n--- TEST 11: End Workday ---');
  res = await fetch(`${BASE_URL}/end-workday`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('End workday response:', data.record?.currentState, 'isCompleted:', data.record?.isCompleted);
  if (data.record?.currentState !== 'WORKDAY_COMPLETED' || !data.record?.isCompleted) {
    throw new Error('TEST 11 FAILED');
  }

  console.log('\n--- TEST 12: Block new work start after workday completion ---');
  res = await fetch(`${BASE_URL}/start-work`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('Start work after completion status:', res.status, data.error);
  if (res.status !== 400) {
    throw new Error('TEST 12 FAILED: Allowed start-work after completed workday');
  }

  console.log('\n--- TEST 13: Normal employee authorization restriction (Admin endpoints) ---');
  res = await fetch(`${BASE_URL}/admin/overview`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  console.log('Employee access to /admin/overview status:', res.status);
  if (res.status !== 403) {
    throw new Error('TEST 13 FAILED: Regular employee accessed admin endpoint!');
  }

  res = await fetch(`${BASE_URL}/admin/activity`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  console.log('Employee access to /admin/activity status:', res.status);
  if (res.status !== 403) {
    throw new Error('TEST 13 FAILED: Regular employee accessed activity analytics!');
  }

  console.log('\n--- TEST 14: Super Admin access to Activity Monitoring & Overview ---');
  res = await fetch(`${BASE_URL}/admin/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  data = await res.json();
  console.log('Admin overview status:', res.status, 'Total employees:', data.metrics?.totalEmployees);
  if (res.status !== 200 || typeof data.metrics?.totalEmployees !== 'number') {
    throw new Error('TEST 14 FAILED');
  }

  res = await fetch(`${BASE_URL}/admin/activity`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  data = await res.json();
  const trackedEmp = data.employees?.find((e: any) => e.user.id === regularEmployee.id);
  console.log('Admin activity for tested employee:', {
    name: trackedEmp?.user.name,
    verifiedWorkingSeconds: trackedEmp?.verifiedWorkingSeconds,
    mouseClicks: trackedEmp?.mouseClickCount,
    keyboardEvents: trackedEmp?.keyboardEventCount,
    mouseActiveSeconds: trackedEmp?.mouseActiveSeconds,
  });
  if (res.status !== 200 || !trackedEmp || trackedEmp.mouseClickCount !== 35 || trackedEmp.keyboardEventCount !== 150) {
    throw new Error('TEST 14 FAILED: Activity summaries mismatch');
  }

  console.log('\n--- TEST 15: Super Admin individual employee breakdown ---');
  res = await fetch(`${BASE_URL}/admin/employee/${regularEmployee.id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  data = await res.json();
  console.log('Employee breakdown official status:', data.officialAttendance?.status, 'Activity clicks:', data.activityAnalytics?.mouseClickCount);
  if (res.status !== 200 || !data.officialAttendance || !data.activityAnalytics) {
    throw new Error('TEST 15 FAILED');
  }

  console.log('\n--- TEST 16: Employee personal history (Verified working only, no activity analytics) ---');
  res = await fetch(`${BASE_URL}/my-history`, {
    headers: { Authorization: `Bearer ${employeeToken}` },
  });
  data = await res.json();
  console.log('My history records count:', data.records?.length);
  const firstRec = data.records?.[0];
  if (res.status !== 200 || !firstRec || firstRec.mouseClickCount !== undefined) {
    throw new Error('TEST 16 FAILED: Employee history leaked activity metrics');
  }

  console.log('\n--- TEST 17: Super Admin marks attendance alone (no camera tracking required) ---');
  // Clean today's record for superAdmin
  await prisma.attendanceRecord.deleteMany({
    where: { userId: superAdmin.id, date: todayStr },
  });
  res = await fetch(`${BASE_URL}/mark`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  data = await res.json();
  console.log('Super Admin mark attendance response:', res.status, data.record?.currentState);
  if (res.status !== 201 || data.record?.currentState !== 'ATTENDANCE_MARKED') {
    throw new Error('TEST 17 FAILED: Super Admin could not mark attendance');
  }
  console.log('✓ PASS: Super Admin marked attendance successfully without camera requirement.');

  console.log('\n====================================================');
  console.log('ALL 17 PRODUCTION TEST SUITE ASSERTIONS PASSED! ✓');
  console.log('====================================================');
}

runTestSuite()
  .catch((e) => {
    console.error('TEST SUITE FAILED:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
