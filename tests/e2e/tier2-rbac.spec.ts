import { test, expect } from '@playwright/test';

// Helper to authenticate a driver and get token
async function getDriverToken(request: any, pin: string): Promise<string> {
  const response = await request.post('/api/auth/driver/login', {
    data: { pin }
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.token;
}

// Helper to authenticate a dispatcher and get token
async function getDispatcherToken(request: any): Promise<string> {
  const response = await request.post('/api/auth/dispatcher/login', {
    data: {
      email: 'dispatcher@example.com',
      password: 'password123'
    }
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  return body.token;
}

test.describe('Feature 3: API RBAC Gatekeeping (Tier 2)', () => {
  let driver1Token: string;
  let driver2Token: string;
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    // Acquire tokens
    driver1Token = await getDriverToken(request, '1111');
    driver2Token = await getDriverToken(request, '2222');
    dispatcherToken = await getDispatcherToken(request);

    // Helper to ensure a waybill exists and is assigned
    const ensureWaybill = async (waybillNumber: string, clientSideUuid: string, driverId: string | null) => {
      // Delete if exists to get clean state
      await request.delete(`/api/waybills/${waybillNumber}`, {
        headers: { 'Authorization': `Bearer ${dispatcherToken}` }
      }).catch(() => {});

      // Create waybill
      const createRes = await request.post('/api/waybills', {
        headers: { 'Authorization': `Bearer ${dispatcherToken}` },
        data: {
          clientSideUuid,
          waybillNumber,
          pickupLocationName: 'Seeded Origin',
          pickupAddress: '123 Seeded St',
          dropoffDestinationName: 'Seeded Destination',
          dropoffAddress: '456 Seeded Rd',
          parcelDescription: 'Test Parcel',
          parcelQuantity: 1,
          priority: 'REGULAR',
          vehicleType: 'CAR'
        }
      });
      expect([200, 201, 409]).toContain(createRes.status());

      // Assign driver if requested
      if (driverId) {
        const assignRes = await request.post(`/api/waybills/${waybillNumber}/events`, {
          headers: { 'Authorization': `Bearer ${dispatcherToken}` },
          data: {
            eventType: 'WAYBILL_ASSIGNED',
            data: { driverId }
          }
        });
        expect([200, 201]).toContain(assignRes.status());
      }
    };

    // Seed waybills for tests
    await ensureWaybill('W-001', '11111111-1111-1111-1111-111111111111', 'drv-01');
    await ensureWaybill('W-003', '33333333-3333-3333-3333-333333333333', 'drv-02');
    await ensureWaybill('W-004', '44444444-4444-4444-4444-444444444444', 'drv-02');
  });

  // F3-T2-01: Driver Mismatched Waybill Mutation Block
  test('F3-T2-01: Driver Mismatched Waybill Mutation Block', async ({ request }) => {
    // Driver 1 attempts to modify status of W-003 (assigned to Driver 2)
    const response = await request.post('/api/waybills/W-003/events', {
      headers: { 'Authorization': `Bearer ${driver1Token}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: { pickedUpAt: new Date().toISOString() }
      }
    });
    expect(response.status()).toBe(403);
  });

  // F3-T2-02: Dispatcher Global Overrides
  test('F3-T2-02: Dispatcher Global Overrides', async ({ request }) => {
    // Dispatcher overrides status of W-003 (assigned to Driver 2)
    const response = await request.post('/api/waybills/W-003/events', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_OVERRIDE',
        data: { status: 'DELIVERED', pricingTotalCost: 100.00 }
      }
    });
    expect([200, 201]).toContain(response.status());

    // Verify it changed
    const verifyRes = await request.get('/api/waybills/W-003', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` }
    });
    const waybill = await verifyRes.json();
    expect(waybill.status).toBe('DELIVERED');
    expect(waybill.pricingTotalCost).toBe(100.00);
  });

  // F3-T2-03: Preventing Status Hijacking
  test('F3-T2-03: Preventing Status Hijacking', async ({ request }) => {
    // Driver 1 attempts to assign W-004 (assigned to Driver 2) to themselves
    const response = await request.post('/api/waybills/W-004/events', {
      headers: { 'Authorization': `Bearer ${driver1Token}` },
      data: {
        eventType: 'WAYBILL_ASSIGNED',
        data: { driverId: 'drv-01' }
      }
    });
    expect([403, 409]).toContain(response.status());
  });

  // F3-T2-04: SQL/NoSQL Mutation Injection Protection
  test('F3-T2-04: SQL/NoSQL Mutation Injection Protection', async ({ request }) => {
    // Set a baseline price first as dispatcher
    await request.post('/api/waybills/W-001/events', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_OVERRIDE',
        data: { status: 'DRAFT', pricingTotalCost: 75.00 }
      }
    });

    // Driver 1 attempts to update status of W-001 while injecting a flat price override
    const response = await request.post('/api/waybills/W-001/events', {
      headers: { 'Authorization': `Bearer ${driver1Token}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: {
          pickedUpAt: new Date().toISOString(),
          calculatedPrice: 0.00,
          pricingTotalCost: 0.00
        }
      }
    });
    expect([200, 201]).toContain(response.status());

    // Verify the price did NOT change to 0.00
    const verifyRes = await request.get('/api/waybills/W-001', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` }
    });
    const waybill = await verifyRes.json();
    expect(waybill.pricingTotalCost).not.toBe(0.00);
    expect(waybill.pricingTotalCost).toBe(75.00);
  });

  // F3-T2-05: Dispatcher Administrative Lock Verification
  test('F3-T2-05: Dispatcher Administrative Lock Verification', async ({ request }) => {
    // Lock waybill using DISPATCHER_OVERRIDE to INVOICED
    const lockRes = await request.post('/api/waybills/W-001/events', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_OVERRIDE',
        data: { status: 'INVOICED' }
      }
    });
    expect([200, 201]).toContain(lockRes.status());

    // Dispatcher attempts to change details on locked waybill via DISPATCHER_CORRECTION
    const corrRes = await request.post('/api/waybills/W-001/events', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_CORRECTION',
        data: { pickupAddress: 'Tampered Address' }
      }
    });
    expect(corrRes.status()).toBe(422);
  });
});
