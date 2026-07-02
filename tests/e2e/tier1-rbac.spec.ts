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

test.describe('Feature 3: API RBAC Gatekeeping (Tier 1)', () => {
  let driver1Token: string;
  let driver2Token: string;
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    // Acquire active role tokens for RBAC validation
    driver1Token = await getDriverToken(request, '1111');
    driver2Token = await getDriverToken(request, '2222');
    dispatcherToken = await getDispatcherToken(request);
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
    await page.goto('/');
    await page.getByPlaceholder('e.g. driver1 or dispatch').fill('driver1');
    await page.getByPlaceholder('4-digit passcode').fill('1111');
    await page.getByText('SIGN IN').click();
    
    // The "⚙️ Dispatch" toggle and accounting buttons should not be present or active
    await expect(page.getByText('⚙️ Dispatch')).not.toBeVisible();
    await expect(page.getByText('📊 ACCOUNTING & INVOICES')).not.toBeVisible();

    // Sign out
    await page.getByText('Sign Out').click();

    // 2. Log in as Dispatcher. Check that Admin controls / Accounting are visible
    await page.getByPlaceholder('e.g. driver1 or dispatch').fill('dispatch');
    await page.getByPlaceholder('4-digit passcode').fill('0000');
    await page.getByText('SIGN IN').click();
    
    await expect(page.getByText('⚙️ Dispatch')).toBeVisible();
    await expect(page.getByText('📊 ACCOUNTING & INVOICES')).toBeVisible();
  });
});
