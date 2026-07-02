import { prisma } from './config/db';
import bcrypt from 'bcryptjs';
import { hashPin } from './utils/pinHash';
import {
  generateTopPickupsArtifact,
  getLastArchiveRows,
  readArchiveCsv,
  statusForArchiveIndex,
} from './utils/archiveCsvImporter';
import { randomUUID } from 'crypto';

const DRIVER_IDS = ['drv-01', 'drv-02', 'drv-03', 'drv-04'];

/**
 * Seeds historical archive deliveries from CSV for baseline dashboard testing.
 */
async function seedArchiveDeliveries(): Promise<number> {
  const rows = readArchiveCsv();
  if (rows.length === 0) {
    console.log('[Seed] No archive CSV rows to import.');
    return 0;
  }

  const stats = generateTopPickupsArtifact();
  console.log(`[Seed] Top pickups (${stats.windowDays}d): ${stats.topPickups.join(', ')}`);

  const batch = getLastArchiveRows(rows, 100);
  let imported = 0;

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i];
    const waybillNumber = `HIST-${String(i + 1).padStart(3, '0')}`;
    const status = statusForArchiveIndex(i);
    const driverId = status === 'DRAFT' ? null : DRIVER_IDS[i % DRIVER_IDS.length];
    const clientSideUuid = randomUUID();
    const capturedAt = row.timestamp;

    await prisma.deliveryRecord.upsert({
      where: { waybillNumber },
      update: {
        status,
        driverId,
        pricingTotalCost: row.calculatedPrice,
        pricingBaseRate: row.calculatedPrice,
      },
      create: {
        clientSideUuid,
        waybillNumber,
        status,
        syncStatus: 'SYNCED',
        driverId,
        vehicleType: row.vehicleType,
        parcelDescription: row.parcelDescription,
        parcelWeightClass: row.parcelWeightClass,
        pickupLocationName: row.pickupLocationName,
        pickupAddress: row.pickupAddress,
        pickupContactName: row.contactName || null,
        pickupContactPhone: row.contactPhone || null,
        dropoffDestinationName: row.dropoffDestinationName,
        dropoffAddress: row.dropoffAddress,
        dropoffContactName: row.contactName || null,
        dropoffContactPhone: row.contactPhone || null,
        priority: row.priority,
        additionalComments: row.additionalComments || null,
        capturedAt,
        createdAt: capturedAt,
        deliveredAt: status === 'DELIVERED' ? capturedAt : null,
        pricingTotalCost: row.calculatedPrice,
        pricingBaseRate: row.calculatedPrice,
        pricingIsManuallyAdjusted: row.calculatedPrice <= 0,
      },
    });

    const existingEvent = await prisma.waybillEvent.findFirst({
      where: { waybillNumber, sequenceNumber: 1 },
    });

    if (!existingEvent) {
      let seq = 1;
      await prisma.waybillEvent.create({
        data: {
          clientSideUuid,
          waybillNumber,
          sequenceNumber: seq++,
          eventType: 'WAYBILL_CREATED',
          data: { waybillNumber, priceCategory: row.priceCategory },
          timestamp: capturedAt,
        },
      });

      if (driverId) {
        await prisma.waybillEvent.create({
          data: {
            clientSideUuid,
            waybillNumber,
            sequenceNumber: seq++,
            eventType: 'WAYBILL_ASSIGNED',
            data: { driverId },
            timestamp: capturedAt,
          },
        });
      }

      if (status === 'PICKED_UP' || status === 'DELIVERED') {
        await prisma.waybillEvent.create({
          data: {
            clientSideUuid,
            waybillNumber,
            sequenceNumber: seq++,
            eventType: 'WAYBILL_PICKED_UP',
            data: { pickedUpAt: capturedAt.toISOString() },
            timestamp: capturedAt,
          },
        });
      }

      if (status === 'DELIVERED') {
        await prisma.waybillEvent.create({
          data: {
            clientSideUuid,
            waybillNumber,
            sequenceNumber: seq++,
            eventType: 'WAYBILL_DELIVERED',
            data: { deliveredAt: capturedAt.toISOString() },
            timestamp: capturedAt,
          },
        });
      }
    }

    imported++;
  }

  console.log(`[Seed] Archive deliveries upserted: ${imported} (HIST-001..HIST-${String(imported).padStart(3, '0')})`);
  return imported;
}

