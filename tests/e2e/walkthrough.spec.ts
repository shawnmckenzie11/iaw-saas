import { test, expect } from '@playwright/test';
import { e2eCredentials, getDispatcherToken } from './credentials';

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
    await expect(page.getByText('Driver')).toBeVisible();

    // Driver login
    await page.getByRole('button', { name: /driver/i }).click();
    await page.getByPlaceholder(/username/i).fill('drv-01');
    await page.getByPlaceholder(/pin/i).fill(e2eCredentials.driver1Pin);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/driver portal/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /new pickup/i }).click();
    await page.getByPlaceholder(/business|location/i).first().fill('Demo Warehouse');
    await page.getByRole('button', { name: /next/i }).click();
    await page.getByPlaceholder(/destination|dropoff/i).first().fill('Demo Customer Site');
    await page.getByRole('button', { name: /next|complete pickup/i }).click();

    // Sign out driver
    await page.getByRole('button', { name: /sign out/i }).click();

    // Dispatcher login
    await page.getByRole('button', { name: /dispatcher/i }).click();
    await page.getByPlaceholder(/email/i).fill(e2eCredentials.dispatcherEmail);
    await page.getByPlaceholder(/password/i).fill(e2eCredentials.dispatcherPassword);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/dispatch/i)).toBeVisible({ timeout: 15000 });

    await page.getByRole('button', { name: /pending price/i }).click();

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

    // Reference waybill for scripted demo (created if missing)
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
    await page.getByRole('button', { name: /pending price/i }).click();
    await page.getByText(waybillNumber).click();
    await expect(page.getByText(/pending price/i)).toBeVisible();
    await page.getByPlaceholder(/75|quote|price/i).fill('65');
    await page.getByRole('button', { name: /confirm price/i }).click();

    await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { Authorization: `Bearer ${dispatcherToken}` },
      data: { eventType: 'WAYBILL_VOIDED', data: {} },
    });
  });
});
