import axios from 'axios';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';

const BASE_URL = 'http://localhost:4000/api';
const JWT_SECRET = process.env.JWT_SECRET || 'snapserve_super_secret_jwt_key_change_in_production_2024';

async function runTest() {
  console.log('🚀 Running Approvals Test Suite...');

  // 1. Find users in DB
  const users = await prisma.user.findMany({
    include: { role: true }
  });

  const employee = users.find(u => u.role.name === 'EMPLOYEE');
  const superAdmin = users.find(u => u.role.name === 'SUPER_ADMIN');
  const admin = users.find(u => u.role.name === 'ADMIN');

  if (!employee || !superAdmin) {
    throw new Error('Required test users not found in DB.');
  }

  const employeeToken = jwt.sign({ userId: employee.id }, JWT_SECRET, { expiresIn: '1h' });
  const superAdminToken = jwt.sign({ userId: superAdmin.id }, JWT_SECRET, { expiresIn: '1h' });
  const adminToken = admin ? jwt.sign({ userId: admin.id }, JWT_SECRET, { expiresIn: '1h' }) : null;

  console.log(`✅ Test Employee: ${employee.name} (${employee.email})`);
  console.log(`✅ Test Super Admin: ${superAdmin.name} (${superAdmin.email})`);
  if (admin) console.log(`✅ Test Admin: ${admin.name} (${admin.email})`);

  // 2. Test GET /approvals/approvers
  const approversRes = await axios.get(`${BASE_URL}/approvals/approvers`, {
    headers: { Authorization: `Bearer ${employeeToken}` }
  });
  const approvers = approversRes.data;
  console.log(`✅ GET /api/approvals/approvers returned ${approvers.length} members.`);

  if (approvers.length === 0) {
    throw new Error('Expected at least 1 approver');
  }

  for (const a of approvers) {
    if (!['ADMIN', 'SUPER_ADMIN'].includes(a.role?.name)) {
      throw new Error(`Non-admin user returned in approvers list: ${a.name} (${a.role?.name})`);
    }
  }
  console.log('✅ Verified: Only SUPER_ADMIN and ADMIN users are returned in approvers list.');

  // 3. Test POST /approvals without approverId (must fail with 400)
  try {
    await axios.post(`${BASE_URL}/approvals`, {
      title: 'Missing Approver Test',
      type: 'TASK_COMPLETION',
      description: 'Should fail'
    }, {
      headers: { Authorization: `Bearer ${employeeToken}` }
    });
    throw new Error('Expected 400 when approverId is missing');
  } catch (err: any) {
    if (err.response?.status === 400) {
      console.log(`✅ Rejection verified (400): "${err.response.data.error}"`);
    } else {
      throw err;
    }
  }

  // 4. Submit approval request specifically targeting Super Admin
  const targetSuperAdmin = approvers.find((a: any) => a.id === superAdmin.id);
  const createRes = await axios.post(`${BASE_URL}/approvals`, {
    title: 'Production Deploy Sign-off',
    type: 'DEPLOYMENT',
    description: 'All 15 automated test suites passing. Requesting authorization to deploy.',
    approverId: targetSuperAdmin.id,
  }, {
    headers: { Authorization: `Bearer ${employeeToken}` }
  });

  const createdApproval = createRes.data;
  console.log(`✅ Successfully submitted approval request [${createdApproval.id}]`);
  console.log(`   Requester: ${createdApproval.requester?.name}`);
  console.log(`   Assigned Approver: ${createdApproval.approver?.name} (${createdApproval.approverId})`);

  if (createdApproval.approverId !== targetSuperAdmin.id) {
    throw new Error(`approverId mismatch: expected ${targetSuperAdmin.id}, got ${createdApproval.approverId}`);
  }

  // 5. Test if an unassigned admin tries to decide on this request (if admin exists)
  if (admin && admin.id !== targetSuperAdmin.id && adminToken) {
    try {
      await axios.patch(`${BASE_URL}/approvals/${createdApproval.id}/decision`, {
        decision: 'APPROVED',
        notes: 'Trying to approve someone else request'
      }, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      throw new Error('Expected 403 when non-assigned admin tries to decide');
    } catch (err: any) {
      if (err.response?.status === 403) {
        console.log(`✅ Correctly blocked unauthorized admin from deciding: "${err.response.data.error}"`);
      } else {
        throw err;
      }
    }
  }

  // 6. Assigned Super Admin approves the request
  const decideRes = await axios.patch(`${BASE_URL}/approvals/${createdApproval.id}/decision`, {
    decision: 'APPROVED',
    notes: 'Approved for production deployment. Great work!'
  }, {
    headers: { Authorization: `Bearer ${superAdminToken}` }
  });

  console.log(`✅ Assigned approver successfully approved request:`);
  console.log(`   Status: ${decideRes.data.status}`);
  console.log(`   Decided By: ${decideRes.data.approver?.name}`);

  // 7. Verify GET /approvals returns the updated record with assigned approver
  const listRes = await axios.get(`${BASE_URL}/approvals`, {
    headers: { Authorization: `Bearer ${employeeToken}` }
  });
  const found = listRes.data.find((a: any) => a.id === createdApproval.id);
  if (!found) throw new Error('Created approval not found in employee list');
  if (found.approver?.id !== targetSuperAdmin.id) throw new Error('Approver mismatch in list');

  console.log(`✅ Employee approvals list correctly displays assigned approver: ${found.approver?.name}`);

  console.log('🎉 ALL APPROVAL TESTS PASSED WITH 100% SUCCESS!');
}

runTest().catch((err) => {
  console.error('❌ Test failed:', err.response?.data || err.message);
  process.exit(1);
});
