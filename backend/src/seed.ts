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

  const defaultPayRates: Record<string, number> = {
    'drv-01': 22.5,
    'drv-02': 21.0,
    'drv-03': 21.5,
    'drv-04': 20.75,
  };

  const drivers = await prisma.driver.findMany({ where: { isActive: true } });
  for (const driver of drivers) {
    const email = `${driver.firstName.toLowerCase()}.${driver.lastName.toLowerCase().replace(/\s+/g, '')}@example.com`;
    const payRate = defaultPayRates[driver.id] ?? 20.0;
    const existing = await prisma.employee.findFirst({
      where: { driverId: driver.id },
    });
    if (existing) {
      await prisma.employee.update({
        where: { id: existing.id },
        data: {
          firstName: driver.firstName,
          lastName: driver.lastName,
          email: existing.email ?? email,
          role: 'DRIVER',
          isActive: true,
          payRate,
        },
      });
    } else {
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
  console.log(`[Seed] Payroll employees upserted for ${drivers.length} driver(s)`);

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

  if (process.env.SEED_ARCHIVE_RESEED === 'true') {
    await reseedFromArchive(prisma, {
      since: archiveYearStart(2026),
      clearExisting: true,
      writeTopPickups: true,
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
