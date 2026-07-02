import { test, expect } from '@playwright/test';

// Self-contained helper to decode JWT payload and inspect claims
function decodeJWT(token: string): any {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT format');
  }
  const payload = parts[1];
  const decoded = Buffer.from(payload, 'base64').toString('utf-8');
  return JSON.parse(decoded);
}

test.describe('Feature 1: Driver Pin Authentication (Tier 1)', () => {
  // F1-T1-01: Valid Driver PIN Authentication
  test('F1-T1-01: Valid Driver PIN Authentication', async ({ request }) => {
    const response = await request.post('/api/auth/driver/login', {
      data: { pin: '1111' }
    });
    
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('token');
    
    const claims = decodeJWT(body.token);
    expect(claims.role).toBe('DRIVER');
    expect(claims).toHaveProperty('driverId');
    expect(claims.driverId).toBe('drv-01');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // F1-T1-02: Invalid PIN Pattern Rejection
  test('F1-T1-02: Invalid PIN Pattern Rejection', async ({ request }) => {
    const invalidPins = ['12a', '12345', ''];
    for (const pin of invalidPins) {
      const response = await request.post('/api/auth/driver/login', {
        data: { pin }
      });
      expect(response.status()).toBe(400);
      const body = await response.json();
      expect(body).toHaveProperty('error');
    }
  });

  // F1-T1-03: Unregistered PIN Rejection
  test('F1-T1-03: Unregistered PIN Rejection', async ({ request }) => {
    const response = await request.post('/api/auth/driver/login', {
      data: { pin: '9999' }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // F1-T1-04: JWT Expiration Verification
  test('F1-T1-04: JWT Expiration Verification', async ({ request }) => {
    const response = await request.post('/api/auth/driver/login', {
      data: { pin: '1111' }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    
    const claims = decodeJWT(body.token);
    const now = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeGreaterThan(now);
    
    // Verify exp is within the standard 12-hour session lifetime (43200 seconds)
    const timeToLive = claims.exp - now;
    expect(timeToLive).toBeGreaterThan(0);
    expect(timeToLive).toBeLessThanOrEqual(12 * 60 * 60 + 60);
  });

  // F1-T1-05: Case-Insensitive / Non-Numeric PIN Filtering
  test('F1-T1-05: Case-Insensitive / Non-Numeric PIN Filtering', async ({ request }) => {
    const response = await request.post('/api/auth/driver/login', {
      data: { pin: '$#%@' }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // UI Flow verification using standard browser page
  test('UI Login Flow - Driver', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('e.g. driver1 or dispatch')).toBeVisible();
    await page.getByPlaceholder('e.g. driver1 or dispatch').fill('driver1');
    await page.getByPlaceholder('4-digit passcode').fill('1111');
    await page.getByText('SIGN IN').click();
    await expect(page.getByText('Pending Sync')).toBeVisible();
  });
});

test.describe('Feature 2: Dispatcher Credentials Authentication (Tier 1)', () => {
  // F2-T1-01: Valid Dispatcher Credentials Login
  test('F2-T1-01: Valid Dispatcher Credentials Login', async ({ request }) => {
    const response = await request.post('/api/auth/dispatcher/login', {
      data: {
        email: 'dispatcher@example.com',
        password: 'password123'
      }
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('token');
    
    const claims = decodeJWT(body.token);
    expect(claims.role).toBe('DISPATCHER');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  // F2-T1-02: Invalid Password Rejection
  test('F2-T1-02: Invalid Password Rejection', async ({ request }) => {
    const response = await request.post('/api/auth/dispatcher/login', {
      data: {
        email: 'dispatcher@example.com',
        password: 'wrongpassword'
      }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // F2-T1-03: Malformed Email Address Rejection
  test('F2-T1-03: Malformed Email Address Rejection', async ({ request }) => {
    const response = await request.post('/api/auth/dispatcher/login', {
      data: {
        email: 'dispatcher_at_domain.com',
        password: 'password123'
      }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // F2-T1-04: Unregistered Email Rejection
  test('F2-T1-04: Unregistered Email Rejection', async ({ request }) => {
    const response = await request.post('/api/auth/dispatcher/login', {
      data: {
        email: 'unregistered@example.com',
        password: 'password123'
      }
    });
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // F2-T1-05: Missing Payload Parameters
  test('F2-T1-05: Missing Payload Parameters', async ({ request }) => {
    const response = await request.post('/api/auth/dispatcher/login', {
      data: {
        email: 'dispatcher@example.com'
      }
    });
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  // UI Flow verification using standard browser page
  test('UI Login Flow - Dispatcher', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByPlaceholder('e.g. driver1 or dispatch')).toBeVisible();
    await page.getByPlaceholder('e.g. driver1 or dispatch').fill('dispatch');
    await page.getByPlaceholder('4-digit passcode').fill('0000');
    await page.getByText('SIGN IN').click();
    await expect(page.getByText('Dispatch')).toBeVisible();
  });
});
