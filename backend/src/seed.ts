import { prisma } from './config/db';
import bcrypt from 'bcryptjs';
import { hashPin } from './utils/pinHash';

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

  // Seed route rates for admin endpoint
  await prisma.routeRate.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      origin: 'Sudbury',
      destination: 'Lively',
      flatRate: 60.0,
    },
  });

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
  ];

  for (const wb of waybills) {
    await prisma.deliveryRecord.upsert({
      where: { waybillNumber: wb.waybillNumber },
      update: {
        driverId: wb.driverId,
        status: wb.status,
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

  console.log('[Seed] Test waybills W-001, W-002, W-003 upserted.');
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
