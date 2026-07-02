/** Result counters returned by an intake adapter sync pass. */
export interface IntakeSyncResult {
  imported: number;
  skipped: number;
}

/**
 * Pluggable intake source (Google Sheets today, native web form later).
 */
export interface IntakeAdapter {
  /** Stable adapter id stored on delivery_records.external_source. */
  name: string;
  /** Pulls new external rows into DRAFT waybills. */
  sync(): Promise<IntakeSyncResult>;
}
