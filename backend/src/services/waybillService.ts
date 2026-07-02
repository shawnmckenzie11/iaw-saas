import { DeliveryRecord, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import {
  projectEventOntoRecord,
  validateStatusTransition,
  WaybillEventInput,
} from './eventProjector';

export interface AppendEventOptions {
  clientSideUuid: string;
  waybillNumber: string;
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: Date;
  eventId?: string;
}

/**
 * Returns the next sequence number for a waybill's event log within a transaction.
 */
async function getNextSequenceNumber(
  tx: Prisma.TransactionClient,
  waybillNumber: string
): Promise<number> {
  const latest = await tx.waybillEvent.findFirst({
    where: { waybillNumber },
    orderBy: { sequenceNumber: 'desc' },
    select: { sequenceNumber: true },
  });
  return (latest?.sequenceNumber ?? 0) + 1;
}

/**
 * Appends an event and projects the resulting state onto the delivery record atomically.
 */
export async function appendEventAndProject(options: AppendEventOptions) {
  const { clientSideUuid, waybillNumber, eventType, data, timestamp, eventId } = options;

  return prisma.$transaction(async (tx) => {
    const record = await tx.deliveryRecord.findUnique({ where: { waybillNumber } });
    if (!record) {
      throw new Error(`Waybill ${waybillNumber} not found`);
    }

    if (record.status === 'INVOICED') {
      const err = new Error('Waybill is locked post-invoice');
      (err as Error & { statusCode: number }).statusCode = 422;
      throw err;
    }

    const transition = validateStatusTransition(record.status, eventType);
    if (!transition.valid) {
      const err = new Error(transition.error || 'Invalid transition');
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    const sequenceNumber = await getNextSequenceNumber(tx, waybillNumber);

    if (eventId) {
      const existing = await tx.waybillEvent.findUnique({ where: { id: eventId } });
      if (existing) {
        return existing;
      }
    }

    const event = await tx.waybillEvent.create({
      data: {
        id: eventId,
        clientSideUuid,
        waybillNumber,
        sequenceNumber,
        eventType,
        data: data as Prisma.InputJsonValue,
        timestamp: timestamp ?? new Date(),
      },
    });

    const projection = projectEventOntoRecord(record, eventType, data);
    if (Object.keys(projection).length > 0) {
      await tx.deliveryRecord.update({
        where: { waybillNumber },
        data: projection,
      });
    }

    return event;
  });
}

/**
 * Creates a new waybill delivery record with an initial WAYBILL_CREATED event.
 */
export async function createWaybillWithEvent(input: {
  clientSideUuid: string;
  waybillNumber: string;
  pickupLocationName: string;
  pickupAddress?: string;
  dropoffDestinationName: string;
  dropoffAddress?: string;
  parcelDescription: string;
  parcelWeightClass?: string;
  parcelWeightLbs?: number | null;
  parcelQuantity?: number;
  priority?: string;
  vehicleType?: string;
  driverId?: string | null;
  pricingTotalCost?: number;
  capturedAt?: Date;
  externalSource?: string | null;
  externalRowId?: string | null;
  pickupContactName?: string | null;
  pickupContactPhone?: string | null;
  additionalComments?: string | null;
  pricingIsManuallyAdjusted?: boolean;
}) {
  const now = input.capturedAt ?? new Date();

  return prisma.$transaction(async (tx) => {
    const record = await tx.deliveryRecord.create({
      data: {
        clientSideUuid: input.clientSideUuid,
        waybillNumber: input.waybillNumber,
        status: 'DRAFT',
        externalSource: input.externalSource ?? null,
        externalRowId: input.externalRowId ?? null,
        pickupLocationName: input.pickupLocationName,
        pickupAddress: input.pickupAddress ?? input.pickupLocationName,
        dropoffDestinationName: input.dropoffDestinationName,
        dropoffAddress: input.dropoffAddress ?? input.dropoffDestinationName,
        parcelDescription: input.parcelDescription,
        parcelWeightClass: input.parcelWeightClass ?? null,
        parcelWeightLbs: input.parcelWeightLbs ?? null,
        parcelQuantity: input.parcelQuantity ?? 1,
        priority: (input.priority as 'REGULAR' | 'RUSH') ?? 'REGULAR',
        vehicleType: (input.vehicleType as DeliveryRecord['vehicleType']) ?? 'CAR',
        capturedAt: now,
        driverId: input.driverId ?? null,
        pickupContactName: input.pickupContactName ?? null,
        pickupContactPhone: input.pickupContactPhone ?? null,
        additionalComments: input.additionalComments ?? null,
        pricingTotalCost: input.pricingTotalCost ?? 0,
        pricingIsManuallyAdjusted: input.pricingIsManuallyAdjusted ?? false,
        pricingTier: input.pricingIsManuallyAdjusted ? 'TIER_3' : 'TIER_2',
      },
    });

    await tx.waybillEvent.create({
      data: {
        clientSideUuid: input.clientSideUuid,
        waybillNumber: input.waybillNumber,
        sequenceNumber: 1,
        eventType: 'WAYBILL_CREATED',
        data: {
          waybillNumber: input.waybillNumber,
          pickupLocationName: input.pickupLocationName,
          dropoffDestinationName: input.dropoffDestinationName,
          parcelDescription: input.parcelDescription,
        },
        timestamp: now,
      },
    });

    return record;
  });
}

/**
 * Appends a typed event to an existing waybill with validation and projection.
 */
export async function appendWaybillEvent(
  waybillNumber: string,
  input: WaybillEventInput
) {
  const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
  if (!record) {
    const err = new Error('Waybill not found');
    (err as Error & { statusCode: number }).statusCode = 404;
    throw err;
  }

  return appendEventAndProject({
    clientSideUuid: record.clientSideUuid,
    waybillNumber,
    eventType: input.eventType,
    data: input.data,
    timestamp: input.timestamp ? new Date(input.timestamp) : undefined,
  });
}

/**
 * Processes a batch of client-synced events, returning synced client-side IDs.
 */
export async function syncEventsBatch(
  events: Array<{
    id: string;
    clientSideUuid: string;
    waybillNumber: string;
    eventType: string;
    timestamp?: string;
    data?: Record<string, unknown>;
  }>
): Promise<string[]> {
  const syncedIds: string[] = [];

  for (const evt of events) {
    if (!evt.id || !evt.eventType || !evt.waybillNumber || !evt.clientSideUuid) {
      const err = new Error('Invalid event structure');
      (err as Error & { statusCode: number }).statusCode = 400;
      throw err;
    }

    let record = await prisma.deliveryRecord.findUnique({
      where: { waybillNumber: evt.waybillNumber },
    });

    const existingEvent = await prisma.waybillEvent.findUnique({ where: { id: evt.id } });
    if (existingEvent) {
      syncedIds.push(evt.id);
      continue;
    }

    if (!record && evt.eventType === 'WAYBILL_CREATED') {
      record = await createWaybillWithEvent({
        clientSideUuid: evt.clientSideUuid,
        waybillNumber: evt.waybillNumber,
        pickupLocationName: String(evt.data?.pickupLocationName ?? 'Unknown'),
        pickupAddress: typeof evt.data?.pickupAddress === 'string' ? evt.data.pickupAddress : undefined,
        dropoffDestinationName: String(evt.data?.dropoffDestinationName ?? 'Pending Dropoff'),
        dropoffAddress: typeof evt.data?.dropoffAddress === 'string' ? evt.data.dropoffAddress : undefined,
        parcelDescription: String(evt.data?.parcelDescription ?? 'Package'),
        parcelWeightClass:
          typeof evt.data?.parcelWeightClass === 'string' ? evt.data.parcelWeightClass : undefined,
        priority: typeof evt.data?.priority === 'string' ? evt.data.priority : undefined,
        vehicleType: typeof evt.data?.vehicleType === 'string' ? evt.data.vehicleType : undefined,
        driverId: typeof evt.data?.driverId === 'string' ? evt.data.driverId : null,
        pricingTotalCost:
          typeof evt.data?.calculatedPrice === 'number' ? evt.data.calculatedPrice : undefined,
      });
      syncedIds.push(evt.id);
      continue;
    }

    if (record && evt.eventType === 'WAYBILL_CREATED') {
      syncedIds.push(evt.id);
      continue;
    }

    if (!record) {
      await createWaybillWithEvent({
        clientSideUuid: evt.clientSideUuid,
        waybillNumber: evt.waybillNumber,
        pickupLocationName: String(evt.data?.pickupLocationName ?? evt.waybillNumber),
        pickupAddress: typeof evt.data?.pickupAddress === 'string' ? evt.data.pickupAddress : undefined,
        dropoffDestinationName: String(evt.data?.dropoffDestinationName ?? 'Pending Dropoff'),
        dropoffAddress: typeof evt.data?.dropoffAddress === 'string' ? evt.data.dropoffAddress : undefined,
        parcelDescription: String(evt.data?.parcelDescription ?? 'Package'),
        parcelWeightClass:
          typeof evt.data?.parcelWeightClass === 'string' ? evt.data.parcelWeightClass : undefined,
        driverId: typeof evt.data?.driverId === 'string' ? evt.data.driverId : null,
      });
    }

    if (
      record &&
      evt.eventType === 'WAYBILL_DELIVERED' &&
      record.status === 'DELIVERED'
    ) {
      syncedIds.push(evt.id);
      continue;
    }

    if (
      record &&
      evt.eventType === 'WAYBILL_PICKED_UP' &&
      (record.status === 'PICKED_UP' || record.status === 'DELIVERED')
    ) {
      syncedIds.push(evt.id);
      continue;
    }

    await appendEventAndProject({
      clientSideUuid: evt.clientSideUuid,
      waybillNumber: evt.waybillNumber,
      eventType: evt.eventType,
      data: evt.data ?? {},
      timestamp: evt.timestamp ? new Date(evt.timestamp) : undefined,
      eventId: evt.id,
    });

    syncedIds.push(evt.id);
  }

  return syncedIds;
}

/**
 * Checks whether a driver may access a waybill based on assignment rules.
 */
export function canDriverAccessWaybill(
  driverId: string,
  record: { driverId: string | null }
): boolean {
  return record.driverId === null || record.driverId === driverId;
}

/**
 * Checks whether a driver may mutate a waybill.
 */
export function canDriverMutateWaybill(
  driverId: string,
  record: { driverId: string | null }
): boolean {
  return record.driverId === driverId;
}
