import { db, DeliveryRecord } from '../database/db';

export interface SyncStats {
  pendingCount: number;
  syncedCount: number;
  conflictCount: number;
}

type SyncCallback = (stats: SyncStats) => void;

class SynchronizationManager {
  private subscribers: Set<SyncCallback> = new Set();
  private syncing = false;
  private networkConnected = true;

  subscribe(callback: SyncCallback): () => void {
    this.subscribers.add(callback);
    this.notifySubscribers();
    return () => {
      this.subscribers.delete(callback);
    };
  }

  setNetworkConnected(connected: boolean) {
    this.networkConnected = connected;
    if (connected && !this.syncing) {
      this.syncQueue();
    }
  }

  async getSyncStats(): Promise<SyncStats> {
    const records = await db.getDeliveryRecords();
    return {
      pendingCount: records.filter(r => r.syncStatus === 'PENDING').length,
      syncedCount: records.filter(r => r.syncStatus === 'SYNCED').length,
      conflictCount: records.filter(r => r.syncStatus === 'CONFLICT').length,
    };
  }

  private async notifySubscribers() {
    const stats = await this.getSyncStats();
    this.subscribers.forEach(cb => cb(stats));
  }

  async syncQueue(): Promise<void> {
    if (this.syncing || !this.networkConnected) return;
    this.syncing = true;

    try {
      const records = await db.getDeliveryRecords();
      const pendingRecords = records.filter(r => r.syncStatus === 'PENDING');

      for (const record of pendingRecords) {
        await this.syncRecord(record);
      }
    } catch (error) {
      console.error('Sync queue loop error:', error);
    } finally {
      this.syncing = false;
      this.notifySubscribers();
    }
  }

  private async syncRecord(record: DeliveryRecord): Promise<void> {
    try {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));

      if (!this.networkConnected) {
        throw new Error('Disconnected mid-sync');
      }

      // Conflict Simulation Logic:
      // If the parcel description contains the word "conflict" (case-insensitive) or "FAIL",
      // we simulate a 409 Conflict/duplicate key collision from the server.
      const descLower = record.parcelDescription.toLowerCase();
      if (descLower.includes('conflict') || descLower.includes('fail')) {
        await db.updateSyncStatus(
          record.clientSideUuid,
          'CONFLICT',
          'Server Rejected: Waybill duplicate collision (409 Conflict)'
        );
        return;
      }

      // In a real application, we would make a POST/PUT request here:
      // const response = await fetch('https://api.iawcourier.com/deliveries', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(record)
      // });
      // if (response.status === 409) { trigger conflict }
      // if (!response.ok) { throw network error }

      // Success
      await db.updateSyncStatus(record.clientSideUuid, 'SYNCED');
    } catch (error: any) {
      console.warn(`Sync failed for record ${record.waybillNumber}:`, error.message);
      await db.updateSyncStatus(record.clientSideUuid, 'PENDING', error.message);
    }
  }

  // Force-override a conflict record (re-marks as PENDING to attempt re-sync)
  async resolveConflictForce(clientSideUuid: string): Promise<void> {
    await db.updateSyncStatus(clientSideUuid, 'PENDING');
    this.syncQueue();
  }
}

export const syncManager = new SynchronizationManager();
