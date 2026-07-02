import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { prisma } from './config/db';
import authRoutes from './routes/authRoutes';
import waybillRoutes from './routes/waybillRoutes';
import syncRoutes from './routes/syncRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'CONNECTED' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', message: (error as Error).message });
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
