import { randomUUID } from 'crypto';
import { prisma } from '../config/db';
import { createWaybillWithEvent } from '../services/waybillService';
import { ParsedRequestRow } from './types';
import { resolveRequestPrice } from './parseRequestRow';

export interface CreateDraftWaybillOptions {
  externalSource: string;
  externalRowId: string;
  waybillNumber: string;
}

/**
 * Creates an unassigned DRAFT waybill from a parsed intake row if not already imported.
 */
export async function createDraftWaybillFromRequest(
  parsed: ParsedRequestRow,
  options: CreateDraftWaybillOptions
): Promise<'created' | 'skipped'> {
  const { externalSource, externalRowId, waybillNumber } = options;

  const existing = await prisma.deliveryRecord.findFirst({
    where: { externalSource, externalRowId },
    select: { id: true },
  });
  if (existing) return 'skipped';

  const price = resolveRequestPrice(parsed);
  const pricingIsManuallyAdjusted = parsed.requiresManualPricing || parsed.calculatedPrice <= 0;

  await createWaybillWithEvent({
    clientSideUuid: randomUUID(),
    waybillNumber,
    pickupLocationName: parsed.pickupLocationName,
    pickupAddress: parsed.pickupAddress,
    dropoffDestinationName: parsed.dropoffDestinationName,
    dropoffAddress: parsed.dropoffAddress,
    parcelDescription: parsed.parcelDescription,
    parcelWeightClass: parsed.parcelWeightClass,
    parcelWeightLbs: parsed.parcelWeightLbs,
    priority: parsed.priority,
    vehicleType: parsed.vehicleType,
    driverId: null,
    pricingTotalCost: price,
    capturedAt: parsed.timestamp,
    externalSource,
    externalRowId,
    pickupContactName: parsed.contactName || null,
    pickupContactPhone: parsed.contactPhone || null,
    additionalComments: parsed.additionalComments || null,
    pricingIsManuallyAdjusted,
  });

  return 'created';
}
