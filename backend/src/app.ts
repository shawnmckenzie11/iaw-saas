import express from 'express';
import cors from 'cors';
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

/** Points browser users at the Vite PWA — this server is API-only. */
app.get('/', (_req, res) => {
  res.status(200).json({
    service: 'iaw-saas API',
    message: 'This is the backend API. Open the driver/dispatch UI at http://localhost:3000',
    health: '/health',
    auth: '/api/auth',
    waybills: '/api/waybills',
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/waybills', waybillRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/admin', adminRoutes);

export default app;
