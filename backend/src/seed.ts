import { prisma } from './config/db';
import bcrypt from 'bcryptjs';
import { hashPin } from './utils/pinHash';
import {
  archiveYearStart,
  generateTopPickupsArtifact,
  readArchiveCsv,
  resolveArchiveCsvPath,
} from './utils/archiveCsvImporter';
import { reseedFromArchive } from './reseedFromArchive';
import { loadSeedConfig } from './seedConfig';
import { generateSuggestionsArtifact } from './utils/suggestionsGenerator';

/**
 * Seeds drivers, dispatchers, route rates, and optional YTD archive completed deliveries.
 */
async function main() {
  const { dispatcherEmail, dispatcherPassword, additionalDispatchers, drivers } = loadSeedConfig();
  console.log('[Seed] Seeding default testing accounts...');

  for (const driver of drivers) {
    const existingEmployee = await prisma.employee.findFirst({
      where: { driverId: driver.id },
    });
    const firstName = existingEmployee?.firstName ?? driver.firstName;
    const lastName = existingEmployee?.lastName ?? driver.lastName;

    const record = await prisma.driver.upsert({
      where: { id: driver.id },
      update: {
        firstName,
        lastName,
        pinHash: hashPin(driver.pin),
        isActive: true,
      },
      create: {
        id: driver.id,
        firstName,
        lastName,
        pinHash: hashPin(driver.pin),
        isActive: true,
      },
    });
    console.log(`[Seed] Driver upserted: ${record.firstName} ${record.lastName} (${record.id})`);
  }

  const defaultPayRates: Record<string, number> = {
    'drv-01': 22.5,
    'drv-02': 21.0,
    'drv-03': 21.5,
    'drv-04': 20.75,
  };

  const activeDrivers = await prisma.driver.findMany({ where: { isActive: true } });
  for (const driver of activeDrivers) {
    const payRate = defaultPayRates[driver.id] ?? 20.0;
    const existing = await prisma.employee.findFirst({
      where: { driverId: driver.id },
    });
    if (existing) {
      await prisma.employee.update({
        where: { id: existing.id },
        data: {
          role: 'DRIVER',
          isActive: true,
          payRate,
        },
      });
    } else {
      const email = `${driver.firstName.toLowerCase()}.${driver.lastName.toLowerCase().replace(/\s+/g, '')}@example.com`;
      await prisma.employee.create({
        data: {
          firstName: driver.firstName,
          lastName: driver.lastName,
          email,
          role: 'DRIVER',
          isActive: true,
          payRate,
          driverId: driver.id,
        },
      });
    }
  }
  console.log(`[Seed] Payroll employees upserted for ${activeDrivers.length} driver(s)`);

  const passwordHash = await bcrypt.hash(dispatcherPassword, 10);
  const dispatcher = await prisma.dispatcher.upsert({
    where: { email: dispatcherEmail },
    update: {
      passwordHash,
      firstName: 'System',
      lastName: 'Dispatcher',
      isActive: true,
    },
    create: {
      email: dispatcherEmail,
      passwordHash,
      firstName: 'System',
      lastName: 'Dispatcher',
      isActive: true,
    },
  });
  console.log(`[Seed] Dispatcher upserted: ${dispatcher.email} (${dispatcher.id})`);

  for (const extra of additionalDispatchers) {
    const extraHash = await bcrypt.hash(extra.password, 10);
    const extraDispatcher = await prisma.dispatcher.upsert({
      where: { email: extra.email },
      update: {
        passwordHash: extraHash,
        firstName: extra.firstName,
        lastName: extra.lastName,
        isActive: true,
      },
      create: {
        email: extra.email,
        passwordHash: extraHash,
        firstName: extra.firstName,
        lastName: extra.lastName,
        isActive: true,
      },
    });
    console.log(`[Seed] Dispatcher upserted: ${extraDispatcher.email} (${extraDispatcher.id})`);
  }

  const routeRates = [
    { id: '00000000-0000-0000-0000-000000000001', origin: 'Sudbury', destination: 'Lively', flatRate: 60.0 },
    { id: '00000000-0000-0000-0000-000000000002', origin: 'Sudbury', destination: 'Chelmsford/Hanmer', flatRate: 50.0 },
    { id: '00000000-0000-0000-0000-000000000003', origin: 'Sudbury', destination: 'Val Caron/Azilda', flatRate: 40.0 },
    { id: '00000000-0000-0000-0000-000000000004', origin: 'Demo City', destination: 'Remote Site A', flatRate: 125.0 },
    { id: '00000000-0000-0000-0000-000000000005', origin: 'Demo City', destination: 'Remote Site B', flatRate: 120.0 },
    { id: '00000000-0000-0000-0000-000000000006', origin: 'Category 5 Node', destination: 'Adjacent Node', flatRate: 30.0 },
    { id: '00000000-0000-0000-0000-000000000007', origin: 'Category 5 Node', destination: 'Opposite Node', flatRate: 35.0 },
  ];

  for (const rate of routeRates) {
    await prisma.routeRate.upsert({
      where: { id: rate.id },
      update: {
        origin: rate.origin,
        destination: rate.destination,
        flatRate: rate.flatRate,
      },
      create: rate,
    });
  }

  const archiveCsvPath = resolveArchiveCsvPath();
  const archiveRows = readArchiveCsv(archiveCsvPath);
  if (archiveRows.length > 0) {
    const stats = generateTopPickupsArtifact(archiveCsvPath);
    console.log(`[Seed] Top pickups (${stats.windowDays}d): ${stats.topPickups.join(', ')}`);

    const suggestions = generateSuggestionsArtifact(archiveCsvPath);
    if (suggestions) {
      console.log(
        `[Seed] Location suggestions: ${suggestions.commonPickups.length} pickups, ${Object.keys(suggestions.conditionalDropoffs).length} conditional routes`
      );
    }
  }

  if (process.env.SEED_ARCHIVE_RESEED === 'true') {
    await reseedFromArchive(prisma, {
      since: archiveYearStart(2026),
      clearExisting: true,
      writeTopPickups: false,
      csvPath: archiveCsvPath,
    });
  } else {
    console.log('[Seed] Skipping archive reseed (set SEED_ARCHIVE_RESEED=true to enable).');
  }

  console.log('[Seed] Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('[Seed] Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
