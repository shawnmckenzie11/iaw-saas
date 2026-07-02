import Dexie, { Table } from 'dexie';

export type EventSyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';

export interface QueuedEvent {
  id: string;
  clientSideUuid: string;
  waybillNumber: string;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
  syncStatus?: EventSyncStatus;
  syncError?: string;
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
  const stats = await getQueueStats();
  return { events: stats.pendingEvents, blobs: stats.blobs };
}

export interface QueueStats {
  pendingEvents: number;
  syncedEvents: number;
  conflictEvents: number;
  blobs: number;
}

/**
 * Aggregates IndexedDB queue counts by sync lifecycle state.
 */
export async function getQueueStats(): Promise<QueueStats> {
  await iawDb.open();
  const allEvents = await iawDb.waybill_events.toArray();
  let pendingEvents = 0;
  let syncedEvents = 0;
  let conflictEvents = 0;
  for (const evt of allEvents) {
    const status = evt.syncStatus ?? 'PENDING';
    if (status === 'SYNCED') syncedEvents += 1;
    else if (status === 'CONFLICT') conflictEvents += 1;
    else pendingEvents += 1;
  }
  const blobs = await iawDb.media_blobs.count();
  return { pendingEvents, syncedEvents, conflictEvents, blobs };
}

/**
 * Adds a waybill event to the offline text sync queue.
 */
export async function queueEvent(event: QueuedEvent): Promise<void> {
  await iawDb.waybill_events.put({ syncStatus: 'PENDING', ...event });
}

/**
 * Updates the sync lifecycle state for a queued event.
 */
export async function updateEventSyncStatus(
  id: string,
  syncStatus: EventSyncStatus,
  syncError?: string
): Promise<void> {
  await iawDb.waybill_events.update(id, { syncStatus, syncError });
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
