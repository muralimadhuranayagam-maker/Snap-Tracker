import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:4000/api';

async function runVerification() {
  console.log('--- STARTING VERIFICATION: Screenshots in Raise Issue & Super Admin Active Tasks ---');

  // 1. Authenticate as Super Admin
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'superadmin1@snapserve.io',
      password: 'Admin@1234'
    })
  });
  const loginData: any = await loginRes.json();
  if (!loginRes.ok) throw new Error(`Login failed: ${JSON.stringify(loginData)}`);
  const token = loginData.token;
  console.log('1. Super Admin logged in successfully. User:', loginData.user.email);

  const authHeaders = { Authorization: `Bearer ${token}` };

  // 2. Test File Upload Endpoint for Screenshots
  // Create a minimal 1x1 png dummy file
  const minimalPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000000020001e527defc0000000049454e44ae426082',
    'hex'
  );

  const form = new FormData();
  form.append('file', new Blob([minimalPng], { type: 'image/png' }), 'error_screen.png');

  const uploadRes = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    headers: authHeaders,
    body: form
  });

  const uploadData: any = await uploadRes.json();
  console.log('2. Screenshot upload response:', uploadData);
  if (!uploadData.url) {
    throw new Error('Upload failed: no URL returned');
  }

  // 3. Create Ticket with Screenshot Attachment (Raise Issue flow)
  const prioritiesRes = await fetch(`${API_BASE}/priorities`, { headers: authHeaders });
  const priorities: any = await prioritiesRes.json();
  const priority = priorities[0] || { id: 'urgent' };

  const ticketPayload = {
    title: 'Payment Gateway UI Error [With Screenshot]',
    description: 'Encountered visual glitch when processing checkout. Screenshot attached below.',
    priorityId: priority.id,
    attachments: [
      {
        name: uploadData.name,
        originalName: uploadData.originalName,
        mimeType: uploadData.mimeType,
        size: uploadData.size,
        url: uploadData.url
      }
    ]
  };

  const createTicketRes = await fetch(`${API_BASE}/tickets`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(ticketPayload)
  });

  const ticket: any = await createTicketRes.json();
  if (!createTicketRes.ok) throw new Error(`Ticket create failed: ${JSON.stringify(ticket)}`);
  console.log(`3. Created ticket ${ticket.ticketId} with attachment.`);

  // 4. Fetch the Ticket to confirm attachment is persisted
  const getTicketRes = await fetch(`${API_BASE}/tickets/${ticket.id}`, { headers: authHeaders });
  const fetchedTicket: any = await getTicketRes.json();
  const fetchedAttachments = fetchedTicket.attachments;
  console.log(`4. Fetched ticket attachments count: ${fetchedAttachments?.length}`);
  if (!fetchedAttachments || fetchedAttachments.length === 0) {
    throw new Error('Attachments not linked to ticket in database!');
  }
  console.log('   Attachment details:', fetchedAttachments[0].originalName, fetchedAttachments[0].url);

  // 5. Test Active Tasks & Velocity Tracking
  const tasksRes = await fetch(`${API_BASE}/tasks?limit=100`, { headers: authHeaders });
  const tasksData: any = await tasksRes.json();
  const allTasks = tasksData?.tasks || tasksData?.data || [];
  const activeTasks = allTasks.filter((t: any) => t.status?.name !== 'DONE' && t.status?.name !== 'CANCELLED');

  console.log(`5. Retrieved ${activeTasks.length} active tasks in flight.`);
  let sampleActiveTask = activeTasks[0];
  if (sampleActiveTask) {
    console.log(`   Sample Task: [${sampleActiveTask.taskId}] ${sampleActiveTask.title}`);
    console.log(`   Status: ${sampleActiveTask.status?.name}, Priority: ${sampleActiveTask.priority?.name}`);
    console.log(`   Assignee: ${sampleActiveTask.assignee?.name || 'Unassigned'}, Dept: ${sampleActiveTask.department?.code}`);
    console.log(`   Logged Hours: ${sampleActiveTask.actualHours || 0}h, Est Hours: ${sampleActiveTask.estimatedHours || 4}h`);
    console.log(`   Due Date: ${sampleActiveTask.dueDate || 'None'}`);
    if (sampleActiveTask.ticket) {
      console.log(`   Origin Ticket: ${sampleActiveTask.ticket.ticketId} - ${sampleActiveTask.ticket.title}`);
    }
  }

  console.log('--- ALL VERIFICATION CHECKS PASSED WITH REAL DATA AND REAL ENDPOINTS ---');
}

runVerification().catch(err => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
