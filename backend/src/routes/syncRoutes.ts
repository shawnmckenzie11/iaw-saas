import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';
import { syncEventsBatch } from '../services/waybillService';
import { prisma } from '../config/db';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

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

  try {
    const syncedIds = await syncEventsBatch(events);
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
  upload.single('blob'),
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

    ensureUploadDir();
    const ext = path.extname(req.file.originalname) || '.png';
    const filename = `${waybillNumber}-${fileType || 'file'}-${Date.now()}${ext}`;
    const filepath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filepath, req.file.buffer);

    const fileUri = `/uploads/${filename}`;

    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
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
