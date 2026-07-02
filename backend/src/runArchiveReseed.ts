import { prisma } from './config/db';
import { archiveYearStart } from './utils/archiveCsvImporter';
import { reseedFromArchive } from './reseedFromArchive';

/**
 * CLI entry: wipe delivery data and import archive CSV rows since Jan 1 as completed.
 */
async function main() {
  const year = process.env.ARCHIVE_SINCE_YEAR
    ? parseInt(process.env.ARCHIVE_SINCE_YEAR, 10)
    : new Date().getFullYear();
  const since = archiveYearStart(year);

  console.log(`[Reseed] Starting archive import since ${since.toISOString().slice(0, 10)}...`);

  await reseedFromArchive(prisma, {
    since,
    clearExisting: true,
    writeTopPickups: true,
  });

  console.log('[Reseed] Done.');
}

main()
  .catch((err) => {
    console.error('[Reseed] Failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
