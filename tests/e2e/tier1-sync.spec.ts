import { test, expect } from '@playwright/test';

// Helper to interact with IndexedDB inside the browser context
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
      // Auto-create object stores if database does not exist
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('waybill_events')) {
          db.createObjectStore('waybill_events', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('media_blobs')) {
          db.createObjectStore('media_blobs', { keyPath: 'id' });
        }
      };
    });
  }, storeName);
}

// Helper to seed test data into IndexedDB for persistence tests
async function seedIndexedDBEvents(page: any, count: number): Promise<void> {
  await page.evaluate(async (num: number) => {
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
        for (let i = 0; i < num; i++) {
          store.put({
            id: `test-event-${i}`,
            clientSideUuid: `uuid-test-${i}`,
            waybillNumber: `W-TEST-${i}`,
            eventType: 'WAYBILL_CREATED',
            timestamp: new Date().toISOString(),
            data: { notes: 'Offline event' }
          });
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    });
  }, count);
}

test.describe('Feature 4: Offline Local IndexedDB (Tier 1)', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate and login as Driver 1
    await page.goto('/');
    await page.getByPlaceholder('e.g. driver1 or dispatch').fill('driver1');
    await page.getByPlaceholder('4-digit passcode').fill('1111');
    await page.getByText('SIGN IN').click();
  });

  // F4-T1-01: Offline Waybill Data Buffering
  test('F4-T1-01: Offline Waybill Data Buffering', async ({ page, context }) => {
    // 1. Go offline via simulation toggle or browser context
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // 2. Click "➕ NEW PICKUP (WAYBILL)"
    await page.getByText('➕ NEW PICKUP (WAYBILL)').click();

    // 3. Fill in details
    await page.getByPlaceholder('Location/Business Name').fill('Wajax');
    await page.getByPlaceholder('Pickup Address').fill('Sudbury, ON');
    await page.getByPlaceholder('Cargo Description').fill('Drill Bits');
    await page.getByText('💾 COMPLETE PICKUP & LOG WAYBILL').click();

    // 4. Verify client buffers event in IndexedDB and increments counter
    const dbCount = await getIndexedDBCount(page, 'waybill_events');
    expect(dbCount).toBeGreaterThanOrEqual(1);

    // Verify UI displays pending sync count
    await expect(
      page.locator('text=1 Pending Sync').or(page.locator('text=P:1'))
    ).toBeVisible();
  });

  // F4-T1-02: Separate Media Blob Buffering
  test('F4-T1-02: Separate Media Blob Buffering', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Open an active job to sign off
    await page.getByText('SIGN OFF ➡️').first().click();

    // Capture signature and complete sign-off
    await page.getByPlaceholder('Printed Name').fill('John Smith');
    // Draw signature
    await page.locator('#signature-canvas').evaluate((el: any) => {
      // Mock canvas draw
      if (el && el.toDataURL) {
        el.dispatchEvent(new CustomEvent('signatureDraw', { detail: 'drawing_path' }));
      }
    });
    await page.getByText('✔ COMPLETE DELIVERY & SIGN OFF').click();

    // Verify text metadata is in waybill_events and signature is in media_blobs
    const eventsCount = await getIndexedDBCount(page, 'waybill_events');
    const blobsCount = await getIndexedDBCount(page, 'media_blobs');
    expect(eventsCount).toBeGreaterThanOrEqual(1);
    expect(blobsCount).toBeGreaterThanOrEqual(1);
  });

  // F4-T1-03: UI Sync Counter Increment
  test('F4-T1-03: UI Sync Counter Increment', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Seed 3 offline events
    await seedIndexedDBEvents(page, 3);

    // Refresh page / reload stats and verify UI updates
    await page.reload();
    await expect(
      page.locator('text=3 Pending Sync').or(page.locator('text=P:3'))
    ).toBeVisible();
  });

  // F4-T1-04: IndexedDB Persistence across Refresh
  test('F4-T1-04: IndexedDB Persistence across Refresh', async ({ page, context }) => {
    // Go offline
    if (await page.getByText('🟢 Live').isVisible()) {
      await page.getByText('🟢 Live').click();
    }
    await context.setOffline(true);

    // Seed 2 offline events
    await seedIndexedDBEvents(page, 2);

    // Verify count
    await page.reload();
    await expect(
      page.locator('text=2 Pending Sync').or(page.locator('text=P:2'))
    ).toBeVisible();

    // Reload again
    await page.reload();
    await expect(
      page.locator('text=2 Pending Sync').or(page.locator('text=P:2'))
    ).toBeVisible();
  });

  // F4-T1-05: Empty Queue Verification
  test('F4-T1-05: Empty Queue Verification', async ({ page }) => {
    // Fresh app session, check empty queues
    const eventsCount = await getIndexedDBCount(page, 'waybill_events');
    const blobsCount = await getIndexedDBCount(page, 'media_blobs');
    expect(eventsCount).toBe(0);
    expect(blobsCount).toBe(0);

    await expect(
      page.locator('text=0 Pending Sync').or(page.locator('text=P:0'))
    ).toBeVisible();
    await expect(
      page.locator('text=Synced').or(page.locator('text=🟢 Live'))
    ).toBeVisible();
  });
});

