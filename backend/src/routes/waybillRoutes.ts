import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  appendWaybillEvent,
  canDriverAccessWaybill,
  createWaybillWithEvent,
} from '../services/waybillService';
import { serializeWaybill } from '../services/eventProjector';

const router = Router();

/**
 * GET /api/waybills — Lists waybills visible to the authenticated user (RBAC).
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const where =
    req.auth!.role === 'DRIVER'
      ? {
          OR: [{ driverId: req.auth!.driverId }, { driverId: null }],
        }
      : {};

  const records = await prisma.deliveryRecord.findMany({
    where,
    orderBy: { capturedAt: 'desc' },
    take: 500,
  });

  res.json(records.map(serializeWaybill));
});

/**
 * GET /api/waybills/:waybillNumber — Returns a waybill if the caller is authorized.
 */
router.get('/:waybillNumber', requireAuth, async (req: Request, res: Response) => {
  const record = await prisma.deliveryRecord.findUnique({
    where: { waybillNumber: req.params.waybillNumber },
  });

  if (!record) {
    res.status(404).json({ error: 'Waybill not found' });
    return;
  }

  if (req.auth!.role === 'DRIVER') {
    if (!canDriverAccessWaybill(req.auth!.driverId!, record)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  res.json(serializeWaybill(record));
});

/**
 * POST /api/waybills — Creates a new waybill with an initial event (dispatcher only).
 */
router.post('/', requireAuth, requireRole('DISPATCHER'), async (req: Request, res: Response) => {
  const {
    clientSideUuid,
    waybillNumber,
    pickupLocationName,
    pickupAddress,
    dropoffDestinationName,
    dropoffAddress,
    parcelDescription,
    parcelQuantity,
    priority,
    vehicleType,
  } = req.body;

  if (!clientSideUuid || !waybillNumber || !pickupLocationName || !dropoffDestinationName || !parcelDescription) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  const existing = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
  if (existing) {
    if (existing.clientSideUuid === clientSideUuid) {
      res.status(201).json(serializeWaybill(existing));
      return;
    }
    res.status(409).json({ error: 'Waybill already exists' });
    return;
  }

  const record = await createWaybillWithEvent({
    clientSideUuid,
    waybillNumber,
    pickupLocationName,
    pickupAddress,
    dropoffDestinationName,
    dropoffAddress,
    parcelDescription,
    parcelQuantity,
    priority,
    vehicleType,
  });

  res.status(201).json(serializeWaybill(record));
});

/**
 * GET /api/waybills/:waybillNumber/events — Returns append-only event history.
 */
router.get('/:waybillNumber/events', requireAuth, async (req: Request, res: Response) => {
  const record = await prisma.deliveryRecord.findUnique({
    where: { waybillNumber: req.params.waybillNumber },
  });

  if (!record) {
    res.status(404).json({ error: 'Waybill not found' });
    return;
  }

  if (req.auth!.role === 'DRIVER') {
    if (!canDriverAccessWaybill(req.auth!.driverId!, record)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  const events = await prisma.waybillEvent.findMany({
    where: { waybillNumber: req.params.waybillNumber },
    orderBy: { sequenceNumber: 'asc' },
  });

  res.json(
    events.map((e) => ({
      id: e.id,
      clientSideUuid: e.clientSideUuid,
      waybillNumber: e.waybillNumber,
      sequenceNumber: e.sequenceNumber,
      eventType: e.eventType,
      data: e.data,
      timestamp: e.timestamp.toISOString(),
    }))
  );
});

/**
 * POST /api/waybills/:waybillNumber/events — Appends a new lifecycle event.
 */
router.post('/:waybillNumber/events', requireAuth, async (req: Request, res: Response) => {
  const { eventType, data } = req.body;
  if (!eventType) {
    res.status(400).json({ error: 'eventType is required' });
    return;
  }

  const record = await prisma.deliveryRecord.findUnique({
    where: { waybillNumber: req.params.waybillNumber },
  });

  if (!record) {
    res.status(404).json({ error: 'Waybill not found' });
    return;
  }

  if (req.auth!.role === 'DRIVER') {
    if (!canDriverAccessWaybill(req.auth!.driverId!, record)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
  }

  try {
    const event = await appendWaybillEvent(req.params.waybillNumber, { eventType, data: data ?? {} });
    res.status(201).json({
      id: event.id,
      sequenceNumber: event.sequenceNumber,
      eventType: event.eventType,
    });
  } catch (err) {
    const error = err as Error & { statusCode?: number };
    res.status(error.statusCode ?? 400).json({ error: error.message });
  }
});

/** Immutable event log — updates are forbidden. */
router.put('/:waybillNumber/events/:eventId', requireAuth, (_req: Request, res: Response) => {
  res.status(405).json({ error: 'Event history is immutable' });
});

/** Immutable event log — deletes are forbidden. */
router.delete('/:waybillNumber/events/:eventId', requireAuth, (_req: Request, res: Response) => {
  res.status(405).json({ error: 'Event history is immutable' });
});

export default router;
