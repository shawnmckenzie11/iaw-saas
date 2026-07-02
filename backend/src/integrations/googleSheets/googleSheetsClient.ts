import { google, sheets_v4 } from 'googleapis';

export interface SheetRow {
  /** 1-based row index matching Google Sheets row numbers. */
  rowIndex: number;
  fields: string[];
}

export interface SheetFetchResult {
  headers: string[];
  rows: SheetRow[];
}

export interface GoogleSheetsClientConfig {
  spreadsheetId: string;
  serviceAccountJson: string;
}

/**
 * Builds an authenticated Google Sheets API client from a service account JSON secret.
 */
export function createSheetsClient(serviceAccountJson: string): sheets_v4.Sheets {
  const credentials = JSON.parse(serviceAccountJson) as {
    client_email: string;
    private_key: string;
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  return google.sheets({ version: 'v4', auth });
}

/**
 * Resolves the first worksheet title for a spreadsheet.
 */
export async function getFirstSheetTitle(
  client: sheets_v4.Sheets,
  spreadsheetId: string
): Promise<string> {
  const meta = await client.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  const title = meta.data.sheets?.[0]?.properties?.title;
  if (!title) {
    throw new Error(`No worksheets found in spreadsheet ${spreadsheetId}`);
  }
  return title;
}

/**
 * Fetches header row and data rows from the first sheet.
 */
export async function fetchSheetRows(config: GoogleSheetsClientConfig): Promise<SheetFetchResult> {
  const client = createSheetsClient(config.serviceAccountJson);
  const sheetTitle = await getFirstSheetTitle(client, config.spreadsheetId);
  const range = `'${sheetTitle.replace(/'/g, "''")}'!A:Z`;

  const response = await client.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range,
    majorDimension: 'ROWS',
  });

  const values = response.data.values ?? [];
  const headerRow = (values[0] ?? []).map((cell) => String(cell ?? '').trim());
  const rows: SheetRow[] = [];

  for (let i = 1; i < values.length; i++) {
    const raw = values[i] ?? [];
    const fields = raw.map((cell) => String(cell ?? '').trim());
    if (fields.every((field) => !field)) continue;
    rows.push({ rowIndex: i + 1, fields });
  }

  return { headers: headerRow, rows };
}

/**
 * Reads Google Sheets intake configuration from environment variables.
 */
export function getGoogleSheetsEnvConfig(): GoogleSheetsClientConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();

  if (!spreadsheetId || !serviceAccountJson) {
    return null;
  }

  return { spreadsheetId, serviceAccountJson };
}
