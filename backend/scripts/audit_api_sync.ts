import fs from 'fs';
import path from 'path';

// Parse backend route files to find all defined endpoints
function extractBackendRoutes(): { file: string; method: string; path: string }[] {
  const routesDir = path.join(__dirname, '../src/routes');
  const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.ts'));
  const routes: { file: string; method: string; path: string }[] = [];

  const prefixMap: Record<string, string> = {
    'auth.ts': '/api/auth',
    'users.ts': '/api/users',
    'departments.ts': '/api/departments',
    'projects.ts': '/api/projects',
    'tasks.ts': '/api/tasks',
    'comments.ts': '/api/comments',
    'worklogs.ts': '/api/worklogs',
    'notifications.ts': '/api/notifications',
    'reports.ts': '/api/reports',
    'dashboard.ts': '/api/dashboard',
    'audit.ts': '/api/audit',
    'workflows.ts': '/api/workflows',
    'ai.ts': '/api/ai',
    'settings.ts': '/api/settings',
    'search.ts': '/api/search',
    'upload.ts': '/api/upload',
    'tickets.ts': '/api/tickets',
    'customers.ts': '/api/customers',
    'approvals.ts': '/api/approvals',
    'mywork.ts': '/api/mywork',
    'workload.ts': '/api/workload',
    'chat.ts': '/api/chat',
    'attendance.ts': '/api/attendance',
    'leaves.ts': '/api/leaves',
  };

  for (const file of files) {
    const content = fs.readFileSync(path.join(routesDir, file), 'utf-8');
    const prefix = prefixMap[file] || '/api';
    const regex = /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const method = match[1].toUpperCase();
      let subPath = match[2];
      if (subPath === '/') subPath = '';
      routes.push({
        file,
        method,
        path: `${prefix}${subPath.startsWith('/') ? subPath : '/' + subPath}`.replace(/\/$/, '') || '/',
      });
    }
  }

  return routes;
}

// Parse frontend src directory to find all api calls
function extractFrontendApiCalls(dir: string): { file: string; method: string; rawUrl: string; cleanUrl: string }[] {
  let results: { file: string; method: string; rawUrl: string; cleanUrl: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        results = results.concat(extractFrontendApiCalls(fullPath));
      }
    } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      const regex = /(?:api|axios)\.(get|post|put|patch|delete)\s*(?:<[^>]+>)?\s*\(\s*([`'"][^`'"]+[`'"])/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const method = match[1].toUpperCase();
        let rawUrl = match[2].slice(1, -1); // strip quotes
        // Normalize URL
        let cleanUrl = rawUrl.replace(/\$\{[^}]+\}/g, ':param'); // replace template params
        if (!cleanUrl.startsWith('/api') && cleanUrl.startsWith('/')) {
          cleanUrl = '/api' + cleanUrl;
        }
        cleanUrl = cleanUrl.split('?')[0].replace(/\/$/, ''); // strip query params and trailing slash

        results.push({
          file: path.relative(path.join(__dirname, '../../frontend'), fullPath),
          method,
          rawUrl,
          cleanUrl,
        });
      }
    }
  }

  return results;
}

async function auditApiSync() {
  console.log('====================================================');
  console.log(' FRONTEND <-> BACKEND API SYNC AUDIT');
  console.log('====================================================\n');

  const backendRoutes = extractBackendRoutes();
  console.log(`📡 Backend Endpoints Registered: ${backendRoutes.length} endpoints across 24 route modules.\n`);

  const frontendDir = path.join(__dirname, '../../frontend/src');
  const frontendCalls = extractFrontendApiCalls(frontendDir);
  console.log(`💻 Frontend API Calls Found: ${frontendCalls.length} calls across UI components.\n`);

  // Group frontend calls by cleanUrl
  const uniqueFrontendCalls = new Map<string, { method: string; url: string; callers: string[] }>();
  for (const call of frontendCalls) {
    const key = `${call.method} ${call.cleanUrl}`;
    if (!uniqueFrontendCalls.has(key)) {
      uniqueFrontendCalls.set(key, { method: call.method, url: call.cleanUrl, callers: [call.file] });
    } else {
      uniqueFrontendCalls.get(key)!.callers.push(call.file);
    }
  }

  console.log(`Unique Frontend Endpoint Signatures: ${uniqueFrontendCalls.size}\n`);

  // Check matching
  const matched: any[] = [];
  const unmatched: any[] = [];

  for (const [key, call] of uniqueFrontendCalls.entries()) {
    // Check if backend has a matching route
    const isMatch = backendRoutes.some(br => {
      if (br.method !== call.method) return false;
      // Convert backend :param or params into regex pattern
      const regexPattern = '^' + br.path.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
      const cleanPattern = '^' + call.url.replace(/:param/g, '[^/]+') + '$';
      return new RegExp(regexPattern).test(call.url) || new RegExp(cleanPattern).test(br.path);
    });

    if (isMatch) {
      matched.push(call);
    } else {
      unmatched.push(call);
    }
  }

  console.log(`✅ MATCHED ENDPOINTS: ${matched.length}`);
  console.log(`⚠️ POTENTIAL UNMATCHED/MISSING ENDPOINTS: ${unmatched.length}\n`);

  if (unmatched.length > 0) {
    console.log('Detailed Unmatched Endpoints:');
    unmatched.forEach(u => {
      console.log(`  ❌ ${u.method} ${u.url} (Used in: ${[...new Set(u.callers)].slice(0, 2).join(', ')})`);
    });
  } else {
    console.log('🎉 100% of frontend API endpoints are properly synced with the backend!');
  }

  // Check Backend routes utilization
  const unusedBackendRoutes = backendRoutes.filter(br => {
    return !frontendCalls.some(fc => {
      if (fc.method !== br.method) return false;
      const regexPattern = '^' + br.path.replace(/:[a-zA-Z0-9_]+/g, '[^/]+') + '$';
      return new RegExp(regexPattern).test(fc.cleanUrl);
    });
  });

  console.log(`\nℹ️ Backend endpoints available for admin/tools/future: ${unusedBackendRoutes.length}`);

  console.log('\n====================================================');
  console.log(' API SYNC AUDIT COMPLETE');
  console.log('====================================================');
}

auditApiSync();
