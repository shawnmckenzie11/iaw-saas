import { test, expect } from '@playwright/test';
import { prisma } from '../../backend/src/config/db';
import { e2eCredentials, getDispatcherToken, getDriverToken, loginDispatcherViaUi, loginDriverViaUi } from './credentials';

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

test.describe('Tier 4: Application E2E Scenarios', () => {
  let driver1Token: string;
  let dispatcherToken: string;

  test.beforeAll(async ({ request }) => {
    driver1Token = await getDriverToken(request, e2eCredentials.driver1Pin);
    dispatcherToken = await getDispatcherToken(request);
  });

  // F4-T4-01: Happy Path Driver E2E Shift
  test('F4-T4-01: Happy Path Driver E2E Shift', async ({ page, request, context }) => {
    const waybillNumber = `SHIFT-${Date.now().toString().slice(-4)}`;
    
    // 1. Dispatcher creates unassigned waybill
    const createRes = await request.post('/api/waybills', {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        pickupLocationName: 'Acme Warehouse',
        pickupAddress: '123 Acme St',
        dropoffDestinationName: 'Beta Supply Co.',
        dropoffAddress: '456 Beta Rd',
        parcelDescription: 'E2E Shift Box',
        parcelQuantity: 1,
        priority: 'REGULAR',
        vehicleType: 'CAR'
      }
    });
    expect([200, 201]).toContain(createRes.status());

    // 2. Job Claim: Driver claims waybill via event API
    const claimRes = await request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${driver1Token}` },
      data: {
        eventType: 'WAYBILL_ASSIGNED',
        data: { driverId: 'drv-01' }
      }
    });
    expect([200, 201]).toContain(claimRes.status());

    // 3. Driver logs in via UI
    await context.setOffline(false);
    await loginDriverViaUi(page);

    // 4. Offline Log: Driver goes offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Click "Pick Up"
    await page.getByRole('button', { name: 'Pick Up' }).first().click();
    await page.getByText('Confirm Drop Off Location ➡').click();
    await page.getByText('💾 COMPLETE PICKUP & LOG WAYBILL').click();

    // 5. Dropoff & Sign-off: Driver arrives, enters name, captures signature
    await page.getByRole('button', { name: 'Deliver w/ POD' }).first().click();
    await page.getByPlaceholder('Printed Name').fill('Shift Recipient');
    
    await page.locator('#signature-canvas').evaluate((el: any) => {
      if (el && el.toDataURL) {
        el.dispatchEvent(new CustomEvent('signatureDraw', { detail: 'shift_signature' }));
      }
    });
    await page.getByText('✔ COMPLETE DELIVERY & SIGN OFF').click();

    // Verify events/blobs are stored offline
    expect(await getIndexedDBCount(page, 'waybill_events')).toBeGreaterThanOrEqual(1);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBeGreaterThanOrEqual(1);

    // 6. Reconnection: Driver toggles online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for queues to flush
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

    // 7. Verification: Dispatcher logs in and checks completed waybill details
    await page.getByText('Sign Out').click();
    await loginDispatcherViaUi(page);

    await page.getByRole('button', { name: 'Completed' }).click();
    await page.getByText(waybillNumber).click();
    await expect(page.getByText('Shift Recipient')).toBeVisible();
    await expect(page.locator('.modal-signature-img')).toBeVisible();
  });

  // F4-T4-02: Mid-Sync Connection Interruption Recovery
  test('F4-T4-02: Mid-Sync Connection Interruption Recovery', async ({ page, context }) => {
    await context.setOffline(false);
    await loginDriverViaUi(page);

    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Seed 5 events and 5 blobs
    await page.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['waybill_events', 'media_blobs'], 'readwrite');
          const eventsStore = tx.objectStore('waybill_events');
          const blobsStore = tx.objectStore('media_blobs');

          for (let i = 0; i < 5; i++) {
            eventsStore.put({
              id: `mid-evt-${i}`,
              clientSideUuid: `mid-client-${i}`,
              waybillNumber: `W-MID-${i}`,
              eventType: 'WAYBILL_CREATED',
              timestamp: new Date().toISOString(),
              syncStatus: 'PENDING',
              data: {
                waybillNumber: `W-MID-${i}`,
                pickupLocationName: 'Acme Warehouse',
                dropoffDestinationName: 'Beta Supply Co.',
                parcelDescription: 'Mid Sync Parts'
              }
            });

            // Seed dummy 1x1 base64 transparent PNG blob
            const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const binary = atob(base64Png);
            const array = [];
            for (let j = 0; j < binary.length; j++) {
              array.push(binary.charCodeAt(j));
            }
            const blob = new Blob([new Uint8Array(array)], { type: 'image/png' });

            blobsStore.put({
              id: `mid-blob-${i}`,
              waybillNumber: `W-MID-${i}`,
              fileType: 'signature',
              blob,
              createdAt: new Date().toISOString()
            });
          }
          tx.oncomplete = () => resolve();
        };
      });
    });

    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(5);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(5);

    // Intercept sync events and blobs: let first 3 events sync, then drop out
    let eventCount = 0;
    await page.route('**/api/sync/events', async (route) => {
      eventCount++;
      if (eventCount <= 3) {
        await route.continue();
      } else {
        await route.abort('failed');
      }
    });

    await page.route('**/api/sync/blobs', async (route) => {
      await route.abort('failed');
    });

    // Toggle online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for dropout to trigger (remaining events and blobs should be retained)
    await page.waitForTimeout(3000);

    // Clean up routes and restore normal network
    await page.unroute('**/api/sync/events');
    await page.unroute('**/api/sync/blobs');

    // Trigger sync retry
    await page.evaluate(() => {
      // Re-trigger sync loop manually by setting connected
      (window as any).dispatchEvent(new Event('online'));
    });

    // Wait for all remaining items to sync
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

  // F4-T4-03: Concurrency and Race Conflict Management
  test('F4-T4-03: Concurrency and Race Conflict Management', async ({ page, context }) => {
    const waybillNumber = `RACE-${Date.now().toString().slice(-4)}`;
    
    // Seed unassigned waybill on server
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        status: 'DRAFT',
        pickupLocationName: 'Loc A',
        pickupAddress: 'Addr A',
        dropoffDestinationName: 'Loc B',
        dropoffAddress: 'Addr B',
        parcelDescription: 'Race Cargo',
        capturedAt: new Date()
      }
    });

    // Driver A claims it first on server
    await prisma.deliveryRecord.update({
      where: { waybillNumber },
      data: { driverId: 'drv-01' }
    });

    // Now Driver B (logged in via UI) goes offline
    await context.setOffline(false);
    await loginDriverViaUi(page, 'driver2', e2eCredentials.driver2Pin);

    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Driver B tries to pick up the unassigned waybill offline (which is already claimed by Driver A on the server)
    await page.evaluate(async (waybillNum) => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('waybill_events', 'readwrite');
          const store = tx.objectStore('waybill_events');
          
          store.put({
            id: 'race-evt-conflict-b',
            clientSideUuid: 'drv-b-client-uuid',
            waybillNumber: waybillNum,
            eventType: 'WAYBILL_PICKED_UP',
            timestamp: new Date().toISOString(),
            syncStatus: 'PENDING',
            data: {
              pickedUpAt: new Date().toISOString(),
              parcelDescription: 'conflict item' // trigger local conflict simulation
            }
          });
          tx.oncomplete = () => resolve();
        };
      });
    }, waybillNumber);

    // Driver B goes online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for conflict feedback
    await page.waitForTimeout(3000);

    // Driver B's client should show the conflict badge/banner
    await expect(page.locator('.conflict-badge').first().or(page.locator('.conflict-banner'))).toBeVisible();
  });

  // F4-T4-04: Dispatcher Dispute Resolution Override
  test('F4-T4-04: Dispatcher Dispute Resolution Override', async ({ page, context }) => {
    const waybillNumber = `DISP-${Date.now().toString().slice(-4)}`;
    
    // Seed waybill with conflict status
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: crypto.randomUUID(),
        waybillNumber,
        status: 'PICKED_UP',
        pickupLocationName: 'Conflict Location',
        pickupAddress: 'Wrong Address 123',
        dropoffDestinationName: 'Dropoff Site',
        dropoffAddress: '456 Drop Rd',
        parcelDescription: 'Disputed Cargo',
        capturedAt: new Date()
      }
    });

    // Dispatcher logs in and opens dashboard
    await context.setOffline(false);
    await loginDispatcherViaUi(page);

    // Correct details by posting DISPATCHER_CORRECTION event
    const response = await page.request.post(`/api/waybills/${waybillNumber}/events`, {
      headers: { 'Authorization': `Bearer ${dispatcherToken}` },
      data: {
        eventType: 'DISPATCHER_CORRECTION',
        data: {
          pickupAddress: 'Correct Address 789'
        }
      }
    });
    expect([200, 201]).toContain(response.status());

    // Verify address is updated on server
    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber } });
    expect(record!.pickupAddress).toBe('Correct Address 789');
  });

  // F4-T4-05: High-Density Media Queue Handling
  test('F4-T4-05: High-Density Media Queue Handling', async ({ page, context }) => {
    await context.setOffline(false);
    await loginDriverViaUi(page);

    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const waybillNumber = `HIGH-${Date.now().toString().slice(-4)}`;

    // Seed 1 status event and 7 binary blobs (1 signature and 6 proof of delivery photos)
    await page.evaluate(async (waybillNum) => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['waybill_events', 'media_blobs'], 'readwrite');
          const eventsStore = tx.objectStore('waybill_events');
          const blobsStore = tx.objectStore('media_blobs');

          eventsStore.put({
            id: 'high-evt-created',
            clientSideUuid: 'high-client-uuid',
            waybillNumber: waybillNum,
            eventType: 'WAYBILL_CREATED',
            timestamp: new Date().toISOString(),
            syncStatus: 'PENDING',
            data: {
              waybillNumber: waybillNum,
              pickupLocationName: 'Acme Warehouse',
              dropoffDestinationName: 'Beta Supply Co.',
              parcelDescription: 'High Density Box'
            }
          });

          const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          const binary = atob(base64Png);
          const array = [];
          for (let j = 0; j < binary.length; j++) {
            array.push(binary.charCodeAt(j));
          }
          const blob = new Blob([new Uint8Array(array)], { type: 'image/png' });

          // Seed 1 signature blob
          blobsStore.put({
            id: 'high-blob-sig',
            waybillNumber: waybillNum,
            fileType: 'signature',
            blob,
            createdAt: new Date().toISOString()
          });

          // Seed 6 photo blobs
          for (let k = 0; k < 6; k++) {
            blobsStore.put({
              id: `high-blob-photo-${k}`,
              waybillNumber: waybillNum,
              fileType: 'photo',
              blob,
              createdAt: new Date().toISOString()
            });
          }

          tx.oncomplete = () => resolve();
        };
      });
    }, waybillNumber);

    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(1);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(7);

    // Go online
    await context.setOffline(false);
    await page.locator('.network-toggle').click();

    // Wait for all to clear sequentially
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
    }, null, { timeout: 20000 });

    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(0);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(0);
  });
});
