import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import { runIntakeSyncOnDemand } from '../intake/registerAdapters';

const router = Router();

/**
 * GET /api/admin/rates — Returns route rate lookup table (dispatcher only).
 */
router.get('/rates', requireAuth, requireRole('DISPATCHER'), async (_req: Request, res: Response) => {
  const rates = await prisma.routeRate.findMany({
    orderBy: { effectiveDate: 'desc' },
  });

  res.json(
    rates.map((r) => ({
      id: r.id,
      origin: r.origin,
      destination: r.destination,
      flatRate: r.flatRate.toString(),
      effectiveDate: r.effectiveDate.toISOString(),
    }))
  );
});

/**
 * POST /api/admin/intake/sync — Triggers a manual intake adapter sync (dispatcher only).
 */
router.post('/intake/sync', requireAuth, requireRole('DISPATCHER'), async (_req: Request, res: Response) => {
  const results = await runIntakeSyncOnDemand();
  res.json({ ok: true, results });
});

export default router;
