import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticate);

// Ensure upload directory exists
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const ALLOWED_TYPES = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
];

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '25') * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError(`File type ${file.mimetype} is not allowed`, 400) as any);
    }
  },
});

// POST /api/upload — Generic file / screenshot upload
router.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    res.status(201).json({
      url: `/uploads/${req.file.filename}`,
      name: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

// POST /api/upload/ticket/:ticketId
router.post('/ticket/:ticketId', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const ticket = await prisma.ticket.findUnique({ where: { id: req.params.ticketId } });
    if (!ticket) {
      fs.unlinkSync(req.file.path);
      throw new AppError('Ticket not found', 404);
    }

    const attachment = await prisma.ticketAttachment.create({
      data: {
        ticketId: req.params.ticketId,
        name: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
        uploadedById: req.user!.id,
      }
    });

    res.status(201).json(attachment);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

// POST /api/upload/task/:taskId
router.post('/task/:taskId', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    const task = await prisma.task.findFirst({ where: { id: req.params.taskId, isDeleted: false } });
    if (!task) {
      fs.unlinkSync(req.file.path);
      throw new AppError('Task not found', 404);
    }

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: req.params.taskId,
        name: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `/uploads/${req.file.filename}`,
        uploadedById: req.user!.id,
      }
    });

    await prisma.taskHistory.create({
      data: {
        taskId: req.params.taskId,
        userId: req.user!.id,
        action: 'ATTACHMENT_ADDED',
        newValue: req.file.originalname,
      }
    });

    res.status(201).json(attachment);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(err);
  }
});

// DELETE /api/upload/:attachmentId
router.delete('/:attachmentId', async (req, res, next) => {
  try {
    const att = await prisma.taskAttachment.findUnique({ where: { id: req.params.attachmentId } });
    if (!att) throw new AppError('Attachment not found', 404);

    const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(req.user!.roleName);
    if (!isAdminOrAbove && att.uploadedById !== req.user!.id) {
      throw new AppError('You can only delete your own attachments', 403);
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), att.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.taskAttachment.delete({ where: { id: att.id } });
    res.json({ message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
