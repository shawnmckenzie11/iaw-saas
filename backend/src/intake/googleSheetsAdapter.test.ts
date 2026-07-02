import { syncGoogleSheetRows, GOOGLE_SHEETS_ADAPTER_NAME } from '../integrations/googleSheets/googleSheetsAdapter';
import { createDraftWaybillFromRequest } from './intakeService';
import {
  ensureIntakeCursorInitialized,
  getIntakeCursor,
  setIntakeCursor,
} from './syncState';

jest.mock('./intakeService', () => ({
  createDraftWaybillFromRequest: jest.fn(),
}));

jest.mock('./syncState', () => ({
  ensureIntakeCursorInitialized: jest.fn(),
  getIntakeCursor: jest.fn(),
  setIntakeCursor: jest.fn(),
}));

const mockedCreateDraft = createDraftWaybillFromRequest as jest.MockedFunction<
  typeof createDraftWaybillFromRequest
>;
const mockedEnsureCursor = ensureIntakeCursorInitialized as jest.MockedFunction<
  typeof ensureIntakeCursorInitialized
>;
const mockedGetCursor = getIntakeCursor as jest.MockedFunction<typeof getIntakeCursor>;
const mockedSetCursor = setIntakeCursor as jest.MockedFunction<typeof setIntakeCursor>;

describe('syncGoogleSheetRows', () => {
  const spreadsheetId = 'sheet-123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnsureCursor.mockResolvedValue(10);
    mockedGetCursor.mockResolvedValue(10);
    mockedSetCursor.mockResolvedValue(undefined);
  });

  it('imports rows after the cursor and advances it', async () => {
    mockedCreateDraft.mockResolvedValue('created');

    const result = await syncGoogleSheetRows(
      [
        {
          rowIndex: 11,
          fields: [
            '2026-07-02 10:00:00',
            'Brankor',
            'Epiroc',
            'Car',
            '',
            'Regular',
            '',
            '',
            'Parts',
            '',
            '',
          ],
        },
      ],
      spreadsheetId
    );

    expect(result).toEqual({ imported: 1, skipped: 0 });
    expect(mockedCreateDraft).toHaveBeenCalledWith(
      expect.objectContaining({ pickupLocationName: 'Brankor Trophies' }),
      {
        externalSource: GOOGLE_SHEETS_ADAPTER_NAME,
        externalRowId: '11',
        waybillNumber: 'REQ-11',
      }
    );
    expect(mockedSetCursor).toHaveBeenCalledWith(GOOGLE_SHEETS_ADAPTER_NAME, spreadsheetId, 11);
  });

  it('skips duplicate rows on a second poll without re-importing', async () => {
    mockedEnsureCursor.mockResolvedValue(10);
    mockedGetCursor.mockResolvedValue(11);
    mockedCreateDraft.mockResolvedValue('skipped');

    const row = {
      rowIndex: 11,
      fields: [
        '2026-07-02 10:00:00',
        'Brankor',
        'Epiroc',
        'Car',
        '',
        'Regular',
        '',
        '',
        'Parts',
        '',
        '',
      ],
    };

    const first = await syncGoogleSheetRows([row], spreadsheetId);
    expect(first).toEqual({ imported: 0, skipped: 1 });

    mockedEnsureCursor.mockResolvedValue(11);
    mockedGetCursor.mockResolvedValue(11);
    const second = await syncGoogleSheetRows([row], spreadsheetId);
    expect(second).toEqual({ imported: 0, skipped: 0 });
    expect(mockedCreateDraft).toHaveBeenCalledTimes(1);
  });

  it('initializes cursor to max row on first deploy without importing history', async () => {
    mockedEnsureCursor.mockResolvedValue(99);
    mockedGetCursor.mockResolvedValue(99);

    const result = await syncGoogleSheetRows(
      [
        {
          rowIndex: 98,
          fields: ['2026-06-01', 'Brankor', 'Epiroc', 'Car', '', 'Regular', '', '', '', '', ''],
        },
        {
          rowIndex: 99,
          fields: ['2026-06-02', 'Brankor', 'Epiroc', 'Car', '', 'Regular', '', '', '', '', ''],
        },
      ],
      spreadsheetId
    );

    expect(result).toEqual({ imported: 0, skipped: 0 });
    expect(mockedCreateDraft).not.toHaveBeenCalled();
  });
});
