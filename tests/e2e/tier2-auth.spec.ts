import { test, expect } from '@playwright/test';
import jwt from 'jsonwebtoken';
import { prisma } from '../../backend/src/config/db';
import { e2eCredentials, getDispatcherToken } from './credentials';

const JWT_SECRET = process.env.JWT_SECRET || 'iaw-dev-jwt-secret';

test.describe('Feature 1: Driver Pin Authentication (Tier 2)', () => {
  // F1-T2-01: Unauthorized Endpoint Access
  test('F1-T2-01: Unauthorized Endpoint Access', async ({ request }) => {
    const response = await request.get('/api/waybills');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Authorization');
  });

  // F1-T2-02: Malformed JWT Signature Rejection
  test('F1-T2-02: Malformed JWT Signature Rejection', async ({ request }) => {
    // Modify signature of a valid token
    const loginResponse = await request.post('/api/auth/driver/login', {
      data: { pin: e2eCredentials.driver1Pin }
    });
    expect(loginResponse.status()).toBe(200);
    const { token } = await loginResponse.json();
    const malformedToken = token.slice(0, -5) + 'xxxxx';

    const response = await request.get('/api/waybills', {
      headers: { Authorization: `Bearer ${malformedToken}` }
    });
    expect([401, 403]).toContain(response.status());
  });

  // F1-T2-03: Expired Driver JWT Rejection
  test('F1-T2-03: Expired Driver JWT Rejection', async ({ request }) => {
    const expiredToken = jwt.sign(
      { sub: 'drv-01', role: 'DRIVER', driverId: 'drv-01', exp: Math.floor(Date.now() / 1000) - 30 },
      JWT_SECRET
    );

    const response = await request.get('/api/waybills', {
      headers: { Authorization: `Bearer ${expiredToken}` }
    });
    expect(response.status()).toBe(401);
  });

  // F1-T2-04: Role Collision Block
  test('F1-T2-04: Role Collision Block', async ({ request }) => {
    // Acquire a dispatcher token
    const dispatcherToken = await getDispatcherToken(request);

    // Dispatcher requests a route that strictly requires a DRIVER role
    const response = await request.get('/api/auth/driver-only-test', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    expect(response.status()).toBe(403);
  });

  // F1-T2-05: Bruteforce PIN Lockout
  test('F1-T2-05: Bruteforce PIN Lockout', async ({ request }) => {
    // Send 5 consecutive failed PIN attempts for drv-01
    for (let i = 0; i < 5; i++) {
      const failRes = await request.post('/api/auth/driver/login', {
        data: { pin: '9999', driverId: 'drv-01' }
      });
      expect(failRes.status()).toBe(401);
    }

    // Account transitions to a temporary locked state (423 Locked)
    const lockedRes = await request.post('/api/auth/driver/login', {
      data: { pin: e2eCredentials.driver1Pin, driverId: 'drv-01' }
    });
    expect(lockedRes.status()).toBe(423);
  });
});

test.describe('Feature 2: Dispatcher Credentials Authentication (Tier 2)', () => {
  // F2-T2-01: Protected Dispatcher Dashboard Access
  test('F2-T2-01: Protected Dispatcher Dashboard Access', async ({ request }) => {
    const response = await request.get('/api/admin/rates');
    expect(response.status()).toBe(401);
  });

  // F2-T2-02: Driver Role Rejection on Dispatcher Routes
  test('F2-T2-02: Driver Role Rejection on Dispatcher Routes', async ({ request }) => {
    const driverResponse = await request.post('/api/auth/driver/login', {
      data: { pin: e2eCredentials.driver1Pin }
    });
    const { token } = await driverResponse.json();

    const response = await request.get('/api/admin/rates', {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(response.status()).toBe(403);
  });

  // F2-T2-03: Token Revocation / Logout Verification
  test('F2-T2-03: Token Revocation / Logout Verification', async ({ request }) => {
    const dispatcherToken = await getDispatcherToken(request);

    // Call logout endpoint with dispatcher token
    const logoutRes = await request.post('/api/auth/logout', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    expect(logoutRes.status()).toBe(200);

    // Attempt to use dispatcher token again
    const response = await request.get('/api/admin/rates', {
      headers: { Authorization: `Bearer ${dispatcherToken}` }
    });
    expect(response.status()).toBe(401);
  });

  // F2-T2-04: Password Hashing Integrity Check
  test('F2-T2-04: Password Hashing Integrity Check', async () => {
    const dispatcher = await prisma.dispatcher.findUnique({
      where: { email: e2eCredentials.dispatcherEmail }
    });
    expect(dispatcher).not.toBeNull();
    expect(dispatcher!.passwordHash).not.toBe(e2eCredentials.dispatcherPassword);
    expect(dispatcher!.passwordHash.startsWith('$2')).toBe(true); // bcrypt prefix
  });

  // F2-T2-05: Session Expiration Enforcement
  test('F2-T2-05: Session Expiration Enforcement', async ({ page }) => {
    // Generate an expired dispatcher token
    const expiredToken = jwt.sign(
      { sub: 'cd4bbc86-f202-419d-bc56-314151da8947', role: 'DISPATCHER', exp: Math.floor(Date.now() / 1000) - 30 },
      JWT_SECRET
    );

    // Put expired session in storage layers and reload dashboard
    await page.goto('/');
    await page.evaluate((tok) => {
      const sess = {
        token: tok,
        role: 'DISPATCHER',
        username: 'dispatch'
      };
      const str = JSON.stringify(sess);
      localStorage.setItem('iaw_auth_session', str);
      sessionStorage.setItem('iaw_auth_session', str);
      document.cookie = `iaw_auth_session=${encodeURIComponent(str)}; path=/; max-age=43200`;
    }, expiredToken);

    // Reload the page: the API fetch will fail with 401, triggering logout
    await page.reload();
    await expect(page.getByRole('button', { name: 'Driver (PIN)' })).toBeVisible();
  });
});
