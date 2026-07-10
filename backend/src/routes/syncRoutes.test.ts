import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../config/db';
import { hashPin } from '../utils/pinHash';
import { computeSignatureHash } from '../utils/signatureHash';
import fs from 'fs';
import path from 'path';

const DRIVER_A = 'sync-rbac-drv-a';
const DRIVER_B = 'sync-rbac-drv-b';
const DISPATCHER_EMAIL = 'sync-rbac-dispatcher@example.com';
const DISPATCHER_PASSWORD = 'sync-rbac-password';

describe('Sync RBAC and signature hashing', () => {
  let driverAToken: string;
  let driverBToken: string;
  let dispatcherToken: string;
  const waybillA = 'SYNC-RBAC-A';
  const waybillB = 'SYNC-RBAC-B';

  beforeAll(async () => {
    await prisma.waybillEvent.deleteMany({
      where: { waybillNumber: { in: [waybillA, waybillB] } },
    });
    await prisma.deliveryRecord.deleteMany({
      where: { waybillNumber: { in: [waybillA, waybillB] } },
    });
    await prisma.driver.deleteMany({ where: { id: { in: [DRIVER_A, DRIVER_B] } } });
    await prisma.dispatcher.deleteMany({ where: { email: DISPATCHER_EMAIL } });

    await prisma.driver.createMany({
      data: [
        {
          id: DRIVER_A,
          firstName: 'Sync',
          lastName: 'Alpha',
          pinHash: hashPin('1111'),
          isActive: true,
        },
        {
          id: DRIVER_B,
          firstName: 'Sync',
          lastName: 'Beta',
          pinHash: hashPin('2222'),
          isActive: true,
        },
      ],
    });

    await prisma.dispatcher.create({
      data: {
        email: DISPATCHER_EMAIL,
        passwordHash: await bcrypt.hash(DISPATCHER_PASSWORD, 10),
        firstName: 'Sync',
        lastName: 'Dispatcher',
        isActive: true,
      },
    });

    const loginA = await request(app).post('/api/auth/driver/login').send({ pin: '1111', driverId: DRIVER_A });
    const loginB = await request(app).post('/api/auth/driver/login').send({ pin: '2222', driverId: DRIVER_B });
    const loginD = await request(app)
      .post('/api/auth/dispatcher/login')
      .send({ email: DISPATCHER_EMAIL, password: DISPATCHER_PASSWORD });

    driverAToken = loginA.body.token;
    driverBToken = loginB.body.token;
    dispatcherToken = loginD.body.token;

    await prisma.deliveryRecord.createMany({
      data: [
        {
          clientSideUuid: '00000000-0000-4000-8000-0000000000aa',
          waybillNumber: waybillA,
          status: 'PICKED_UP',
          syncStatus: 'SYNCED',
          driverId: DRIVER_A,
          vehicleType: 'CAR',
          parcelDescription: 'Package A',
          parcelQuantity: 1,
          pickupLocationName: 'Pickup A',
          pickupAddress: 'Addr A',
          dropoffDestinationName: 'Drop A',
          dropoffAddress: 'Drop Addr A',
          priority: 'REGULAR',
          capturedAt: new Date(),
          signatureName: 'Receiver A',
          deliveredAt: new Date('2026-07-02T15:00:00.000Z'),
        },
        {
          clientSideUuid: '00000000-0000-4000-8000-0000000000bb',
          waybillNumber: waybillB,
          status: 'PICKED_UP',
          syncStatus: 'SYNCED',
          driverId: DRIVER_B,
          vehicleType: 'CAR',
          parcelDescription: 'Package B',
          parcelQuantity: 1,
          pickupLocationName: 'Pickup B',
          pickupAddress: 'Addr B',
          dropoffDestinationName: 'Drop B',
          dropoffAddress: 'Drop Addr B',
          priority: 'REGULAR',
          capturedAt: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.waybillEvent.deleteMany({
      where: { waybillNumber: { in: [waybillA, waybillB] } },
    });
    await prisma.deliveryRecord.deleteMany({
      where: { waybillNumber: { in: [waybillA, waybillB] } },
    });
    await prisma.driver.deleteMany({ where: { id: { in: [DRIVER_A, DRIVER_B] } } });
    await prisma.dispatcher.deleteMany({ where: { email: DISPATCHER_EMAIL } });
  });

  it('rejects driver sync events for another driver waybill', async () => {
    const res = await request(app)
      .post('/api/sync/events')
      .set('Authorization', `Bearer ${driverAToken}`)
      .send({
        events: [
          {
            id: 'evt-forbidden-sync',
            clientSideUuid: '00000000-0000-4000-8000-0000000000bb',
            waybillNumber: waybillB,
            eventType: 'WAYBILL_DELIVERED',
            data: { deliveredAt: new Date().toISOString() },
          },
        ],
      });

    expect(res.status).toBe(403);
  });

  it('rejects driver blob upload for another driver waybill', async () => {
    const res = await request(app)
      .post('/api/sync/blobs')
      .set('Authorization', `Bearer ${driverAToken}`)
      .field('waybillNumber', waybillB)
      .field('fileType', 'signature')
      .attach('blob', Buffer.from('fake-signature'), 'signature.png');

    expect(res.status).toBe(403);
  });

  it('stores signature image URL and hash covering image bytes + metadata', async () => {
    const imageBytes = Buffer.from('real-signature-png-bytes');
    const res = await request(app)
      .post('/api/sync/blobs')
      .set('Authorization', `Bearer ${driverAToken}`)
      .field('waybillNumber', waybillA)
      .field('fileType', 'signature')
      .attach('blob', imageBytes, 'signature.png');

    expect(res.status).toBe(201);
    expect(res.body.fileUri).toMatch(/^\/uploads\//);

    const record = await prisma.deliveryRecord.findUnique({ where: { waybillNumber: waybillA } });
    expect(record?.signatureImageUrl).toBe(res.body.fileUri);
    expect(record?.signatureHash).toBe(
      computeSignatureHash({
        imageBytes,
        clientSideUuid: '00000000-0000-4000-8000-0000000000aa',
        deliveredAt: new Date('2026-07-02T15:00:00.000Z'),
        signatureName: 'Receiver A',
        driverId: DRIVER_A,
      })
    );

    const filename = path.basename(res.body.fileUri as string);
    const filepath = path.join(process.cwd(), 'uploads', filename);
    expect(fs.existsSync(filepath)).toBe(true);

    const unauth = await request(app).get(res.body.fileUri);
    expect(unauth.status).toBe(401);

    const allowed = await request(app)
      .get(res.body.fileUri)
      .set('Authorization', `Bearer ${driverAToken}`);
    expect(allowed.status).toBe(200);

    const denied = await request(app)
      .get(res.body.fileUri)
      .set('Authorization', `Bearer ${driverBToken}`);
    expect(denied.status).toBe(403);

    const dispatcherOk = await request(app)
      .get(res.body.fileUri)
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(dispatcherOk.status).toBe(200);
  });

  it('omits pricing fields from driver waybill list responses', async () => {
    const res = await request(app)
      .get('/api/waybills')
      .set('Authorization', `Bearer ${driverAToken}`);

    expect(res.status).toBe(200);
    const row = res.body.find((wb: { waybillNumber: string }) => wb.waybillNumber === waybillA);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty('calculatedPrice');
    expect(row).not.toHaveProperty('pricingTotalCost');
    expect(row.signatureImageUrl).toBeTruthy();
  });
});
