import { prisma } from './config/db';
import bcrypt from 'bcryptjs';
import { hashPin } from './utils/pinHash';
import { archiveYearStart } from './utils/archiveCsvImporter';
import { reseedFromArchive } from './reseedFromArchive';

/**
 * Seeds drivers, dispatchers, route rates, and YTD archive completed deliveries.
 */
async function main() {
  console.log('[Seed] Seeding default testing accounts...');

  const d1 = await prisma.driver.upsert({
    where: { id: 'drv-01' },
    update: {
      firstName: 'Shawn',
      lastName: 'McKenzie',
      pinHash: hashPin('1111'),
      isActive: true,
    },
    create: {
      id: 'drv-01',
      firstName: 'Shawn',
      lastName: 'McKenzie',
      pinHash: hashPin('1111'),
      isActive: true,
    },
  });
  console.log(`[Seed] Driver 1 upserted: ${d1.firstName} ${d1.lastName} (${d1.id})`);

  const d2 = await prisma.driver.upsert({
    where: { id: 'drv-02' },
    update: {
      firstName: 'Driver',
      lastName: 'Two',
      pinHash: hashPin('2222'),
      isActive: true,
    },
    create: {
      id: 'drv-02',
      firstName: 'Driver',
      lastName: 'Two',
      pinHash: hashPin('2222'),
      isActive: true,
    },
  });
  console.log(`[Seed] Driver 2 upserted: ${d2.firstName} ${d2.lastName} (${d2.id})`);

  const d3 = await prisma.driver.upsert({
    where: { id: 'drv-03' },
    update: {
      firstName: 'Sarah',
      lastName: 'Connor',
      pinHash: hashPin('3333'),
      isActive: true,
    },
    create: {
      id: 'drv-03',
      firstName: 'Sarah',
      lastName: 'Connor',
      pinHash: hashPin('3333'),
      isActive: true,
    },
  });
  console.log(`[Seed] Driver 3 upserted: ${d3.firstName} ${d3.lastName} (${d3.id})`);

  const d4 = await prisma.driver.upsert({
    where: { id: 'drv-04' },
    update: {
      firstName: 'Alex',
      lastName: 'Mercer',
      pinHash: hashPin('4444'),
      isActive: true,
    },
    create: {
      id: 'drv-04',
      firstName: 'Alex',
      lastName: 'Mercer',
      pinHash: hashPin('4444'),
      isActive: true,
    },
  });
  console.log(`[Seed] Driver 4 upserted: ${d4.firstName} ${d4.lastName} (${d4.id})`);

  const dispatcherPassword = 'password123';
  const passwordHash = await bcrypt.hash(dispatcherPassword, 10);

  const dispatcher = await prisma.dispatcher.upsert({
    where: { email: 'dispatcher@example.com' },
    update: {
      passwordHash,
      firstName: 'System',
      lastName: 'Dispatcher',
      isActive: true,
    },
    create: {
      email: 'dispatcher@example.com',
      passwordHash,
      firstName: 'System',
      lastName: 'Dispatcher',
      isActive: true,
    },
  });
  console.log(`[Seed] Dispatcher upserted: ${dispatcher.email} (${dispatcher.id})`);

  const routeRates = [
    { id: '00000000-0000-0000-0000-000000000001', origin: 'Sudbury', destination: 'Lively', flatRate: 60.0 },
    { id: '00000000-0000-0000-0000-000000000002', origin: 'Sudbury', destination: 'Chelmsford/Hanmer', flatRate: 50.0 },
    { id: '00000000-0000-0000-0000-000000000003', origin: 'Sudbury', destination: 'Val Caron/Azilda', flatRate: 40.0 },
    { id: '00000000-0000-0000-0000-000000000004', origin: 'Sudbury', destination: 'Redpath ODP', flatRate: 125.0 },
    { id: '00000000-0000-0000-0000-000000000005', origin: 'Sudbury', destination: 'Victoria Mine', flatRate: 120.0 },
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

  await reseedFromArchive(prisma, {
    since: archiveYearStart(2026),
    clearExisting: true,
    writeTopPickups: true,
  });

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
