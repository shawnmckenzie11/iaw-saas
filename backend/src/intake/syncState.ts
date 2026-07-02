import { prisma } from '../config/db';

/**
 * Returns the stored poll cursor for an intake adapter, or null when uninitialized.
 */
export async function getIntakeCursor(adapterName: string, cursorKey: string): Promise<number | null> {
  const state = await prisma.intakeSyncState.findUnique({
    where: { adapterName_cursorKey: { adapterName, cursorKey } },
    select: { lastCursor: true },
  });
  return state?.lastCursor ?? null;
}

/**
 * Persists the poll cursor after a successful intake sync pass.
 */
export async function setIntakeCursor(
  adapterName: string,
  cursorKey: string,
  lastCursor: number
): Promise<void> {
  await prisma.intakeSyncState.upsert({
    where: { adapterName_cursorKey: { adapterName, cursorKey } },
    create: { adapterName, cursorKey, lastCursor },
    update: { lastCursor },
  });
}

/**
 * Initializes the cursor to skip existing external rows on first deploy.
 */
export async function ensureIntakeCursorInitialized(
  adapterName: string,
  cursorKey: string,
  currentMaxRow: number
): Promise<number> {
  const existing = await getIntakeCursor(adapterName, cursorKey);
  if (existing !== null) return existing;

  await setIntakeCursor(adapterName, cursorKey, currentMaxRow);
  console.log(
    `[Intake:${adapterName}] Initialized cursor to row ${currentMaxRow} (existing rows skipped)`
  );
  return currentMaxRow;
}
