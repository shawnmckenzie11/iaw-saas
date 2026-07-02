import { getPendingQueueCount, iawDb, removeBlob, removeSyncedEvents } from '../db/indexedDb';
import type { AuthSession } from './auth';

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  conflictCount: number;
}

type SyncListener = (stats: SyncStats) => void;

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
    const { events, blobs } = await getPendingQueueCount();
    return {
      pendingCount: events + blobs,
      syncedCount: 0,
      conflictCount: 0,
    };
  }

  private async notify(): Promise<void> {
    const stats = await this.getStats();
    this.listeners.forEach((l) => l(stats));
  }

  /**
   * Flushes pending events and blobs to the server when online.
   */
  async syncQueue(session: AuthSession): Promise<void> {
    if (this.syncing || !this.networkConnected) return;
    this.syncing = true;

    try {
      const events = await iawDb.waybill_events.toArray();
      if (events.length > 0) {
        const res = await fetch('/api/sync/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify({ events }),
        });
        if (res.ok) {
          const body = await res.json();
          if (Array.isArray(body.syncedIds)) {
            await removeSyncedEvents(body.syncedIds);
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
