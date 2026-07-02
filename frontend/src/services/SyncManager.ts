import {
  getQueueStats,
  iawDb,
  removeBlob,
  removeSyncedEvents,
  updateEventSyncStatus,
  type QueuedEvent,
} from '../db/indexedDb';
import type { AuthSession } from './auth';

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  conflictCount: number;
}

type SyncListener = (stats: SyncStats) => void;

/**
 * Returns true when an event payload should simulate a server-side sync conflict.
 */
function isConflictSimulationEvent(event: QueuedEvent): boolean {
  const desc = String(event.data?.parcelDescription ?? '').toLowerCase();
  return desc.includes('conflict') || desc.includes('fail');
}

/**
 * Manages offline queue stats and background synchronization to the API.
 */
class SyncManager {
  private listeners = new Set<SyncListener>();
  private networkConnected = navigator.onLine;
  private syncing = false;

  constructor() {
    window.addEventListener('online', () => {
      this.networkConnected = true;
      this.notify();
    });
    window.addEventListener('offline', () => {
      this.networkConnected = false;
      this.notify();
    });
  }

  /**
   * Subscribes to sync stat updates; returns an unsubscribe function.
   */
  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    this.notify();
    return () => this.listeners.delete(listener);
  }

  /**
   * Sets simulated network connectivity (for offline testing toggle).
   */
  setNetworkConnected(connected: boolean): void {
    this.networkConnected = connected;
    this.notify();
  }

  isNetworkConnected(): boolean {
    return this.networkConnected;
  }

  /**
   * Computes current queue statistics from IndexedDB.
   */
  async getStats(): Promise<SyncStats> {
    const { pendingEvents, syncedEvents, conflictEvents, blobs } = await getQueueStats();
    return {
      pendingCount: pendingEvents + blobs,
      syncedCount: syncedEvents,
      conflictCount: conflictEvents,
    };
  }

  private async notify(): Promise<void> {
    const stats = await this.getStats();
    this.listeners.forEach((l) => l(stats));
  }

  /**
   * Re-queues a conflicted event and attempts sync again.
   */
  async resolveConflictForce(eventId: string, session?: AuthSession): Promise<void> {
    await updateEventSyncStatus(eventId, 'PENDING');
    await this.notify();
    if (session && this.networkConnected) {
      await this.syncQueue(session);
    }
  }

  /**
   * Flushes pending events and blobs to the server when online.
   */
  async syncQueue(session: AuthSession): Promise<void> {
    if (this.syncing || !this.networkConnected) return;
    this.syncing = true;

    try {
      const allEvents = await iawDb.waybill_events.toArray();
      const pendingEvents = allEvents.filter((evt) => (evt.syncStatus ?? 'PENDING') === 'PENDING');

      for (const evt of pendingEvents) {
        if (isConflictSimulationEvent(evt)) {
          await updateEventSyncStatus(
            evt.id,
            'CONFLICT',
            'Server Rejected: Waybill duplicate collision (409 Conflict)'
          );
        }
      }

      const syncable = pendingEvents.filter((evt) => !isConflictSimulationEvent(evt));
      if (syncable.length > 0) {
        const res = await fetch('/api/sync/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ events: syncable }),
        });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.syncedIds)) {
            await removeSyncedEvents(body.syncedIds);
            for (const id of body.syncedIds) {
              const existing = allEvents.find((e) => e.id === id);
              if (existing && !syncable.some((s) => s.id === id)) continue;
            }
          }
        }
      }

      const blobs = await iawDb.media_blobs.toArray();
      for (const item of blobs) {
        const form = new FormData();
        form.append('waybillNumber', item.waybillNumber);
        form.append('fileType', item.fileType);
        form.append('blob', item.blob, `${item.fileType}.png`);
        const res = await fetch('/api/sync/blobs', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
          body: form,
        });
        if (res.ok) {
          await removeBlob(item.id);
        }
      }
    } catch {
      // Retain queue items when sync fails offline
    } finally {
      this.syncing = false;
      await this.notify();
    }
  }

  /** Triggers a stats refresh for subscribers. */
  async refresh(): Promise<void> {
    await this.notify();
  }
}

export const syncManager = new SyncManager();
