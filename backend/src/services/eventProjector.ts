import { DeliveryRecord, DeliveryStatus, Prisma } from '@prisma/client';

/** Valid status progression for waybill lifecycle events. */
const VALID_TRANSITIONS: Record<string, DeliveryStatus[]> = {
  WAYBILL_CREATED: ['DRAFT'],
  WAYBILL_ASSIGNED: ['DRAFT'],
  WAYBILL_PICKED_UP: ['DRAFT', 'PICKED_UP'],
  WAYBILL_DELIVERED: ['PICKED_UP', 'DELIVERED'],
  DISPATCHER_OVERRIDE: ['DRAFT', 'PICKED_UP', 'DELIVERED', 'INVOICED'],
  DISPATCHER_CORRECTION: ['DRAFT', 'PICKED_UP', 'DELIVERED', 'INVOICED'],
};

export interface WaybillEventInput {
  eventType: string;
  data: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Validates whether an event type can be applied given the current waybill status.
 */
export function validateStatusTransition(
  currentStatus: DeliveryStatus,
  eventType: string
): { valid: boolean; error?: string } {
  const allowed = VALID_TRANSITIONS[eventType];
  if (!allowed) {
    return { valid: true };
  }

  if (eventType === 'WAYBILL_DELIVERED' && currentStatus !== 'PICKED_UP') {
    return {
      valid: false,
      error: 'Invalid status transition: WAYBILL_DELIVERED requires PICKED_UP state',
    };
  }

  if (eventType === 'WAYBILL_PICKED_UP' && currentStatus === 'DELIVERED') {
    return {
      valid: false,
      error: 'Invalid status transition: cannot pick up a delivered waybill',
    };
  }

  return { valid: true };
}

/**
 * Applies an event payload onto a delivery record projection.
 */
export function projectEventOntoRecord(
  record: DeliveryRecord,
  eventType: string,
  data: Record<string, unknown>
): Prisma.DeliveryRecordUpdateInput {
  const update: Prisma.DeliveryRecordUpdateInput = {};

  switch (eventType) {
    case 'WAYBILL_CREATED':
      update.status = 'DRAFT';
      break;
    case 'WAYBILL_ASSIGNED':
      if (typeof data.driverId === 'string') {
        update.driver = { connect: { id: data.driverId } };
      }
      break;
    case 'WAYBILL_PICKED_UP':
      update.status = 'PICKED_UP';
      if (typeof data.pickedUpAt === 'string') {
        update.capturedAt = new Date(data.pickedUpAt);
      }
      break;
    case 'WAYBILL_DELIVERED':
      update.status = 'DELIVERED';
      if (typeof data.deliveredAt === 'string') {
        update.deliveredAt = new Date(data.deliveredAt);
      }
      if (typeof data.signatureName === 'string') {
        update.signatureName = data.signatureName;
      }
      break;
    case 'DISPATCHER_OVERRIDE':
      if (typeof data.status === 'string') {
        update.status = data.status as DeliveryStatus;
      }
      break;
    case 'DISPATCHER_CORRECTION':
      if (typeof data.pickupAddress === 'string') {
        update.pickupAddress = data.pickupAddress;
      }
      if (typeof data.dropoffAddress === 'string') {
        update.dropoffAddress = data.dropoffAddress;
      }
      break;
    default:
      break;
  }

  return update;
}

/**
 * Serializes a delivery record for API responses using camelCase field names.
 */
export function serializeWaybill(record: DeliveryRecord) {
  return {
    id: record.id,
    clientSideUuid: record.clientSideUuid,
    waybillNumber: record.waybillNumber,
    status: record.status,
    syncStatus: record.syncStatus,
    driverId: record.driverId,
    vehicleType: record.vehicleType,
    parcelDescription: record.parcelDescription,
    parcelQuantity: record.parcelQuantity,
    pickupLocationName: record.pickupLocationName,
    pickupAddress: record.pickupAddress,
    dropoffDestinationName: record.dropoffDestinationName,
    dropoffAddress: record.dropoffAddress,
    priority: record.priority,
    createdAt: record.createdAt.toISOString(),
    capturedAt: record.capturedAt.toISOString(),
    deliveredAt: record.deliveredAt?.toISOString() ?? null,
    signatureName: record.signatureName,
    signatureImageUrl: record.signatureImageUrl,
  };
}
