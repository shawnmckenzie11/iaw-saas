import { test, expect } from '@playwright/test';
import {
  e2eCredentials,
  getDispatcherToken,
  getDriverToken,
  loginDispatcherViaUi,
  loginDriverViaUi,
} from './credentials';

test.describe('Feature 3: API RBAC Gatekeeping (Tier 1)', () => {
  let driver1Token: string;
  let driver2Token: string;
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    // Acquire active role tokens for RBAC validation
    driver1Token = await getDriverToken(request, e2eCredentials.driver1Pin);
    driver2Token = await getDriverToken(request, e2eCredentials.driver2Pin);
    dispatcherToken = await getDispatcherToken(request);

    // Helper to ensure a waybill exists and is optionally assigned to a driver
    const ensureWaybill = async (waybillNumber: string, clientSideUuid: string, driverId: string | null) => {
      // Check if it already exists
      const checkRes = await request.get(`/api/waybills/${waybillNumber}`, {
        headers: { 'Authorization': `Bearer ${dispatcherToken}` }
      });
      if (checkRes.status() === 200) {
        return; // already exists
      }

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
      if (driverId && createRes.status() !== 409) {
        const assignRes = await request.post(`/api/waybills/${waybillNumber}/events`, {
          headers: { 'Authorization': `Bearer ${dispatcherToken}` },
          data: {
            eventType: 'WAYBILL_ASSIGNED',
            data: { driverId }
          }
        });
        expect([201, 400]).toContain(assignRes.status());
      }
    };

    // Seed W-001 assigned to drv-01
    await ensureWaybill('W-001', '11111111-1111-1111-1111-111111111111', 'drv-01');
    // Seed W-002 unassigned
    await ensureWaybill('W-002', '22222222-2222-2222-2222-222222222222', null);
    // Seed W-003 assigned to drv-02
    await ensureWaybill('W-003', '33333333-3333-3333-3333-333333333333', 'drv-02');
  });

  // F3-T1-01: Driver Read Access to Assigned Waybill
  test('F3-T1-01: Driver Read Access to Assigned Waybill', async ({ request }) => {
    const response = await request.get('/api/waybills/W-001', {
      headers: {
        'Authorization': `Bearer ${driver1Token}`
      }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.waybillNumber).toBe('W-001');
    expect(body.driverId).toBe('drv-01');
  });

  // F3-T1-02: Driver Read Access to Unassigned Waybill
  test('F3-T1-02: Driver Read Access to Unassigned Waybill', async ({ request }) => {
    const response = await request.get('/api/waybills/W-002', {
      headers: {
        'Authorization': `Bearer ${driver1Token}`
      }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.waybillNumber).toBe('W-002');
    expect(body.driverId).toBeNull();
  });

  // F3-T1-03: Driver Blocked from Other Driver's Waybill
  test('F3-T1-03: Driver Blocked from Other Driver\'s Waybill', async ({ request }) => {
    const response = await request.get('/api/waybills/W-003', {
      headers: {
        'Authorization': `Bearer ${driver1Token}`
      }
    });
    expect(response.status()).toBe(403);
  });

  // F3-T1-04: Driver Blocked from Admin Rate Table
  test('F3-T1-04: Driver Blocked from Admin Rate Table', async ({ request }) => {
    const response = await request.get('/api/admin/rates', {
      headers: {
        'Authorization': `Bearer ${driver1Token}`
      }
    });
    expect(response.status()).toBe(403);
  });

  // F3-T1-05: Dispatcher Global Access to All Waybills
  test('F3-T1-05: Dispatcher Global Access to All Waybills', async ({ request }) => {
    const response = await request.get('/api/waybills/W-003', {
      headers: {
        'Authorization': `Bearer ${dispatcherToken}`
      }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.waybillNumber).toBe('W-003');
  });

  // UI Flow verification verifying RBAC limits on Dashboard
  test('UI RBAC View - Driver vs Dispatcher Controls', async ({ page }) => {
    // 1. Log in as Driver. Check that Admin controls / Accounting navigation are hidden
    await loginDriverViaUi(page);
    
    // The "⚙️ Dispatch" toggle and accounting buttons should not be present or active
    await expect(page.getByText('⚙️ Dispatch')).not.toBeVisible();
    await expect(page.getByText('📊 ACCOUNTING & INVOICES')).not.toBeVisible();

    // Sign out
    await page.getByText('Sign Out').click();

    // 2. Log in as Dispatcher. Check that Admin controls / Accounting are visible
    await loginDispatcherViaUi(page);
    
    await expect(page.getByText('⚙️ Dispatch')).toBeVisible();
    await expect(page.getByText('📊 ACCOUNTING & INVOICES')).toBeVisible();
  });
});
