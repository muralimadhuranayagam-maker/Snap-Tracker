import { WebSocket } from 'ws';

const API_URL = 'http://localhost:4000/api';
const WS_URL = 'ws://localhost:4000';

async function request(url: string, options: any = {}): Promise<any> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`Request failed [${res.status} ${res.statusText}]: ${JSON.stringify(data)}`);
  }
  return data;
}

class WSTestClient {
  private ws: WebSocket | null = null;
  public events: Array<{ type: string; payload: any; timestamp?: string }> = [];

  constructor(private token: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_URL}?token=${this.token}`);
      this.ws.on('open', () => {
        resolve();
      });
      this.ws.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this.events.push(parsed);
        } catch {
          // ignore non-json
        }
      });
      this.ws.on('error', (err) => {
        reject(err);
      });
    });
  }

  async waitForEvent(eventType: string, timeoutMs = 5000): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const match = this.events.find(e => e.type === eventType);
      if (match) {
        // remove so subsequent checks look for fresh events
        this.events = this.events.filter(e => e !== match);
        return match;
      }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`Timeout waiting for WebSocket event: ${eventType}. Received events: ${this.events.map(e => e.type).join(', ')}`);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

async function runWebSocketE2ETest() {
  console.log('====================================================');
  console.log(' SNAPSERVE — WEBSOCKET REAL-TIME ENDPOINT AUDIT');
  console.log('====================================================\n');

  // Step 1: Authenticate Super Admin
  console.log('1. Authenticating Super Admin...');
  const auth = await request(`${API_URL}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: 'superadmin1@snapserve.io',
      password: 'Admin@1234',
    }),
  });
  const token = auth.token;
  console.log('   Authenticated successfully. Token acquired.');

  // Step 2: Establish WebSocket Connection
  console.log('\n2. Connecting WebSocket client with JWT token...');
  const client = new WSTestClient(token);
  await client.connect();
  const connectedMsg = await client.waitForEvent('CONNECTED');
  console.log(`   Connected! Initial Handshake: ${JSON.stringify(connectedMsg)}`);

  let passedChecks = 0;
  let totalChecks = 0;

  async function checkEvent(name: string, triggerAction: () => Promise<any>, expectedEvent: string) {
    totalChecks++;
    console.log(`\n--- [Check ${totalChecks}] Testing: ${name} ---`);
    const actionResult = await triggerAction();
    console.log(`    API endpoint called successfully.`);
    const event = await client.waitForEvent(expectedEvent);
    console.log(`    WebSocket event received: ${event.type}`);
    console.log(`    Payload summary: ${JSON.stringify(event.payload).slice(0, 100)}...`);
    passedChecks++;
    return { actionResult, event };
  }

  // Check: Ticket Creation
  let createdTicket: any;
  await checkEvent('POST /api/tickets (Create Ticket)', async () => {
    const res = await request(`${API_URL}/tickets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `WS Audit Ticket ${Date.now()}`,
        description: 'Verifying WebSocket real-time broadcast on ticket creation',
        priority: 'HIGH',
        category: 'Integration Issue',
      }),
    });
    createdTicket = res;
    return res;
  }, 'TICKET_CREATED');

  // Check: Ticket Update
  await checkEvent(`PATCH /api/tickets/${createdTicket.id} (Update Ticket)`, async () => {
    return request(`${API_URL}/tickets/${createdTicket.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        priority: 'CRITICAL',
      }),
    });
  }, 'TICKET_UPDATED');

  // Check: Ticket Comment
  await checkEvent(`POST /api/tickets/${createdTicket.id}/comments (Ticket Comment)`, async () => {
    return request(`${API_URL}/tickets/${createdTicket.id}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        content: 'Real-time WebSocket comment test',
      }),
    });
  }, 'TICKET_COMMENTED');

  // Check: Ticket Convert to Task
  let convertedTask: any;
  await checkEvent(`POST /api/tickets/${createdTicket.id}/convert-to-task (Convert Ticket to Task)`, async () => {
    const res = await request(`${API_URL}/tickets/${createdTicket.id}/convert-to-task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        estimatedHours: 6,
      }),
    });
    convertedTask = res.task;
    return res;
  }, 'TICKET_CONVERTED');

  // Check: Task Update
  await checkEvent(`PATCH /api/tasks/${convertedTask.id} (Update Task)`, async () => {
    return request(`${API_URL}/tasks/${convertedTask.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `Updated Title for ${convertedTask.taskId}`,
      }),
    });
  }, 'TASK_UPDATED');

  // Check: Task Comment
  await checkEvent(`POST /api/comments (Task Comment)`, async () => {
    return request(`${API_URL}/comments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        taskId: convertedTask.id,
        content: 'Task WebSocket comment live broadcast check',
      }),
    });
  }, 'TASK_COMMENTED');

  // Check: Worklog Addition
  await checkEvent(`POST /api/worklogs (Log Hours on Task)`, async () => {
    return request(`${API_URL}/worklogs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        taskId: convertedTask.id,
        hours: 2.5,
        description: 'WS test worklog logging',
      }),
    });
  }, 'TASK_WORKLOG_ADDED');

  // Check: Approval Request
  let createdApproval: any;
  await checkEvent('POST /api/approvals (Request Approval)', async () => {
    const res = await request(`${API_URL}/approvals`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        title: `WS Audit Approval ${Date.now()}`,
        type: 'TASK_COMPLETION',
        taskId: convertedTask.id,
        description: 'Verify approval WebSocket broadcast',
      }),
    });
    createdApproval = res;
    return res;
  }, 'APPROVAL_REQUESTED');

  // Check: Approval Decision
  await checkEvent(`PATCH /api/approvals/${createdApproval.id}/decision (Approval Decision)`, async () => {
    return request(`${API_URL}/approvals/${createdApproval.id}/decision`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        decision: 'APPROVED',
        notes: 'Approved in WebSocket live test',
      }),
    });
  }, 'APPROVAL_DECIDED');

  // Check: Customer Update
  const customers = await request(`${API_URL}/customers`, { headers: { Authorization: `Bearer ${token}` } });
  if (customers && customers.length > 0) {
    const targetCust = customers[0];
    await checkEvent(`PATCH /api/customers/${targetCust.id} (Update Customer)`, async () => {
      return request(`${API_URL}/customers/${targetCust.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          healthScore: targetCust.healthScore === 95 ? 96 : 95,
        }),
      });
    }, 'CUSTOMER_UPDATED');
  }

  // Check: Project Update
  const projects = await request(`${API_URL}/projects`, { headers: { Authorization: `Bearer ${token}` } });
  if (projects && projects.length > 0) {
    const targetProj = projects[0];
    await checkEvent(`PATCH /api/projects/${targetProj.id} (Update Project)`, async () => {
      return request(`${API_URL}/projects/${targetProj.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          description: `Updated project description at ${Date.now()}`,
        }),
      });
    }, 'PROJECT_UPDATED');
  }

  // Check: Notification Read
  const notifs = await request(`${API_URL}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
  if (notifs.notifications && notifs.notifications.length > 0) {
    const targetNotif = notifs.notifications[0];
    await checkEvent(`PATCH /api/notifications/${targetNotif.id}/read (Read Notification)`, async () => {
      return request(`${API_URL}/notifications/${targetNotif.id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    }, 'NOTIFICATION_READ');
  }

  // Check: Task Soft Delete
  await checkEvent(`DELETE /api/tasks/${convertedTask.id} (Delete Task)`, async () => {
    return request(`${API_URL}/tasks/${convertedTask.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }, 'TASK_DELETED');

  // Clean up
  client.close();

  console.log('\n====================================================');
  console.log(` RESULT: ${passedChecks}/${totalChecks} WebSocket Endpoints Verified & Passed!`);
  console.log('====================================================\n');
}

runWebSocketE2ETest().catch((err) => {
  console.error('\n❌ WebSocket E2E Test Failed:', err);
  process.exit(1);
});
