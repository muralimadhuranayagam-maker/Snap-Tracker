import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'path';
import http from 'http';
import { WebSocketServer } from 'ws';

// Routes
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import departmentRoutes from './routes/departments';
import projectRoutes from './routes/projects';
import taskRoutes from './routes/tasks';
import commentRoutes from './routes/comments';
import worklogRoutes from './routes/worklogs';
import notificationRoutes from './routes/notifications';
import reportRoutes from './routes/reports';
import dashboardRoutes from './routes/dashboard';
import auditRoutes from './routes/audit';
import workflowRoutes from './routes/workflows';
import aiRoutes from './routes/ai';
import settingsRoutes from './routes/settings';
import searchRoutes from './routes/search';
import uploadRoutes from './routes/upload';
import ticketRoutes from './routes/tickets';
import customerRoutes from './routes/customers';
import approvalRoutes from './routes/approvals';
import myworkRoutes from './routes/mywork';
import workloadRoutes from './routes/workload';
import chatRoutes from './routes/chat';
import attendanceRoutes from './routes/attendance';
import leavesRoutes from './routes/leaves';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { setupWebSocket } from './services/websocket';
import { prisma } from './lib/prisma';

const app = express();
// Enable trust proxy for reverse proxies (Render, Railway, Nginx, AWS, Heroku, etc.)
app.set('trust proxy', 1);

const server = http.createServer(app);

// WebSocket setup for real-time updates
const wss = new WebSocketServer({ server });
setupWebSocket(wss);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 50 : 1000,
  message: { error: 'Too many login attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use(requestLogger);

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Health check with active database probe
const healthHandler = async (_req: express.Request, res: express.Response) => {
  const startTime = Date.now();
  let dbStatus = 'disconnected';
  let dbLatency = 0;
  let dbError: string | null = null;

  try {
    // Probe database connectivity with a universal ping
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
    dbLatency = Date.now() - startTime;
  } catch (err: any) {
    dbError = err?.message || 'Database connection probe failed';
  }

  const isHealthy = dbStatus === 'connected';
  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json({
    status: isHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      status: dbStatus,
      latencyMs: dbLatency,
      ...(dbError && { error: dbError }),
    },
    system: {
      memoryUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      env: process.env.NODE_ENV || 'development',
    },
  });
};

app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/worklogs', worklogRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/mywork', myworkRoutes);
app.use('/api/workload', workloadRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/api/attendance', attendanceRoutes); // Fallback for double-prefixed client requests
app.use('/api/leaves', leavesRoutes);

// 404 handler for API routes
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API Route not found' });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', '..', 'frontend', 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'));
  });
} else {
  // 404 handler for non-API routes in development
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
}

// Global error handler
app.use(errorHandler);

const PORT = parseInt(process.env.PORT || '3001');
server.listen(PORT, () => {
  console.log(`🚀 SnapServe Internal Tracker API running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  console.log(`🤖 AI: ${process.env.AI_ENABLED === 'true' ? 'enabled' : 'heuristic mode'}`);
});

export { wss };
export default app;
