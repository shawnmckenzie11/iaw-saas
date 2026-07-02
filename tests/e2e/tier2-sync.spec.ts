import { test, expect } from '@playwright/test';
import { e2eCredentials, getDriverToken, loginDriverViaUi } from './credentials';

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

async function seedIndexedDBEvents(page: any, events: any[]): Promise<void> {
  await page.evaluate(async (evts: any[]) => {
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('iaw_db');
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('waybill_events')) {
          db.createObjectStore('waybill_events', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('waybill_events', 'readwrite');
        const store = tx.objectStore('waybill_events');
        for (const evt of evts) {
          store.put(evt);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, events);
}

async function seedIndexedDBBlob(
  page: any,
  data: { id: string; waybillNumber: string; fileType: string; blobBase64: string; createdAt: string }
): Promise<void> {
  await page.evaluate(async (d: any) => {
    const res = await fetch(`data:image/png;base64,${d.blobBase64}`);
    const blob = await res.blob();
    return new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('iaw_db');
      request.onerror = () => reject(request.error);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('media_blobs')) {
          db.createObjectStore('media_blobs', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('media_blobs', 'readwrite');
        const store = tx.objectStore('media_blobs');
        store.put({
          id: d.id,
          waybillNumber: d.waybillNumber,
          fileType: d.fileType,
          blob: blob,
          createdAt: d.createdAt,
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, data);
}

test.describe('Feature 4: Offline Local IndexedDB (Tier 2)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page, context }) => {
    await context.setOffline(false);
    await loginDriverViaUi(page);
  });

  // F4-T2-01: Text vs Blob Priority Order
  test('F4-T2-01: Text vs Blob Priority Order', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Seed one waybill event and one blob in IndexedDB
    const eventId = 'f4-t2-01-event-id';
    const blobId = 'f4-t2-01-blob-id';
    const waybillNumber = 'W-PRIO-01';

    await seedIndexedDBEvents(page, [
      {
        id: eventId,
        clientSideUuid: eventId,
        waybillNumber,
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Priority Test', priority: 'REGULAR' },
      },
    ]);

    await seedIndexedDBBlob(page, {
      id: blobId,
      waybillNumber,
      fileType: 'signature',
      blobBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      createdAt: new Date().toISOString(),
    });

    // Reload the page while online so the UI reads IndexedDB, then go back offline
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByText('Pending Sync')).toBeVisible();
    await context.setOffline(true);
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }

    // Intercept api calls to trace chronological order
    const requestOrder: string[] = [];
    await page.route('**/api/sync/events', async (route) => {
      requestOrder.push('events');
      await route.fulfill({ status: 200, json: { syncedIds: [eventId] } });
    });
    await page.route('**/api/sync/blobs', async (route) => {
      requestOrder.push('blobs');
      await route.fulfill({ status: 201, json: { fileUri: '/uploads/dummy.png' } });
    });

    // Go online
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Wait for the sync to complete by waiting for 0 Pending Sync
    await expect(
      page.locator('text=0 Pending Sync').or(page.locator('text=P:0'))
    ).toBeVisible();

    // Verify events request occurred before blobs request
    expect(requestOrder).toEqual(['events', 'blobs']);
  });

  // F4-T2-02: Client-side Validation of Offline Queue
  test('F4-T2-02: Client-side Validation of Offline Queue', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Go to new waybill screen
    await page.getByText('➕ NEW PICKUP (WAYBILL)').click();

    // Fill locations
    await page.getByRole('button', { name: 'Acme Warehouse' }).click();
    await page.getByText('Confirm Drop Off Location ➡').click();
    await page.getByRole('button', { name: 'Beta Supply Co.' }).click();

    // Select Other for weight and input invalid weight class (less than or equal to 75, or non-numeric)
    await page.getByRole('combobox').nth(1).selectOption('Other');
    await page.locator('input[placeholder="Custom weight in lbs"]').fill('50'); // Invalid, must be > 75

    // Verify next step / save button is disabled
    const nextBtn = page.locator('.nav-btn-next');
    await expect(nextBtn).toBeDisabled();

    // Check IndexedDB events count is 0
    const count = await getIndexedDBCount(page, 'waybill_events');
    expect(count).toBe(0);
  });

  // F4-T2-03: Corrupt Queue Recovery
  test('F4-T2-03: Corrupt Queue Recovery', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const corruptId = 'corrupt-event-id';
    const validId = 'valid-event-id';

    // Seed one corrupt event and one valid event
    await seedIndexedDBEvents(page, [
      {
        id: corruptId,
        clientSideUuid: corruptId,
        // missing waybillNumber and eventType to simulate corrupt structure
      },
      {
        id: validId,
        clientSideUuid: validId,
        waybillNumber: 'W-VALID-03',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Valid Recovery Test' },
      },
    ]);

    // Go online
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Verify valid event synced successfully and corrupt event is handled/skipped
    await expect(
      page.locator('text=1 Pending Sync').or(page.locator('text=P:1'))
    ).toBeVisible({ timeout: 10000 });

    // The valid event is successfully removed/synced
    const events = await page.evaluate(async () => {
      return new Promise<any[]>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('waybill_events', 'readonly');
          const store = tx.objectStore('waybill_events');
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result);
        };
      });
    });

    const hasValid = events.some((e) => e.id === validId);
    expect(hasValid).toBe(false);
  });

  // F4-T2-04: Connection Restore Trigger
  test('F4-T2-04: Connection Restore Trigger', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const eventId = 'f4-t2-04-event-id';
    await seedIndexedDBEvents(page, [
      {
        id: eventId,
        clientSideUuid: eventId,
        waybillNumber: 'W-RESTORE-04',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Connection Restore Test' },
      },
    ]);

    // Verify pending sync count increments
    await expect(
      page.locator('text=1 Pending Sync').or(page.locator('text=P:1'))
    ).toBeVisible();

    // Listen for events endpoint request
    let apiCalled = false;
    await page.route('**/api/sync/events', async (route) => {
      apiCalled = true;
      await route.fallback();
    });

    // Restore connection via UI toggle
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Verify automatic background sync triggered without manual refresh
    await expect(
      page.locator('text=0 Pending Sync').or(page.locator('text=P:0'))
    ).toBeVisible({ timeout: 10000 });

    expect(apiCalled).toBe(true);
  });

  // F4-T2-05: Storage Cleared post-Sync
  test('F4-T2-05: Storage Cleared post-Sync', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const eventId = 'f4-t2-05-event-id';
    const blobId = 'f4-t2-05-blob-id';
    const waybillNumber = 'W-CLEAN-05';

    await seedIndexedDBEvents(page, [
      {
        id: eventId,
        clientSideUuid: eventId,
        waybillNumber,
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Storage Cleared Test' },
      },
    ]);

    await seedIndexedDBBlob(page, {
      id: blobId,
      waybillNumber,
      fileType: 'signature',
      blobBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      createdAt: new Date().toISOString(),
    });

    // Check counts > 0
    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(1);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(1);

    // Go online
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Wait for sync to finish
    await expect(
      page.locator('text=0 Pending Sync').or(page.locator('text=P:0'))
    ).toBeVisible({ timeout: 10000 });

    // Verify storage cleared
    expect(await getIndexedDBCount(page, 'waybill_events')).toBe(0);
    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(0);
  });
});

