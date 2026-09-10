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
import attendanceRoutes from './routes/attendance';

// Middleware
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { setupWebSocket } from './services/websocket';

const app = express();
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

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

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
app.use('/api/attendance', attendanceRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

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
