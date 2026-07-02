import Dexie, { Table } from 'dexie';

export interface QueuedEvent {
  id: string;
  clientSideUuid: string;
  waybillNumber: string;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface QueuedBlob {
  id: string;
  waybillNumber: string;
  fileType: string;
  blob: Blob;
  createdAt: string;
}

/**
 * Dexie-backed IndexedDB database matching E2E test store names.
 */
class IawDatabase extends Dexie {
  waybill_events!: Table<QueuedEvent, string>;
  media_blobs!: Table<QueuedBlob, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor() {
    super('iaw_db');
    this.version(1).stores({
      waybill_events: 'id',
      media_blobs: 'id',
    });
    this.version(2).stores({
      waybill_events: 'id',
      media_blobs: 'id',
      meta: 'key',
    });
  }
}

export const iawDb = new IawDatabase();

/**
 * Returns the count of pending items across both sync queues.
 */
export async function getPendingQueueCount(): Promise<{ events: number; blobs: number }> {
  await iawDb.open();
  const [events, blobs] = await Promise.all([
    iawDb.waybill_events.count(),
    iawDb.media_blobs.count(),
  ]);
  return { events, blobs };
}

/**
 * Adds a waybill event to the offline text sync queue.
 */
export async function queueEvent(event: QueuedEvent): Promise<void> {
  await iawDb.waybill_events.put(event);
}

/**
 * Adds a media blob to the offline blob sync queue.
 */
export async function queueBlob(blob: QueuedBlob): Promise<void> {
  await iawDb.media_blobs.put(blob);
}

/**
 * Removes synced events from the local queue by ID.
 */
export async function removeSyncedEvents(ids: string[]): Promise<void> {
  await iawDb.waybill_events.bulkDelete(ids);
}

/**
 * Removes a synced blob from the local queue.
 */
export async function removeBlob(id: string): Promise<void> {
  await iawDb.media_blobs.delete(id);
}