test.describe('Feature 6: Dual-Sync Endpoints Coordination (Tier 2)', () => {
  let driverToken: string;

  test.beforeAll(async ({ request }) => {
    driverToken = await getDriverToken(request, e2eCredentials.driver1Pin);
  });

  test.beforeEach(async ({ page, context }) => {
    await context.setOffline(false);
    await loginDriverViaUi(page);
  });

  // F6-T2-01: Partial Sync Success recovery
  test('F6-T2-01: Partial Sync Success recovery', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const event1 = 'f6-t2-01-e1';
    const event2 = 'f6-t2-01-e2';
    const event3 = 'f6-t2-01-e3';

    // Seed 3 events where the 2nd will fail/conflict
    await seedIndexedDBEvents(page, [
      {
        id: event1,
        clientSideUuid: event1,
        waybillNumber: 'W-PART-01',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'First Event' },
      },
      {
        id: event2,
        clientSideUuid: event2,
        waybillNumber: 'W-PART-02',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'conflict' }, // Trigger conflict simulation locally
      },
      {
        id: event3,
        clientSideUuid: event3,
        waybillNumber: 'W-PART-03',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Third Event' },
      },
    ]);

    // Go online
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Wait for sync loop. The 1st and 3rd events succeed, while 2nd is flagged as conflict.
    // Sync stats should show 1 conflict count
    await expect(
      page.locator('text=1 Pending Sync').or(page.locator('text=P:1'))
    ).toBeVisible({ timeout: 10000 });

    // Inspect IndexedDB to verify 1st and 3rd are removed (succeeded) and 2nd is still present (flagged conflict)
    const events = await page.evaluate(async () => {
      return new Promise<any[]>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('waybill_events', 'readonly');
          const store = tx.objectStore('waybill_events');
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result);
        };
      });
    });

    expect(events.length).toBe(1);
    expect(events[0].id).toBe(event2);
    expect(events[0].syncStatus).toBe('CONFLICT');
  });

  // F6-T2-02: Blob Upload Failure Retry
  test('F6-T2-02: Blob Upload Failure Retry', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const eventId = 'f6-t2-02-evt';
    const blobId = 'f6-t2-02-blob';
    const waybillNumber = 'W-RETRY-02';

    await seedIndexedDBEvents(page, [
      {
        id: eventId,
        clientSideUuid: eventId,
        waybillNumber,
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Retry Test Event' },
      },
    ]);

    await seedIndexedDBBlob(page, {
      id: blobId,
      waybillNumber,
      fileType: 'signature',
      blobBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      createdAt: new Date().toISOString(),
    });

    // Mock blob upload to fail first
    let uploadFail = true;
    await page.route('**/api/sync/blobs', async (route) => {
      if (uploadFail) {
        await route.fulfill({ status: 500 });
      } else {
        await route.fulfill({ status: 201, json: { fileUri: '/uploads/dummy.png' } });
      }
    });

    // Go online
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Wait and verify event is synced, but blob is retained (1 pending sync remaining)
    await expect(
      page.locator('text=1 Pending Sync').or(page.locator('text=P:1'))
    ).toBeVisible({ timeout: 10000 });

    const eventsCount = await getIndexedDBCount(page, 'waybill_events');
    const blobsCount = await getIndexedDBCount(page, 'media_blobs');
    expect(eventsCount).toBe(0); // Event synced!
    expect(blobsCount).toBe(1);  // Blob retained!

    // Allow upload to succeed
    uploadFail = false;

    // Trigger sync again
    await page.evaluate(async () => {
      const sessStr = localStorage.getItem('iaw_auth_session') || sessionStorage.getItem('iaw_auth_session');
      if (sessStr) {
        const sess = JSON.parse(sessStr);
        // @ts-ignore
        window.syncManager?.syncQueue(sess);
      }
    });

    // Wait for sync to clear
    await expect(
      page.locator('text=0 Pending Sync').or(page.locator('text=P:0'))
    ).toBeVisible({ timeout: 10000 });

    expect(await getIndexedDBCount(page, 'media_blobs')).toBe(0);
  });

  // F6-T2-03: JWT Authentication Enforcement on Sync
  test('F6-T2-03: JWT Authentication Enforcement on Sync', async ({ request }) => {
    const resEvents = await request.post('/api/sync/events', {
      data: { events: [] },
    });
    expect(resEvents.status()).toBe(401);

    const resBlobs = await request.post('/api/sync/blobs', {
      multipart: {
        waybillNumber: 'W-TEST-JWT',
        fileType: 'signature',
        blob: {
          name: 'signature.png',
          mimeType: 'image/png',
          buffer: Buffer.from('abc'),
        },
      },
    });
    expect(resBlobs.status()).toBe(401);
  });

  // F6-T2-04: Large Media Payload Optimization
  test('F6-T2-04: Large Media Payload Optimization', async ({ request }) => {
    // Generate buffer larger than 5MB
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB

    const response = await request.post('/api/sync/blobs', {
      headers: {
        Authorization: `Bearer ${driverToken}`,
      },
      multipart: {
        waybillNumber: 'W-LARGE-04',
        fileType: 'signature',
        blob: {
          name: 'large.png',
          mimeType: 'image/png',
          buffer: largeBuffer,
        },
      },
    });

    // Expect 400 or 413
    expect([400, 413]).toContain(response.status());
  });

  // F6-T2-05: Queue Flushing Conflict Flagging
  test('F6-T2-05: Queue Flushing Conflict Flagging', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    const eventId = 'f6-t2-05-evt';
    await seedIndexedDBEvents(page, [
      {
        id: eventId,
        clientSideUuid: eventId,
        waybillNumber: 'W-CONFLICT-05',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'conflict' }, // This simulates conflict
      },
    ]);

    // Go online
    await context.setOffline(false);
    if (await page.getByText('🔴 Off').isVisible()) {
      await page.getByText('🔴 Off').click();
    }

    // Verify it updates local status to CONFLICT
    await expect(
      page.locator('text=1 Pending Sync').or(page.locator('text=P:1'))
    ).toBeVisible({ timeout: 10000 });

    const events = await page.evaluate(async () => {
      return new Promise<any[]>((resolve) => {
        const request = indexedDB.open('iaw_db');
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('waybill_events', 'readonly');
          const store = tx.objectStore('waybill_events');
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result);
        };
      });
    });

    expect(events.length).toBe(1);
    expect(events[0].syncStatus).toBe('CONFLICT');
  });
});
