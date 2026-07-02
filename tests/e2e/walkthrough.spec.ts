import { test, expect } from '@playwright/test';
import {
  e2eCredentials,
  getDispatcherToken,
  loginDriverViaUi,
} from './credentials';

/**
 * Short scripted walkthrough for screen recording (driver pickup + dispatcher pricing).
 * Creates and voids a synthetic waybill — no scratch data left in the database.
 */
test.describe('PWA walkthrough recording', () => {
  test('driver pickup and dispatcher pending price @walkthrough', async ({ page, request }) => {
    test.slow();

    const waybillNumber = `WALK-${Date.now().toString().slice(-6)}`;
    const dispatcherToken = await getDispatcherToken(request);

    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Driver (PIN)' })).toBeVisible();

    await loginDriverViaUi(page);
    await expect(page.getByText(/driver portal/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /new pickup/i }).click();
    await expect(page.getByText('Quick Select Pickup Location:')).toBeVisible();

    await page.getByRole('button', { name: 'Other' }).first().click();
    await page.getByPlaceholder('Location name').fill('Demo Warehouse');
    await page.getByPlaceholder('Street Address').first().fill('100 Demo St');
    await page.getByRole('button', { name: /confirm drop off location/i }).click();

    await page.getByRole('button', { name: 'Other' }).click();
    await page.getByPlaceholder('Destination name').fill('Demo Customer Site');
    await page.getByPlaceholder('Street Address').fill('200 Demo Ave');
    await page.getByRole('button', { name: /complete pickup/i }).click();

    await expect(page.getByText(/driver portal/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.getByRole('button', { name: 'Driver (PIN)' })).toBeVisible();

    await page.getByRole('button', { name: 'Dispatcher' }).click();
    const loginInputs = page.locator('.login-card input');
    await loginInputs.nth(0).fill(e2eCredentials.dispatcherEmail);
    await loginInputs.nth(1).fill(e2eCredentials.dispatcherPassword);
    await page.getByText('SIGN IN').click();
    await expect(page.getByText(/dispatch/i)).toBeVisible({ timeout: 15000 });

    // Cleanup: void any walkthrough waybills created during the session
    const listRes = await request.get('/api/waybills', {
      headers: { Authorization: `Bearer ${dispatcherToken}` },
    });
    const waybills = (await listRes.json()) as Array<{ waybillNumber: string }>;
    for (const wb of waybills.filter((w) => w.waybillNumber.startsWith('WALK-'))) {
      await request.post(`/api/waybills/${wb.waybillNumber}/events`, {
        headers: { Authorization: `Bearer ${dispatcherToken}` },
        data: { eventType: 'WAYBILL_VOIDED', data: {} },
      });
    }

    await request.post('/api/waybills', {
      headers: { Authorization: `Bearer ${dispatcherToken}` },
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        pickupLocationName: 'Walkthrough Origin',
        pickupAddress: '100 Demo St',
        dropoffDestinationName: 'Walkthrough Destination',
        dropoffAddress: '200 Demo Ave',
        parcelDescription: 'Walkthrough parcel',
        parcelQuantity: 1,
        priority: 'REGULAR',
        vehicleType: 'CAR',
      },
    });

    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { Authorization: `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_OVERRIDE',
        data: { status: 'DELIVERED', pricingTotalCost: 0 },
      },
    });

    await page.reload();
    await page.getByRole('button', { name: /completed pending \$/i }).click();
    await page.getByText(waybillNumber).click();
    await expect(page.getByText(/pending price/i).first()).toBeVisible();
    await page.getByPlaceholder('e.g. 75.00').fill('65');
    await page.getByRole('button', { name: 'Confirm Price' }).click();

    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { Authorization: `Bearer ${dispatcherToken}` },
      data: { eventType: 'WAYBILL_VOIDED', data: {} },
    });
  });
});
