import { test, expect } from '@playwright/test';
import { e2eCredentials, getDispatcherToken } from './credentials';

test.describe('Feature 5: Event-Sourced Operations and Replay (Tier 1)', () => {
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    // Authenticate and retrieve token
    dispatcherToken = await getDispatcherToken(request);
  });

  // F5-T1-01: Event Logging on Waybill Creation
  test('F5-T1-01: Event Logging on Waybill Creation', async ({ request }) => {
    // 1. Submit a new waybill pickup via POST /api/waybills
    const clientSideUuid = '0b2e2d83-4903-4553-90d5-78e20f9ba987';
    const waybillNumber = 'M-10111';
    
    const createResponse = await request.post('/api/waybills', {
      headers: {
        'Authorization': `Bearer ${dispatcherToken}`
      },
      data: {
        clientSideUuid,
        waybillNumber,
        pickupLocationName: 'Onaping Mine',
        pickupAddress: 'Onaping, ON',
        dropoffDestinationName: 'Lively Depot',
        dropoffAddress: 'Lively, ON',
        parcelDescription: 'Core Samples',
        parcelQuantity: 2,
        priority: 'REGULAR',
        vehicleType: 'TRUCK'
      }
    });

    expect(createResponse.status()).toBe(201);

    // 2. Verify an event of type WAYBILL_CREATED is appended to the event log
    const eventsResponse = await request.get(`/api/waybills/${waybillNumber}/events`, {
      headers: {
        'Authorization': `Bearer ${dispatcherToken}`
      }
    });

    expect(eventsResponse.status()).toBe(200);
    const events = await eventsResponse.json();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(1);

    const createdEvent = events.find((e: any) => e.eventType === 'WAYBILL_CREATED');
    expect(createdEvent).toBeDefined();
    expect(createdEvent.data.waybillNumber).toBe(waybillNumber);
  });

  // F5-T1-02: Status Progression Validation
  test('F5-T1-02: Status Progression Validation', async ({ request }) => {
    const waybillNumber = 'M-10112';

    // 1. Create the waybill
    await request.post('/api/waybills', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        clientSideUuid: '2b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8e',
        waybillNumber,
        pickupLocationName: 'Victoria Mine',
        dropoffDestinationName: 'Downtown Office',
        parcelDescription: 'Ore Samples',
        priority: 'REGULAR'
      }
    });

    // 2. Attempt to append a DELIVERED event directly without the intermediary PICKED_UP event
    const transitionResponse = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: {
        'Authorization': `Bearer ${dispatcherToken}`
      },
      data: {
        eventType: 'WAYBILL_DELIVERED',
        data: {
          deliveredAt: new Date().toISOString(),
          signatureName: 'John Doe'
        }
      }
    });

    // Expect state transition validation rejection
    expect(transitionResponse.status()).toBe(400);
    const body = await transitionResponse.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('transition');
  });

  // F5-T1-03: Sequential Event Replay Projection
  test('F5-T1-03: Sequential Event Replay Projection', async ({ request }) => {
    const waybillNumber = 'M-10113';

    // 1. Create waybill
    await request.post('/api/waybills', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        clientSideUuid: '3b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d8f',
        waybillNumber,
        pickupLocationName: 'Sling Choker',
        dropoffDestinationName: 'Creighton Mine',
        parcelDescription: 'Cables',
        priority: 'REGULAR'
      }
    });

    // 2. Append PICKED_UP event
    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: { pickedUpAt: new Date().toISOString() }
      }
    });

    // 3. Append DELIVERED event
    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'WAYBILL_DELIVERED',
        data: {
          deliveredAt: new Date().toISOString(),
          signatureName: 'Synthetic Signer'
        }
      }
    });

    // 4. Verify that the waybill materialized state resolves to DELIVERED status
    const waybillResponse = await request.get(`/api/waybills/${waybillNumber}`, {
      headers: {
        'Authorization': `Bearer ${dispatcherToken}`
      }
    });
    expect(waybillResponse.status()).toBe(200);
    const waybill = await waybillResponse.json();
    expect(waybill.status).toBe('DELIVERED');
  });

  // F5-T1-04: Uniqueness of Sequence Numbers
  test('F5-T1-04: Uniqueness of Sequence Numbers', async ({ request }) => {
    const waybillNumber = 'M-10114';

    // Create waybill (seq = 1 automatically in database)
    await request.post('/api/waybills', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        clientSideUuid: '4b4c5d6e-7f8a-9b0c-1d2e-3f4a5b6c7d90',
        waybillNumber,
        pickupLocationName: 'Lively Depot',
        dropoffDestinationName: 'Victoria Mine',
        parcelDescription: 'Pipes',
        priority: 'REGULAR'
      }
    });

    // Fetch the event history to see current sequence
    const getEventsResponse = await request.get(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` }
    });
    const events = await getEventsResponse.json();
    const sequenceNumbers = events.map((e: any) => e.sequenceNumber);
    
    // Enforce sequence numbers are strictly incremented and unique
    expect(sequenceNumbers).toContain(1);
    const uniqueSeq = new Set(sequenceNumbers);
    expect(uniqueSeq.size).toBe(sequenceNumbers.length);
  });

  // F5-T1-05: Immutable Event History
  test('F5-T1-05: Immutable Event History', async ({ request }) => {
    const waybillNumber = 'M-10111';

    // Fetch waybill events to get an existing event id
    const getEventsResponse = await request.get(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` }
    });
    const events = await getEventsResponse.json();
    expect(events.length).toBeGreaterThan(0);
    const eventId = events[0].id;

    // Attempt to update the event using PUT (should be blocked)
    const updateResponse = await request.put(`/api/waybills/${waybillNumber}/events/${eventId}`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: { eventType: 'TAMPERED_EVENT_TYPE' }
    });
    expect([403, 405]).toContain(updateResponse.status());

    // Attempt to delete the event using DELETE (should be blocked)
    const deleteResponse = await request.delete(`/api/waybills/${waybillNumber}/events/${eventId}`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` }
    });
    expect([403, 405]).toContain(deleteResponse.status());
  });
});
