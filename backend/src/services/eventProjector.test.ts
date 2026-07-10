import { DeliveryRecord } from '@prisma/client';
import { projectEventOntoRecord, serializeWaybill } from './eventProjector';

/** Builds a minimal delivery record fixture for projection tests. */
function baseRecord(overrides: Partial<DeliveryRecord> = {}): DeliveryRecord {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    clientSideUuid: '00000000-0000-0000-0000-000000000099',
    waybillNumber: 'TEST-ODP',
    status: 'PICKED_UP',
    syncStatus: 'SYNCED',
    driverId: 'drv-01',
    vehicleType: 'CAR',
    parcelDescription: 'Standard Package',
    parcelQuantity: 1,
    parcelWeightClass: 'Weight: Under 75',
    pickupLocationName: 'Onaping Depth Project (ODP)',
    pickupAddress: 'ODP Address',
    dropoffDestinationName: 'Maslack, 488 Falconbridge Rd',
    dropoffAddress: '488 Falconbridge Rd',
    priority: 'REGULAR',
    priorityLabel: null,
    driverQueueRank: null,
    externalSource: null,
    externalRowId: null,
    pricingTotalCost: 125 as unknown as DeliveryRecord['pricingTotalCost'],
    pricingIsManuallyAdjusted: false,
    capturedAt: new Date('2026-07-02T12:00:00Z'),
    createdAt: new Date('2026-07-02T12:00:00Z'),
    deliveredAt: null,
    syncedAt: new Date('2026-07-02T12:00:00Z'),
    signatureName: null,
    signatureImageUrl: null,
    signatureHash: null,
    proofPhotoUrl: null,
    signedAt: null,
    additionalComments: null,
    pickupContactName: null,
    pickupContactPhone: null,
    dropoffContactName: null,
    dropoffContactPhone: null,
    updatedAt: new Date('2026-07-02T12:00:00Z'),
    ...overrides,
  } as DeliveryRecord;
}

describe('projectEventOntoRecord', () => {
  it('auto-applies route price on WAYBILL_DELIVERED when no quote exists yet', () => {
    const update = projectEventOntoRecord(
      baseRecord({ pricingTotalCost: 0 as unknown as DeliveryRecord['pricingTotalCost'] }),
      'WAYBILL_DELIVERED',
      {
        deliveredAt: '2026-07-02T13:00:00Z',
      }
    );

    expect(update.status).toBe('DELIVERED');
    expect(update.pricingTotalCost).toBe(125);
    expect(update.pricingIsManuallyAdjusted).toBe(false);
  });

  it('does not overwrite an existing manual quote on delivery', () => {
    const update = projectEventOntoRecord(
      baseRecord({ pricingTotalCost: 88 as unknown as DeliveryRecord['pricingTotalCost'] }),
      'WAYBILL_DELIVERED',
      { deliveredAt: '2026-07-02T13:00:00Z' }
    );

    expect(update.pricingTotalCost).toBeUndefined();
  });
});

describe('serializeWaybill', () => {
  it('includes pricing for dispatchers', () => {
    const serialized = serializeWaybill(baseRecord(), { role: 'DISPATCHER' });
    expect(serialized.calculatedPrice).toBe(125);
    expect(serialized.pricingTotalCost).toBe(125);
  });

  it('omits pricing for drivers', () => {
    const serialized = serializeWaybill(baseRecord(), { role: 'DRIVER' });
    expect(serialized).not.toHaveProperty('calculatedPrice');
    expect(serialized).not.toHaveProperty('pricingTotalCost');
    expect(serialized.signatureImageUrl).toBeNull();
  });
});
