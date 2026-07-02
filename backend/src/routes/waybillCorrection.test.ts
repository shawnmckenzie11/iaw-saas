import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../config/db';

describe('Waybill dispatcher correction and void', () => {
  let dispatcherToken: string;
  const waybillNumber = 'TEST-VOID-EDIT-001';
  const clientSideUuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeAll(async () => {
    await prisma.deliveryRecord.deleteMany({ where: { waybillNumber } });
    await prisma.waybillEvent.deleteMany({ where: { waybillNumber } });
    await prisma.dispatcher.deleteMany({
      where: { email: 'waybill-edit-dispatcher@example.com' },
    });

    const passwordHash = await bcrypt.hash('waybill-edit-test-password', 10);
    await prisma.dispatcher.create({
      data: {
        email: 'waybill-edit-dispatcher@example.com',
        passwordHash,
        firstName: 'Edit',
        lastName: 'Tester',
        isActive: true,
      },
    });

    const dispatcherRes = await request(app)
      .post('/api/auth/dispatcher/login')
      .send({ email: 'waybill-edit-dispatcher@example.com', password: 'waybill-edit-test-password' });
    dispatcherToken = dispatcherRes.body.token;

    await request(app)
      .post('/api/waybills')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        clientSideUuid,
        waybillNumber,
        pickupLocationName: 'Synthetic Origin',
        pickupAddress: '100 Test St',
        dropoffDestinationName: 'Synthetic Destination',
        dropoffAddress: '200 Test Ave',
        parcelDescription: 'Test parcel',
        parcelQuantity: 1,
        priority: 'REGULAR',
        vehicleType: 'CAR',
      });

    await request(app)
      .post(`/api/waybills/${waybillNumber}/events`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        eventType: 'DISPATCHER_OVERRIDE',
        data: { status: 'DELIVERED', pricingTotalCost: 0 },
      });
  });

  afterAll(async () => {
    await prisma.deliveryRecord.deleteMany({ where: { waybillNumber } });
    await prisma.waybillEvent.deleteMany({ where: { waybillNumber } });
    await prisma.dispatcher.deleteMany({
      where: { email: 'waybill-edit-dispatcher@example.com' },
    });
    await prisma.$disconnect();
  });

  it('applies DISPATCHER_CORRECTION field updates on delivered waybills', async () => {
    const res = await request(app)
      .post(`/api/waybills/${waybillNumber}/events`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        eventType: 'DISPATCHER_CORRECTION',
        data: {
          pickupLocationName: 'Updated Origin',
          dropoffDestinationName: 'Updated Destination',
          parcelDescription: 'Updated cargo',
          pricingTotalCost: 88.5,
        },
      });

    expect(res.status).toBe(201);

    const verify = await request(app)
      .get(`/api/waybills/${waybillNumber}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(verify.body.pickupLocationName).toBe('Updated Origin');
    expect(verify.body.dropoffDestinationName).toBe('Updated Destination');
    expect(verify.body.parcelDescription).toBe('Updated cargo');
    expect(verify.body.pricingTotalCost).toBe(88.5);
  });

  it('voids a delivered waybill via WAYBILL_VOIDED', async () => {
    const res = await request(app)
      .post(`/api/waybills/${waybillNumber}/events`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        eventType: 'WAYBILL_VOIDED',
        data: {},
      });

    expect(res.status).toBe(201);

    const list = await request(app)
      .get('/api/waybills')
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(list.body.some((row: { waybillNumber: string }) => row.waybillNumber === waybillNumber)).toBe(
      false
    );
  });
});
