import { test, expect } from '@playwright/test';
import { prisma } from '../../backend/src/config/db';
import { e2eCredentials, getDispatcherToken, getDriverToken, loginDriverViaUi } from './credentials';

async function getIndexedDBCount(page: any, storeName: string): Promise<number> {
  return page.evaluate(async (store: string) => {
    return new Promise<number>((resolve) => {
      const request = indexedDB.open('iaw_db');
      request.onerror = () => resolve(0);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(store)) {
          resolve(0);
          return;
        }
        try {
          const tx = db.transaction(store, 'readonly');
          const objectStore = tx.objectStore(store);
          const countReq = objectStore.count();
          countReq.onsuccess = () => resolve(countReq.result);
          countReq.onerror = () => resolve(0);
        } catch (e) {
          resolve(0);
        }
      };
    });
  }, storeName);
}

test.describe('Tier 3: Combinations & Cross-Feature tests', () => {
  let driver1Token: string;
  let driver2Token: string;
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    driver1Token = await getDriverToken(request, e2eCredentials.driver1Pin);
    driver2Token = await getDriverToken(request, e2eCredentials.driver2Pin);
    dispatcherToken = await getDispatcherToken(request);
  });

  // F3-T3-01: Authenticated Driver Event Submission (F1 + F3 + F5)
  test('F3-T3-01: Authenticated Driver Event Submission', async ({ request }) => {
    const waybillNumber = `T3-01-${Date.now().toString().slice(-4)}`;
    
    // Create draft waybill assigned to Driver 1
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        status: 'DRAFT',
        pickupLocationName: 'Loc A',
        pickupAddress: 'Addr A',
        dropoffDestinationName: 'Loc B',
        dropoffAddress: 'Addr B',
        parcelDescription: 'Parcel',
        driverId: 'drv-01',
        capturedAt: new Date()
      }
    });

    // Driver 1 submits picked up event
    const response = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${driver1Token}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: { pickedUpAt: new Date().toISOString() }
      }
    });
    expect([200, 201]).toContain(response.status());

    // Verify projection onto record
    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
    expect(record!.status).toBe('PICKED_UP');
  });

  // F3-T3-02: Authenticated Driver Unauthorized Event Attempt (F1 + F3 + F5)
  test('F3-T3-02: Authenticated Driver Unauthorized Event Attempt', async ({ request }) => {
    const waybillNumber = `T3-02-${Date.now().toString().slice(-4)}`;
    
    // Create draft waybill assigned to Driver 2
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        status: 'DRAFT',
        pickupLocationName: 'Loc A',
        pickupAddress: 'Addr A',
        dropoffDestinationName: 'Loc B',
        dropoffAddress: 'Addr B',
        parcelDescription: 'Parcel',
        driverId: 'drv-02',
        capturedAt: new Date()
      }
    });

    // Driver 1 attempts to append status event to Driver 2's waybill
    const response = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${driver1Token}` },
      data: {
        eventType: 'WAYBILL_PICKED_UP',
        data: { pickedUpAt: new Date().toISOString() }
      }
    });
    expect(response.status()).toBe(403);

    // Verify no event is logged or projected
    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
    expect(record!.status).toBe('DRAFT');
  });

  // F3-T3-03: Dispatcher Administrative State Override (F2 + F3 + F5)
  test('F3-T3-03: Dispatcher Administrative State Override', async ({ request }) => {
    const waybillNumber = `T3-03-${Date.now().toString().slice(-4)}`;
    
    // Create draft waybill assigned to Driver 2
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        status: 'DRAFT',
        pickupLocationName: 'Loc A',
        pickupAddress: 'Addr A',
        dropoffDestinationName: 'Loc B',
        dropoffAddress: 'Addr B',
        parcelDescription: 'Parcel',
        driverId: 'drv-02',
        capturedAt: new Date()
      }
    });

    // Dispatcher overrides status to DELIVERED
    const response = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_OVERRIDE',
        data: { status: 'DELIVERED', pricingTotalCost: 99.99 }
      }
    });
    expect([200, 201]).toContain(response.status());

    // Verify override projected correctly
    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
    expect(record!.status).toBe('DELIVERED');
    expect(Number(record!.pricingTotalCost)).toBe(99.99);
  });

  // F3-T3-04: Offline Queue Accumulation & Bulk Upload (F4 + F6 + F1)
  test('F3-T3-04: Offline Queue Accumulation & Bulk Upload', async ({ page, context }) => {
    await context.setOffline(false);
    await loginDriverViaUi(page);

    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Pickup
    await page.getByText('➕ NEW PICKUP (WAYBILL)').click();
    await page.getByRole('button', { name: 'Acme Warehouse' }).click();
    await page.getByText('Confirm Drop Off Location ➡').click();
    await page.getByRole('button', { name: 'Beta Supply Co.' }).click();
    await page.getByRole('button', { name: '💾 COMPLETE PICKUP & LOG WAYBILL' }).click();

    // Delivery signoff with POD
    await page.getByRole('button', { name: 'Deliver w/ POD' }).first().click();
    await page.getByPlaceholder('Printed Name').fill('Bulk Signoff');
    // Draw signature
    await page.locator('#signature-canvas').evaluate((el: any) => {
      if (el && el.toDataURL) {
        el.dispatchEvent(new CustomEvent('signatureDraw', { detail: 'draw_data' }));
      }
    });
    await page.getByText('✔ COMPLETE DELIVERY & SIGN OFF').click();

    // Verify queues have both events and blobs
    expect(await getIndexedDBCount(page, 'waybill_events')).toBeGreaterThanOrEqual(2);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBeGreaterThanOrEqual(1);

    // Go online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for sync processing to clear local queues
    await page.waitForFunction(async () => {
      const dbRequest = indexedDB.open('iaw_db');
      return new Promise<boolean>((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction(['waybill_events', 'media_blobs'], 'readonly');
          const eReq = tx.objectStore('waybill_events').count();
          const bReq = tx.objectStore('media_blobs').count();
          tx.oncomplete = () => resolve(eReq.result === 0 && bReq.result === 0);
        };
      });
    }, null, { timeout: 15000 });

    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(0);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(0);
  });

  // F3-T3-05: Sequential Execution Order during Sync (F4 + F5 + F6)
  test('F3-T3-05: Sequential Execution Order during Sync', async ({ page, context }) => {
    // Sync sequentially offline actions
    await context.setOffline(false);
    await loginDriverViaUi(page);

    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const waybillNumber = `SEQ-${Date.now().toString().slice(-4)}`;

    // Create waybill offline via IndexedDB seed simulation to ensure sequential processing
    await page.evaluate(async (waybillNum) => {
      return new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('waybill_events', 'readwrite');
          const store = tx.objectStore('waybill_events');
          
          // Action 1: Create
          store.put({
            id: 'seq-1',
            clientSideUuid: 'seq-client-uuid',
            waybillNumber: waybillNum,
            eventType: 'WAYBILL_CREATED',
            timestamp: new Date(Date.now() - 5000).toISOString(),
            syncStatus: 'PENDING',
            data: {
              waybillNumber: waybillNum,
              pickupLocationName: 'Acme Warehouse',
              dropoffDestinationName: 'Beta Supply Co.',
              parcelDescription: 'Ordered Parts'
            }
          });

          // Action 2: Pickup
          store.put({
            id: 'seq-2',
            clientSideUuid: 'seq-client-uuid',
            waybillNumber: waybillNum,
            eventType: 'WAYBILL_PICKED_UP',
            timestamp: new Date(Date.now() - 2000).toISOString(),
            syncStatus: 'PENDING',
            data: { pickedUpAt: new Date(Date.now() - 2000).toISOString() }
          });

          // Action 3: Deliver
          store.put({
            id: 'seq-3',
            clientSideUuid: 'seq-client-uuid',
            waybillNumber: waybillNum,
            eventType: 'WAYBILL_DELIVERED',
            timestamp: new Date().toISOString(),
            syncStatus: 'PENDING',
            data: { deliveredAt: new Date().toISOString(), signatureName: 'Seq Deliver' }
          });

          tx.oncomplete = () => resolve();
        };
      });
    }, waybillNumber);

    // Verify 3 events queued
    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(3);

    // Go online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for sync to clear
    await page.waitForFunction(async () => {
      const dbRequest = indexedDB.open('iaw_db');
      return new Promise<boolean>((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction('waybill_events', 'readonly');
          const countReq = tx.objectStore('waybill_events').count();
          tx.oncomplete = () => resolve(countReq.result === 0);
        };
      });
    }, null, { timeout: 10000 });

    // Assert final materialized state is DELIVERED on server
    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
    expect(record).not.toBeNull();
    expect(record!.status).toBe('DELIVERED');
  });

  // F3-T3-06: Conflicted Sync Validation & Lockout (F4 + F6 + F3)
  test('F3-T3-06: Conflicted Sync Validation & Lockout', async ({ page, context }) => {
    await context.setOffline(false);
    await loginDriverViaUi(page);

    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Seed conflict simulation event
    await page.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('waybill_events', 'readwrite');
          const store = tx.objectStore('waybill_events');
          store.put({
            id: 'evt-lockout-conflict',
            clientSideUuid: 'lockout-client-uuid',
            waybillNumber: 'W-SEED-LOCKOUT',
            eventType: 'WAYBILL_PICKED_UP',
            timestamp: new Date().toISOString(),
            syncStatus: 'PENDING',
            data: { parcelDescription: 'conflict lockout simulation' }
          });
          tx.oncomplete = () => resolve();
        };
      });
    });

    // Go online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for conflict classification
    await page.waitForTimeout(3000);

    // Local sync status should be marked CONFLICT
    const status = await page.evaluate(async () => {
      const dbRequest = indexedDB.open('iaw_db');
      return new Promise<string>((resolve) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;
          const tx = db.transaction('waybill_events', 'readonly');
          const store = tx.objectStore('waybill_events');
          const req = store.get('evt-lockout-conflict');
          req.onsuccess = () => resolve(req.result?.syncStatus || '');
        };
      });
    });
    expect(status).toBe('CONFLICT');
  });
});
