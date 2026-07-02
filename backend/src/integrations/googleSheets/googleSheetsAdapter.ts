import type { IntakeAdapter } from '../../intake/intakeAdapter';
import { createDraftWaybillFromRequest } from '../../intake/intakeService';
import { parseRequestFields } from '../../intake/parseRequestRow';
import {
  ensureIntakeCursorInitialized,
  getIntakeCursor,
  setIntakeCursor,
} from '../../intake/syncState';
import {
  fetchSheetRows,
  getGoogleSheetsEnvConfig,
  type SheetRow,
} from './googleSheetsClient';

export const GOOGLE_SHEETS_ADAPTER_NAME = 'google_sheet';

/**
 * Imports sheet rows newer than the stored cursor as DRAFT waybills.
 */
export async function syncGoogleSheetRows(
  rows: SheetRow[],
  spreadsheetId: string,
  headers: string[] = []
): Promise<{ imported: number; skipped: number }> {
  const maxRow = rows.length > 0 ? Math.max(...rows.map((row) => row.rowIndex)) : 0;
  let cursor = await ensureIntakeCursorInitialized(GOOGLE_SHEETS_ADAPTER_NAME, spreadsheetId, maxRow);

  let imported = 0;
  let skipped = 0;
  let highestProcessed = cursor;

  const newRows = rows
    .filter((row) => row.rowIndex > cursor)
    .sort((a, b) => a.rowIndex - b.rowIndex);

  for (const row of newRows) {
    const parsed = parseRequestFields(row.fields, headers);
    if (!parsed) {
      skipped += 1;
      highestProcessed = Math.max(highestProcessed, row.rowIndex);
      continue;
    }

    const waybillNumber = `REQ-${row.rowIndex}`;
    const outcome = await createDraftWaybillFromRequest(parsed, {
      externalSource: GOOGLE_SHEETS_ADAPTER_NAME,
      externalRowId: String(row.rowIndex),
      waybillNumber,
    });

    if (outcome === 'created') {
      imported += 1;
    } else {
      skipped += 1;
    }
    highestProcessed = Math.max(highestProcessed, row.rowIndex);
  }

  const storedCursor = await getIntakeCursor(GOOGLE_SHEETS_ADAPTER_NAME, spreadsheetId);
  if (storedCursor !== null && highestProcessed > storedCursor) {
    await setIntakeCursor(GOOGLE_SHEETS_ADAPTER_NAME, spreadsheetId, highestProcessed);
  }

  return { imported, skipped };
}

/** Google Sheets intake adapter — temporary bridge until native web form ships. */
export const googleSheetsAdapter: IntakeAdapter = {
  name: GOOGLE_SHEETS_ADAPTER_NAME,
  async sync() {
    const config = getGoogleSheetsEnvConfig();
    if (!config) {
      throw new Error(
        'Google Sheets intake enabled but GOOGLE_SHEETS_SPREADSHEET_ID or GOOGLE_SERVICE_ACCOUNT_JSON is missing'
      );
    }

    const { headers, rows } = await fetchSheetRows(config);
    return syncGoogleSheetRows(rows, config.spreadsheetId, headers);
  },
};
