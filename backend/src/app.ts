import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { prisma } from './config/db';
import { authenticateTokenOrCookie, canDriverMutateWaybill } from './middleware/auth';
import authRoutes from './routes/authRoutes';
import waybillRoutes from './routes/waybillRoutes';
import syncRoutes from './routes/syncRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();

const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
app.use(
  cors(
    publicAppUrl
      ? {
          origin: publicAppUrl,
          credentials: true,
        }
      : undefined
  )
);
app.use(express.json());

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

/**
 * Extracts the waybill number from an upload filename
 * (`{waybillNumber}-{signature|photo|file}-{timestamp}.ext`).
 */
function waybillNumberFromUploadFilename(filename: string): string | null {
  const match = filename.match(/^(.*)-(signature|photo|file)-\d+\.[^.]+$/i);
  return match?.[1] ?? null;
}

/**
 * Serves upload files only to authenticated users.
 * Drivers may only fetch files for waybills they can access.
 * Relative `/uploads/...` URLs keep working for same-origin `<img>` tags via session cookie.
 */
app.get('/uploads/:filename', authenticateTokenOrCookie, async (req, res) => {
  const filename = path.basename(req.params.filename);
  if (!filename || filename !== req.params.filename || filename.includes('..')) {
    res.status(400).json({ error: 'Invalid filename' });
    return;
  }

  const filepath = path.join(UPLOAD_DIR, filename);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const user = req.user || req.auth;
  if (user?.role === 'DRIVER') {
    const waybillNumber = waybillNumberFromUploadFilename(filename);
    if (!waybillNumber) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
    if (!record || !canDriverMutateWaybill(record, user.driverId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  res.sendFile(filepath);
});

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'CONNECTED' });
  } catch {
    res.status(500).json({ status: 'ERROR', database: 'DISCONNECTED' });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/waybills', waybillRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/admin', adminRoutes);

/**
 * Returns true when the server should host the built Vite PWA (production / Fly).
 */
function shouldServeFrontend(): boolean {
  return process.env.SERVE_FRONTEND === 'true' || process.env.NODE_ENV === 'production';
}

/**
 * Resolves the frontend dist directory from env or common monorepo layouts.
 */
function resolveFrontendDistPath(): string | null {
  const candidates = [
    process.env.FRONTEND_DIST,
    path.join(process.cwd(), '../frontend/dist'),
    path.join(process.cwd(), 'frontend/dist'),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

const frontendDist = shouldServeFrontend() ? resolveFrontendDistPath() : null;

if (frontendDist) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api|uploads|health).*/, (req, res, next) => {
    if (req.method !== 'GET') {
      next();
      return;
    }
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
} else {
  /** Points browser users at the Vite dev server — this process is API-only locally. */
  app.get('/', (_req, res) => {
    res.status(200).json({
      service: 'iaw-saas API',
      message: 'This is the backend API. Open the driver/dispatch UI at http://localhost:3000',
      health: '/health',
      auth: '/api/auth',
      waybills: '/api/waybills',
    });
  });
}

export default app;