test.describe('Feature 6: Dual-Sync Endpoints Coordination (Tier 1)', () => {
  let driverToken: string;

  test.beforeAll(async ({ request }) => {
    // Acquire driver token for API Sync endpoint validation
    const response = await request.post('/api/auth/driver/login', {
      data: { pin: '1111' }
    });
    const body = await response.json();
    driverToken = body.token;
  });

  // F6-T1-01: Bulk Events Sync Endpoint
  test('F6-T1-01: Bulk Events Sync Endpoint', async ({ request }) => {
    const eventsBatch = [
      {
        id: '99fb230d-2ea3-4cf1-83d2-d12f12285121',
        clientSideUuid: '99fb230d-2ea3-4cf1-83d2-d12f12285121',
        waybillNumber: 'W-009',
        eventType: 'WAYBILL_CREATED',
        timestamp: new Date().toISOString(),
        data: { parcelDescription: 'Machine Parts', priority: 'REGULAR' }
      },
      {
        id: '2cf51d8b-3fb1-433a-bc44-59e25d6efd1b',
        clientSideUuid: '2cf51d8b-3fb1-433a-bc44-59e25d6efd1b',
        waybillNumber: 'W-009',
        eventType: 'WAYBILL_ASSIGNED',
        timestamp: new Date().toISOString(),
        data: { driverId: 'drv-01' }
      },
      {
        id: '01d9f8b2-b13c-4861-accd-ee2d8f9ba123',
        clientSideUuid: '01d9f8b2-b13c-4861-accd-ee2d8f9ba123',
        waybillNumber: 'W-009',
        eventType: 'WAYBILL_PICKED_UP',
        timestamp: new Date().toISOString(),
        data: { status: 'PICKED_UP' }
      }
    ];

    const response = await request.post('/api/sync/events', {
      headers: {
        'Authorization': `Bearer ${driverToken}`
      },
      data: { events: eventsBatch }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('syncedIds');
    expect(Array.isArray(body.syncedIds)).toBe(true);
    expect(body.syncedIds.length).toBe(3);
  });

  // F6-T1-02: Media Blob Sync Endpoint
  test('F6-T1-02: Media Blob Sync Endpoint', async ({ request }) => {
    const response = await request.post('/api/sync/blobs', {
      headers: {
        'Authorization': `Bearer ${driverToken}`
      },
      multipart: {
        waybillNumber: 'W-009',
        fileType: 'signature',
        blob: {
          name: 'signature.png',
          mimeType: 'image/png',
          buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
        }
      }
    });

    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body).toHaveProperty('fileUri');
    expect(body.fileUri).toBeDefined();
  });

  // F6-T1-03: Empty Sync Request Handling
  test('F6-T1-03: Empty Sync Request Handling', async ({ request }) => {
    const response = await request.post('/api/sync/events', {
      headers: {
        'Authorization': `Bearer ${driverToken}`
      },
      data: { events: [] }
    });

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.syncedIds).toEqual([]);
  });

  // F6-T1-04: Invalid Event Sync Structure Rejection
  test('F6-T1-04: Invalid Event Sync Structure Rejection', async ({ request }) => {
    const response = await request.post('/api/sync/events', {
      headers: {
        'Authorization': `Bearer ${driverToken}`
      },
      data: {
        events: [
          {
            // Missing essential fields like id, eventType, waybillNumber
            clientSideUuid: '99fb230d-2ea3-4cf1-83d2-d12f12285121'
          }
        ]
      }
    });

    expect(response.status()).toBe(400);
  });

  // F6-T1-05: Missing Binary Blob Parameter
  test('F6-T1-05: Missing Binary Blob Parameter', async ({ request }) => {
    const response = await request.post('/api/sync/blobs', {
      headers: {
        'Authorization': `Bearer ${driverToken}`
      },
      multipart: {
        waybillNumber: 'W-009',
        fileType: 'signature'
        // Missing blob field
      }
    });

    expect(response.status()).toBe(400);
  });
});
