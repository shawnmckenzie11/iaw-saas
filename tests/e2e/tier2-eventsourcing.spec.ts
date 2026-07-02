import { test, expect } from '@playwright/test';
import { prisma } from '../../backend/src/config/db';
import { projectEventOntoRecord } from '../../backend/src/services/eventProjector';
import { e2eCredentials, getDispatcherToken } from './credentials';

test.describe('Feature 5: Event-Sourced Operations and Replay (Tier 2)', () => {
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    dispatcherToken = await getDispatcherToken(request);
  });

  // Helper to ensure a clean draft waybill exists
  const createCleanWaybill = async (request: any, waybillNumber: string, clientSideUuid: string) => {
    // Delete existing to clean state
    await prisma.waybillEvent.deleteMany({ where: { waybillNumber } });
    await prisma.deliveryRecord.delete({ where: { waybillNumber } }).catch(() => {});

    const response = await request.post('/api/waybills', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        clientSideUuid,
        waybillNumber,
        pickupLocationName: 'Sourcing Origin',
        pickupAddress: '123 Origin St',
        dropoffDestinationName: 'Sourcing Destination',
        dropoffAddress: '456 Destination Rd',
        parcelDescription: 'Sourcing Materials',
        parcelQuantity: 1,
        priority: 'REGULAR',
        vehicleType: 'CAR'
      }
    });
    expect([200, 201]).toContain(response.status());
  };

  // F5-T2-01: Materialized State Sync
  test('F5-T2-01: Materialized State Sync', async ({ request }) => {
    const waybillNumber = 'W-ES-T2-01';
    const clientSideUuid = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f501';
    await createCleanWaybill(request, waybillNumber, clientSideUuid);

    // Append WAYBILL_ASSIGNED event
    const assignRes = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_ASSIGNED',
        data: { driverId: 'drv-01' }
      }
    });
    expect([200, 201]).toContain(assignRes.status());

    // Verify main waybills projection table immediately reflects updated driverId and status
    const waybillRes = await request.get(`/api/waybills/${waybillNumber}`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` }
    });
    expect(waybillRes.status()).toBe(200);
    const waybill = await waybillRes.json();
    expect(waybill.driverId).toBe('drv-01');
    expect(waybill.status).toBe('DRAFT');
  });

  // F5-T2-02: Optimistic Concurrency Conflict
  test('F5-T2-02: Optimistic Concurrency Conflict', async ({ request }) => {
    const waybillNumber = 'W-ES-T2-02';
    const clientSideUuid = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f502';
    await createCleanWaybill(request, waybillNumber, clientSideUuid);

    // Directly insert an event with sequence number 2 using Prisma
    await prisma.waybillEvent.create({
      data: {
        id: '99fb230d-2ea3-4cf1-83d2-d12f12285102',
        clientSideUuid,
        waybillNumber,
        sequenceNumber: 2,
        eventType: 'WAYBILL_ASSIGNED',
        data: { driverId: 'drv-01' },
        timestamp: new Date()
      }
    });

    // Attempt to insert another event with sequence number 2 for the same waybill
    // Verify it fails with unique constraint error (Optimistic Concurrency Conflict)
    await expect(
      prisma.waybillEvent.create({
        data: {
          id: '01d9f8b2-b13c-4861-accd-ee2d8f9ba102',
          clientSideUuid,
          waybillNumber,
          sequenceNumber: 2,
          eventType: 'WAYBILL_ASSIGNED',
          data: { driverId: 'drv-02' },
          timestamp: new Date()
        }
      })
    ).rejects.toThrow();
  });

  // F5-T2-03: Invalid Event Payload Rejection
  test('F5-T2-03: Invalid Event Payload Rejection', async ({ request }) => {
    const waybillNumber = 'W-ES-T2-03';
    const clientSideUuid = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f503';
    await createCleanWaybill(request, waybillNumber, clientSideUuid);

    // Request with missing eventType
    const response = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        data: { driverId: 'drv-01' }
      }
    });
    expect(response.status()).toBe(400);

    // Call /api/sync/events with invalid/missing clientSideUuid
    const syncResponse = await request.post('/api/sync/events', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        events: [
          {
            id: '99fb230d-2ea3-4cf1-83d2-d12f12285103',
            waybillNumber,
            eventType: 'WAYBILL_ASSIGNED',
            data: { driverId: 'drv-01' }
            // clientSideUuid is missing
          }
        ]
      }
    });
    expect(syncResponse.status()).toBe(400);
  });

  // F5-T2-04: Timeline Replay Consistency
  test('F5-T2-04: Timeline Replay Consistency', async ({ request }) => {
    const waybillNumber = 'W-ES-T2-04';
    const clientSideUuid = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f504';
    await createCleanWaybill(request, waybillNumber, clientSideUuid);

    // Add assigned, picked up, and delivered events
    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_ASSIGNED',
        data: { driverId: 'drv-01' }
      }
    });

    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: { pickedUpAt: new Date().toISOString() }
      }
    });

    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_DELIVERED',
        data: {
          deliveredAt: new Date().toISOString(),
          signatureName: 'Timeline Checker'
        }
      }
    });

    // Query event history from DB
    const dbEvents = await prisma.waybillEvent.findMany({
      where: { waybillNumber },
      orderBy: { sequenceNumber: 'asc' }
    });

    // Reconstruct waybill state in memory from event log using projector
    let materializedInMemoryState: any = {};
    for (const event of dbEvents) {
      const update = projectEventOntoRecord(materializedInMemoryState, event.eventType, event.data as any);
      if (update.driver?.connect?.id) {
        materializedInMemoryState.driverId = update.driver.connect.id;
      } else if (update.driver?.disconnect) {
        materializedInMemoryState.driverId = null;
      }
      materializedInMemoryState = {
        ...materializedInMemoryState,
        ...update
      };
    }

    // Query materialized waybill record from DB
    const dbRecord = await prisma.deliveryRecord.findUnique({
      where: { waybillNumber }
    });

    expect(dbRecord).not.toBeNull();
    expect(dbRecord!.status).toBe(materializedInMemoryState.status);
    expect(dbRecord!.driverId).toBe(materializedInMemoryState.driverId);
    expect(dbRecord!.signatureName).toBe(materializedInMemoryState.signatureName);
  });

  // F5-T2-05: Projector Fail-Safe Rollback
  test('F5-T2-05: Projector Fail-Safe Rollback', async ({ request }) => {
    const waybillNumber = 'W-ES-T2-05';
    const clientSideUuid = 'f5f5f5f5-f5f5-f5f5-f5f5-f5f5f5f5f505';
    await createCleanWaybill(request, waybillNumber, clientSideUuid);

    // Try to append event with invalid date causing database constraints to fail
    const response = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: {
          pickedUpAt: 'invalid-date-string-causing-rollback'
        }
      }
    });

    expect([400, 500]).toContain(response.status());

    // Verify the WAYBILL_PICKED_UP event is NOT appended to the waybill_events table
    const events = await prisma.waybillEvent.findMany({
      where: { waybillNumber }
    });
    // Only WAYBILL_CREATED should exist
    const hasPickedUp = events.some(e => e.eventType === 'WAYBILL_PICKED_UP');
    expect(hasPickedUp).toBe(false);

    // Verify the status on the main waybill table was NOT changed (remains DRAFT)
    const dbRecord = await prisma.deliveryRecord.findUnique({
      where: { waybillNumber }
    });
    expect(dbRecord!.status).toBe('DRAFT');
  });
});
