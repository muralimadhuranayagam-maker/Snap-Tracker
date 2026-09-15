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

// Ensure upload directory exists (for non-image file types)
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Memory storage: for profile images → returned as base64 data URI, stored in DB ──
const memoryStorage = multer.memoryStorage();

// ── Disk storage: for all non-image files (PDFs, audio, video, attachments) ──
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    let ext = path.extname(file.originalname);
    if (!ext) {
      if (file.mimetype.startsWith('audio/webm')) ext = '.webm';
      else if (file.mimetype.startsWith('audio/wav') || file.mimetype.startsWith('audio/x-wav')) ext = '.wav';
      else if (file.mimetype.startsWith('audio/mp3') || file.mimetype.startsWith('audio/mpeg')) ext = '.mp3';
      else if (file.mimetype.startsWith('audio/ogg')) ext = '.ogg';
      else if (file.mimetype.startsWith('audio/mp4') || file.mimetype.startsWith('audio/m4a')) ext = '.m4a';
      else if (file.mimetype.startsWith('video/webm')) ext = '.webm';
      else if (file.mimetype.startsWith('video/mp4')) ext = '.mp4';
      else if (file.mimetype.startsWith('image/png')) ext = '.png';
      else if (file.mimetype.startsWith('image/jpeg')) ext = '.jpg';
      else if (file.mimetype.startsWith('image/webp')) ext = '.webp';
      else ext = '.bin';
    }
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
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  // Videos
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/ogg', 'video/avi',
  // Audio & Voice Recordings
  'audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/mp4', 'audio/x-m4a'
];

// Image-only uploader → memory (for profile photos stored as base64 in DB)
const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max for profile images
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError('Only image files are allowed for profile photos', 400) as any);
    }
  },
});

// Generic file uploader → disk (for attachments, audio, video, etc.)
const upload = multer({
  storage: diskStorage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '100') * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new AppError(`File type ${file.mimetype} is not allowed`, 400) as any);
    }
  },
});

// POST /api/upload/avatar — Profile image upload → stored as base64 data URI in DB
// This endpoint stores images in memory and returns a data URI so the caller can
// persist it directly in the User.avatar DB column. No filesystem involved.
router.post('/avatar', imageUpload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError('No file uploaded', 400);

    // Convert buffer → base64 data URI
    const base64 = req.file.buffer.toString('base64');
    const dataUri = `data:${req.file.mimetype};base64,${base64}`;

    res.status(201).json({
      url: dataUri,          // caller stores this directly in User.avatar
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/upload — Generic file / screenshot upload (disk-based, for attachments)
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
    if (req.file && fs.existsSync((req.file as any).path)) {
      fs.unlinkSync((req.file as any).path);
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