/**
 * Seeds drivers, dispatchers, route rates, and test waybills for development and E2E tests.
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

  // Seed route rates for admin endpoint and dispatcher pricing reference
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

  const now = new Date();
  const waybills = [
    {
      waybillNumber: 'W-001',
      clientSideUuid: '11111111-1111-1111-1111-111111111101',
      driverId: 'drv-01',
      status: 'PICKED_UP' as const,
      pickupLocationName: 'Wajax',
      pickupAddress: 'Sudbury, ON',
      dropoffDestinationName: 'Redpath Mine',
      dropoffAddress: 'Onaping, ON',
      parcelDescription: 'Drill Bits',
      additionalComments: '__podRequired',
    },
    {
      waybillNumber: 'W-002',
      clientSideUuid: '22222222-2222-2222-2222-222222222202',
      driverId: null,
      status: 'DRAFT' as const,
      pickupLocationName: 'Komatsu',
      pickupAddress: 'Sudbury, ON',
      dropoffDestinationName: 'Victoria Mine',
      dropoffAddress: 'Sudbury, ON',
      parcelDescription: 'Hydraulic Parts',
    },
    {
      waybillNumber: 'W-003',
      clientSideUuid: '33333333-3333-3333-3333-333333333303',
      driverId: 'drv-02',
      status: 'DRAFT' as const,
      pickupLocationName: 'Sling Choker',
      pickupAddress: 'Sudbury, ON',
      dropoffDestinationName: 'Creighton Mine',
      dropoffAddress: 'Sudbury, ON',
      parcelDescription: 'Cables',
    },
    {
      waybillNumber: 'W-004',
      clientSideUuid: '44444444-4444-4444-4444-444444444404',
      driverId: 'drv-03',
      status: 'DRAFT' as const,
      pickupLocationName: 'Mobile Parts Inc.',
      pickupAddress: 'Sudbury, ON',
      dropoffDestinationName: 'Epiroc Lively',
      dropoffAddress: 'Lively, ON',
      parcelDescription: 'Filters',
    },
    {
      waybillNumber: 'W-005',
      clientSideUuid: '55555555-5555-5555-5555-555555555505',
      driverId: 'drv-04',
      status: 'PICKED_UP' as const,
      pickupLocationName: 'Sandvik Mining',
      pickupAddress: 'Sudbury, ON',
      dropoffDestinationName: 'Redpath Mine',
      dropoffAddress: 'Onaping, ON',
      parcelDescription: 'Safety Gear',
    },
  ];

  for (const wb of waybills) {
    await prisma.deliveryRecord.upsert({
      where: { waybillNumber: wb.waybillNumber },
      update: {
        driverId: wb.driverId,
        status: wb.status,
        additionalComments: 'additionalComments' in wb ? wb.additionalComments : undefined,
      },
      create: {
        clientSideUuid: wb.clientSideUuid,
        waybillNumber: wb.waybillNumber,
        status: wb.status,
        driverId: wb.driverId,
        pickupLocationName: wb.pickupLocationName,
        pickupAddress: wb.pickupAddress,
        dropoffDestinationName: wb.dropoffDestinationName,
        dropoffAddress: wb.dropoffAddress,
        parcelDescription: wb.parcelDescription,
        additionalComments: 'additionalComments' in wb ? wb.additionalComments : undefined,
        capturedAt: now,
      },
    });

    const existingEvent = await prisma.waybillEvent.findFirst({
      where: { waybillNumber: wb.waybillNumber, sequenceNumber: 1 },
    });

    if (!existingEvent) {
      await prisma.waybillEvent.create({
        data: {
          clientSideUuid: wb.clientSideUuid,
          waybillNumber: wb.waybillNumber,
          sequenceNumber: 1,
          eventType: 'WAYBILL_CREATED',
          data: { waybillNumber: wb.waybillNumber },
          timestamp: now,
        },
      });

      if (wb.driverId) {
        await prisma.waybillEvent.create({
          data: {
            clientSideUuid: wb.clientSideUuid,
            waybillNumber: wb.waybillNumber,
            sequenceNumber: 2,
            eventType: 'WAYBILL_ASSIGNED',
            data: { driverId: wb.driverId },
            timestamp: now,
          },
        });
      }

      if (wb.status === 'PICKED_UP') {
        await prisma.waybillEvent.create({
          data: {
            clientSideUuid: wb.clientSideUuid,
            waybillNumber: wb.waybillNumber,
            sequenceNumber: wb.driverId ? 3 : 2,
            eventType: 'WAYBILL_PICKED_UP',
            data: { pickedUpAt: now.toISOString() },
            timestamp: now,
          },
        });
      }
    }
  }

  console.log('[Seed] Test waybills W-001..W-005 upserted.');
  await seedArchiveDeliveries();
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
