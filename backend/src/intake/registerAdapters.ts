import type { IntakeAdapter, IntakeSyncResult } from './intakeAdapter';
import { googleSheetsAdapter } from '../integrations/googleSheets';

const registeredAdapters: IntakeAdapter[] = [];

/**
 * Runs a single adapter sync pass, logging failures without throwing.
 */
async function runAdapterSync(adapter: IntakeAdapter): Promise<IntakeSyncResult> {
  try {
    const result = await adapter.sync();
    console.log(
      `[Intake:${adapter.name}] sync complete imported=${result.imported} skipped=${result.skipped}`
    );
    return result;
  } catch (err) {
    console.error(`[Intake:${adapter.name}] sync failed:`, err);
    return { imported: 0, skipped: 0 };
  }
}

/**
 * Starts periodic polling for a registered intake adapter.
 */
function startPollingAdapter(adapter: IntakeAdapter, intervalMs: number): void {
  void runAdapterSync(adapter);
  setInterval(() => {
    void runAdapterSync(adapter);
  }, intervalMs);
  console.log(`[Intake:${adapter.name}] polling every ${intervalMs}ms`);
}

/**
 * Registers enabled intake adapters and starts their poll loops after server boot.
 */
export function registerIntakeAdapters(): void {
  registeredAdapters.length = 0;

  if (process.env.INTAKE_GOOGLE_SHEETS_ENABLED === 'true') {
    registeredAdapters.push(googleSheetsAdapter);
    const intervalMs = parseInt(process.env.INTAKE_GOOGLE_SHEETS_INTERVAL_MS ?? '60000', 10);
    startPollingAdapter(googleSheetsAdapter, intervalMs);
  }
}

/**
 * Manually runs all registered intake adapters (dispatcher admin trigger).
 */
export async function runAllIntakeAdapters(): Promise<Record<string, IntakeSyncResult>> {
  const results: Record<string, IntakeSyncResult> = {};
  for (const adapter of registeredAdapters) {
    results[adapter.name] = await runAdapterSync(adapter);
  }
  return results;
}

/**
 * Runs intake adapters on demand even when polling is disabled (manual sync endpoint).
 */
export async function runIntakeSyncOnDemand(): Promise<Record<string, IntakeSyncResult>> {
  const results: Record<string, IntakeSyncResult> = {};

  if (process.env.INTAKE_GOOGLE_SHEETS_ENABLED === 'true') {
    results[googleSheetsAdapter.name] = await runAdapterSync(googleSheetsAdapter);
  }

  return results;
}
