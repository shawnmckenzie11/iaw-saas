import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { syncEventsBatch } from '../services/waybillService';
import { prisma } from '../config/db';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Ensures the blob upload directory exists on disk.
 */
function ensureUploadDir(): void {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * POST /api/sync/events — Ingests a batch of offline waybill events.
 */
router.post('/events', requireAuth, async (req: Request, res: Response) => {
  const { events } = req.body;

  if (!Array.isArray(events)) {
    res.status(400).json({ error: 'events must be an array' });
    return;
  }

  if (events.length === 0) {
    res.json({ syncedIds: [] });
    return;
  }

  const user = req.user || req.auth;

  try {
    const syncedIds = await syncEventsBatch(events, user);
    res.json({ syncedIds });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 400).json({ error: error.message });
  }
});

/**
 * POST /api/sync/blobs — Accepts signature/photo binary uploads.
 */
router.post(
  '/blobs',
  requireAuth,
  (req: Request, res: Response, next) => {
    upload.single('blob')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'File size limit exceeded (max 5MB)' });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const { waybillNumber, fileType } = req.body;

    if (!req.file) {
      res.status(400).json({ error: 'blob file is required' });
      return;
    }

    if (!waybillNumber) {
      res.status(400).json({ error: 'waybillNumber is required' });
      return;
    }

    const user = req.user || req.auth;
    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });

    if (user?.role === 'DRIVER') {
      if (record) {
        if (!(record.driverId === null || record.driverId === user.driverId)) {
          res.status(403).json({ error: 'Forbidden' });
          return;
        }
      }
    }

    ensureUploadDir();
    const ext = path.extname(req.file.originalname) || '.png';
    const filename = `${waybillNumber}-${fileType || 'file'}-${Date.now()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, req.file.buffer);

    const fileUri = `/uploads/${filename}`;

    if (record && fileType === 'signature') {
      await prisma.deliveryRecord.update({
        where: { waybillNumber },
        data: { signatureImageUrl: fileUri },
      });
    } else if (record && fileType === 'photo') {
      await prisma.deliveryRecord.update({
        where: { waybillNumber },
        data: { proofPhotoUrl: fileUri },
      });
    }

    res.status(201).json({ fileUri });
  }
);

export default router;
