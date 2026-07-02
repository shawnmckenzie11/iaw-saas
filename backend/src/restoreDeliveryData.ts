import { prisma } from './config/db';
import { googleSheetsAdapter, GOOGLE_SHEETS_ADAPTER_NAME } from './integrations/googleSheets/googleSheetsAdapter';
import { getGoogleSheetsEnvConfig } from './integrations/googleSheets/googleSheetsClient';
import { setIntakeCursor } from './intake/syncState';
import { archiveYearStart } from './utils/archiveCsvImporter';
import { reseedFromArchive } from './reseedFromArchive';

/**
 * Restores delivery records after an accidental wipe:
 * 1. Re-imports YTD archive CSV rows (no delete)
 * 2. Resets Google Sheets intake cursor and re-syncs all sheet rows
 */
async function main() {
  const since = archiveYearStart(
    process.env.ARCHIVE_SINCE_YEAR ? parseInt(process.env.ARCHIVE_SINCE_YEAR, 10) : new Date().getFullYear()
  );
  const skipArchive = process.env.RESTORE_SKIP_ARCHIVE === 'true';

  if (!skipArchive) {
    console.log('[Restore] Importing archive CSV rows (clearExisting=false)...');
    const archiveImported = await reseedFromArchive(prisma, {
      since,
      clearExisting: false,
      writeTopPickups: false,
    });
    console.log(`[Restore] Archive import count: ${archiveImported}`);
  } else {
    console.log('[Restore] Skipping archive import (RESTORE_SKIP_ARCHIVE=true).');
  }

  console.log('[Restore] Resetting Google Sheets intake cursor...');
  const deleted = await prisma.intakeSyncState.deleteMany({
    where: { adapterName: GOOGLE_SHEETS_ADAPTER_NAME },
  });
  console.log(`[Restore] Cleared ${deleted.count} intake cursor row(s).`);

  const sheetConfig = getGoogleSheetsEnvConfig();
  if (sheetConfig) {
    await setIntakeCursor(GOOGLE_SHEETS_ADAPTER_NAME, sheetConfig.spreadsheetId, 0);
    console.log('[Restore] Intake cursor set to 0 for full sheet re-import.');
  }

  let intakeImported = 0;
  let intakeSkipped = 0;
  try {
    console.log('[Restore] Re-syncing Google Sheets intake...');
    const result = await googleSheetsAdapter.sync();
    intakeImported = result.imported;
    intakeSkipped = result.skipped;
  } catch (err) {
    console.warn('[Restore] Google Sheets sync skipped:', err instanceof Error ? err.message : err);
  }

  const records = await prisma.deliveryRecord.count();
  const events = await prisma.waybillEvent.count();

  console.log(
    `[Restore] Done. intakeCreated=${intakeImported} intakeSkipped=${intakeSkipped} totalRecords=${records} totalEvents=${events}`
  );
}

main()
  .catch((err) => {
    console.error('[Restore] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
