import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, requireRole, checkWaybillAccess } from '../middleware/auth';
import {
  appendWaybillEvent,
  createWaybillWithEvent,
} from '../services/waybillService';
import { buildAssignmentEventData } from '../services/driverQueueService';
import { serializeWaybill } from '../services/eventProjector';

const router = Router();

/**
 * GET /api/waybills — Lists waybills visible to the authenticated user (RBAC).
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const roleFilter =
    req.auth!.role === 'DRIVER'
      ? {
          OR: [{ driverId: req.auth!.driverId }, { driverId: null }],
        }
      : {};

  const records = await prisma.deliveryRecord.findMany({
    where: {
      ...roleFilter,
      status: { not: 'VOIDED' },
    },
    orderBy: { capturedAt: 'desc' },
    take: 500,
  });

  res.json(records.map((record) => serializeWaybill(record, { role: req.auth!.role })));
});

/** Manual driver waybill numbers use K-##### and must be unique among K- prefixed records. */
const MANUAL_K_WAYBILL = /^K-\d{5}$/;

/**
 * GET /api/waybills/check/:waybillNumber — Returns whether a manual K- waybill already exists.
 */
router.get('/check/:waybillNumber', requireAuth, async (req: Request, res: Response) => {
  const waybillNumber = decodeURIComponent(req.params.waybillNumber);
  if (!MANUAL_K_WAYBILL.test(waybillNumber)) {
    res.json({ exists: false });
    return;
  }

  const existing = await prisma.deliveryRecord.findUnique({
    where: { waybillNumber },
    select: { id: true },
  });
  res.json({ exists: !!existing });
});

/**
 * GET /api/waybills/:waybillNumber — Returns a waybill if the caller is authorized.
 */
router.get('/:waybillNumber', requireAuth, checkWaybillAccess, async (req: Request, res: Response) => {
  const record = await prisma.deliveryRecord.findUnique({
    where: { waybillNumber: req.params.waybillNumber },
  });

  if (!record) {
    res.status(404).json({ error: 'Waybill not found' });
    return;
  }

  res.json(serializeWaybill(record, { role: req.auth!.role }));
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

  try {
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
  } catch (err) {
    const error = err as Error;
    if (error.message.includes('Unique constraint')) {
      res.status(409).json({ error: 'Waybill or Client UUID already exists' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/waybills/:waybillNumber/events — Returns append-only event history.
 */
router.get('/:waybillNumber/events', requireAuth, checkWaybillAccess, async (req: Request, res: Response) => {
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
router.post('/:waybillNumber/events', requireAuth, checkWaybillAccess, async (req: Request, res: Response) => {
  const { eventType, data } = req.body;
  if (!eventType) {
    res.status(400).json({ error: 'eventType is required' });
    return;
  }

  const user = req.user || req.auth;
  const sanitizedData = { ...data };
  if (user?.role === 'DRIVER') {
    if (
      eventType === 'DISPATCHER_OVERRIDE' ||
      eventType === 'DISPATCHER_CORRECTION' ||
      eventType === 'WAYBILL_VOIDED'
    ) {
      res.status(403).json({ error: 'Forbidden event type for driver' });
      return;
    }
    if (sanitizedData) {
      delete sanitizedData.calculatedPrice;
      delete sanitizedData.pricingTotalCost;
    }
    if (
      user.driverId &&
      (eventType === 'WAYBILL_CREATED' || eventType === 'WAYBILL_PICKED_UP') &&
      sanitizedData.driverId == null
    ) {
      sanitizedData.driverId = user.driverId;
    }
  }

  try {
    let eventData = sanitizedData ?? {};

    if (eventType === 'WAYBILL_VOIDED' && user?.role !== 'DISPATCHER') {
      res.status(403).json({ error: 'Forbidden event type' });
      return;
    }

    if (eventType === 'WAYBILL_ASSIGNED' && user?.role === 'DISPATCHER') {
      const current = await prisma.deliveryRecord.findUnique({
        where: { waybillNumber: req.params.waybillNumber },
        select: { priority: true },
      });

      const driverId =
        eventData.driverId === null
          ? null
          : typeof eventData.driverId === 'string'
            ? eventData.driverId
            : null;

      const priority =
        eventData.priority === 'RUSH' || eventData.priority === 'REGULAR'
          ? eventData.priority
          : current?.priority ?? 'REGULAR';

      eventData = await buildAssignmentEventData({
        driverId,
        waybillNumber: req.params.waybillNumber,
        priority,
        queuePosition:
          eventData.queuePosition === 'top' || eventData.queuePosition === 'bottom'
            ? eventData.queuePosition
            : typeof eventData.afterWaybillNumber === 'string'
              ? { afterWaybillNumber: eventData.afterWaybillNumber }
              : undefined,
      });
    }

    const event = await appendWaybillEvent(req.params.waybillNumber, { eventType, data: eventData });
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
