import { DeliveryRecord, DeliveryStatus, Prisma } from '@prisma/client';

/** Valid status progression for waybill lifecycle events. */
const VALID_TRANSITIONS: Record<string, DeliveryStatus[]> = {
  WAYBILL_CREATED: ['DRAFT'],
  WAYBILL_ASSIGNED: ['DRAFT', 'PICKED_UP'],
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
      if (typeof data.driverId === 'string') {
        update.driver = { connect: { id: data.driverId } };
      }
      break;
    case 'WAYBILL_ASSIGNED':
      if (data.driverId === null) {
        update.driver = { disconnect: true };
      } else if (typeof data.driverId === 'string') {
        update.driver = { connect: { id: data.driverId } };
      }
      break;
    case 'WAYBILL_PICKED_UP':
      update.status = 'PICKED_UP';
      if (typeof data.pickedUpAt === 'string') {
        update.capturedAt = new Date(data.pickedUpAt);
      }
      if (typeof data.pickupLocationName === 'string') {
        update.pickupLocationName = data.pickupLocationName;
      }
      if (typeof data.pickupAddress === 'string') {
        update.pickupAddress = data.pickupAddress;
      }
      if (typeof data.pickupContactName === 'string') {
        update.pickupContactName = data.pickupContactName;
      }
      if (typeof data.pickupContactPhone === 'string') {
        update.pickupContactPhone = data.pickupContactPhone;
      }
      if (typeof data.dropoffDestinationName === 'string') {
        update.dropoffDestinationName = data.dropoffDestinationName;
      }
      if (typeof data.dropoffAddress === 'string') {
        update.dropoffAddress = data.dropoffAddress;
      }
      if (typeof data.dropoffContactName === 'string') {
        update.dropoffContactName = data.dropoffContactName;
      }
      if (typeof data.dropoffContactPhone === 'string') {
        update.dropoffContactPhone = data.dropoffContactPhone;
      }
      if (typeof data.parcelDescription === 'string') {
        update.parcelDescription = data.parcelDescription;
      }
      if (typeof data.parcelWeightClass === 'string') {
        update.parcelWeightClass = data.parcelWeightClass;
      }
      if (typeof data.vehicleType === 'string') {
        update.vehicleType = data.vehicleType as DeliveryRecord['vehicleType'];
      }
      if (typeof data.priority === 'string') {
        update.priority = data.priority as DeliveryRecord['priority'];
      }
      if (typeof data.calculatedPrice === 'number') {
        update.pricingTotalCost = data.calculatedPrice;
      }
      if (data.podRequired === true) {
        update.additionalComments = '__podRequired';
      } else if (data.podRequired === false) {
        update.additionalComments = null;
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
      if (typeof data.pricingTotalCost === 'number') {
        update.pricingTotalCost = data.pricingTotalCost;
        update.pricingIsManuallyAdjusted = true;
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
    additionalComments: record.additionalComments,
    podRequired: record.additionalComments === '__podRequired',
    calculatedPrice: Number(record.pricingTotalCost),
    pricingTotalCost: Number(record.pricingTotalCost),
  };
}
