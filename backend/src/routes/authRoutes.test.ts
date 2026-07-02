import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../config/db';
import { hashPin } from '../utils/pinHash';

describe('Auth & RBAC Integration Tests', () => {
  beforeAll(async () => {
    // Cleanup any potentially left-over test records
    await prisma.waybillEvent.deleteMany({
      where: { waybillNumber: { in: ['TEST-WB-A', 'TEST-WB-B', 'TEST-WB-UNASSIGNED'] } }
    });
    await prisma.deliveryRecord.deleteMany({
      where: {
        OR: [
          { waybillNumber: { in: ['TEST-WB-A', 'TEST-WB-B', 'TEST-WB-UNASSIGNED'] } },
          { clientSideUuid: { in: ['11111111-1111-1111-1111-dddddddddddd', '22222222-2222-2222-2222-eeeeeeeeeeee', '33333333-3333-3333-3333-ffffffffffff'] } }
        ]
      }
    });
    await prisma.driver.deleteMany({
      where: { id: { in: ['test-driver-a', 'test-driver-b'] } }
    });
    await prisma.dispatcher.deleteMany({
      where: { email: 'test-dispatcher@example.com' }
    });

    // Create test drivers
    await prisma.driver.create({
      data: {
        id: 'test-driver-a',
        firstName: 'Test',
        lastName: 'Driver A',
        pinHash: hashPin('7777'),
        isActive: true,
      }
    });

    await prisma.driver.create({
      data: {
        id: 'test-driver-b',
        firstName: 'Test',
        lastName: 'Driver B',
        pinHash: hashPin('8888'),
        isActive: true,
      }
    });

    // Create test dispatcher
    await prisma.dispatcher.create({
      data: {
        email: 'test-dispatcher@example.com',
        passwordHash: await bcrypt.hash('test-password', 10),
        firstName: 'Test',
        lastName: 'Dispatcher',
        isActive: true,
      }
    });

    // Create test waybills
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: '11111111-1111-1111-1111-dddddddddddd',
        waybillNumber: 'TEST-WB-A',
        driverId: 'test-driver-a',
        pickupLocationName: 'Pickup A',
        pickupAddress: 'Pickup Address A',
        dropoffDestinationName: 'Dropoff A',
        dropoffAddress: 'Dropoff Address A',
        parcelDescription: 'Parcel A',
        capturedAt: new Date(),
      }
    });

    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: '22222222-2222-2222-2222-eeeeeeeeeeee',
        waybillNumber: 'TEST-WB-B',
        driverId: 'test-driver-b',
        pickupLocationName: 'Pickup B',
        pickupAddress: 'Pickup Address B',
        dropoffDestinationName: 'Dropoff B',
        dropoffAddress: 'Dropoff Address B',
        parcelDescription: 'Parcel B',
        capturedAt: new Date(),
      }
    });

    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: '33333333-3333-3333-3333-ffffffffffff',
        waybillNumber: 'TEST-WB-UNASSIGNED',
        driverId: null,
        pickupLocationName: 'Pickup Unassigned',
        pickupAddress: 'Pickup Address Unassigned',
        dropoffDestinationName: 'Dropoff Unassigned',
        dropoffAddress: 'Dropoff Address Unassigned',
        parcelDescription: 'Parcel Unassigned',
        capturedAt: new Date(),
      }
    });
  });

  afterAll(async () => {
    // Clean up all test records
    await prisma.waybillEvent.deleteMany({
      where: { waybillNumber: { in: ['TEST-WB-A', 'TEST-WB-B', 'TEST-WB-UNASSIGNED'] } }
    });
    await prisma.deliveryRecord.deleteMany({
      where: {
        OR: [
          { waybillNumber: { in: ['TEST-WB-A', 'TEST-WB-B', 'TEST-WB-UNASSIGNED'] } },
          { clientSideUuid: { in: ['11111111-1111-1111-1111-dddddddddddd', '22222222-2222-2222-2222-eeeeeeeeeeee', '33333333-3333-3333-3333-ffffffffffff'] } }
        ]
      }
    });
    await prisma.driver.deleteMany({
      where: { id: { in: ['test-driver-a', 'test-driver-b'] } }
    });
    await prisma.dispatcher.deleteMany({
      where: { email: 'test-dispatcher@example.com' }
    });

    await prisma.$disconnect();
  });

  describe('Driver Login Endpoints & Formats', () => {
    it('should successfully log in via /api/auth/driver/login with valid PIN', async () => {
      const res = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: '7777' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should successfully log in via alias /api/auth/login/driver with valid PIN', async () => {
      const res = await request(app)
        .post('/api/auth/login/driver')
        .send({ pin: '8888' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should return 400 Bad Request for invalid PIN formats', async () => {
      const invalidPINs = ['12', '12345', 'abcd', ''];
      for (const pin of invalidPINs) {
        const res = await request(app)
          .post('/api/auth/driver/login')
          .send({ pin });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
      }
    });

    it('should return 401 Unauthorized for unregistered/incorrect PINs', async () => {
      const res = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: '9999' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('Dispatcher Login Endpoints', () => {
    it('should successfully log in via /api/auth/dispatcher/login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: 'test-dispatcher@example.com', password: 'test-password' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should successfully log in via alias /api/auth/login/dispatcher with valid credentials', async () => {
      const dbDispatcherBefore = await prisma.dispatcher.findUnique({ where: { email: 'test-dispatcher@example.com' } });
      console.log('DEBUG [before alias test]: dispatcher in DB:', dbDispatcherBefore);
      const res = await request(app)
        .post('/api/auth/login/dispatcher')
        .send({ email: 'test-dispatcher@example.com', password: 'test-password' });

      console.log('DEBUG [alias test]: res.status:', res.status, 'res.body:', res.body);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should return 401 Unauthorized for incorrect dispatcher credentials', async () => {
      const res = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: 'test-dispatcher@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should return 400 Bad Request for malformed email or missing fields', async () => {
      const res1 = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: 'invalid-email', password: 'test-password' });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: 'test-dispatcher@example.com' });
      expect(res2.status).toBe(400);
    });
  });

  describe('RBAC Boundary Checks', () => {
    let driverAToken: string;
    let driverBToken: string;
    let dispatcherToken: string;

    beforeAll(async () => {
      // Authenticate and retrieve tokens
      const resDriverA = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: '7777' });
      console.log('DEBUG [beforeAll Driver A]: status:', resDriverA.status, 'body:', resDriverA.body);
      driverAToken = resDriverA.body.token;

      const resDriverB = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: '8888' });
      console.log('DEBUG [beforeAll Driver B]: status:', resDriverB.status, 'body:', resDriverB.body);
      driverBToken = resDriverB.body.token;

      const resDispatcher = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: 'test-dispatcher@example.com', password: 'test-password' });
      console.log('DEBUG [beforeAll Dispatcher]: status:', resDispatcher.status, 'body:', resDispatcher.body);
      dispatcherToken = resDispatcher.body.token;
    });

    it('allows Driver A to access own waybills and unassigned waybills', async () => {
      // Driver A accesses waybill TEST-WB-A
      const resOwn = await request(app)
        .get('/api/waybills/TEST-WB-A')
        .set('Authorization', `Bearer ${driverAToken}`);
      expect(resOwn.status).toBe(200);
      expect(resOwn.body).toHaveProperty('waybillNumber', 'TEST-WB-A');

      // Driver A accesses unassigned waybill
      const resUnassigned = await request(app)
        .get('/api/waybills/TEST-WB-UNASSIGNED')
        .set('Authorization', `Bearer ${driverAToken}`);
      expect(resUnassigned.status).toBe(200);
      expect(resUnassigned.body).toHaveProperty('waybillNumber', 'TEST-WB-UNASSIGNED');
    });

    it('forbids Driver A from accessing Driver B waybills (returns 403)', async () => {
      const resForbidden = await request(app)
        .get('/api/waybills/TEST-WB-B')
        .set('Authorization', `Bearer ${driverAToken}`);
      expect(resForbidden.status).toBe(403);
      expect(resForbidden.body).toHaveProperty('error', 'Forbidden');
    });

    it('filters list of waybills for drivers to only include assigned and unassigned waybills', async () => {
      const resList = await request(app)
        .get('/api/waybills')
        .set('Authorization', `Bearer ${driverAToken}`);
      expect(resList.status).toBe(200);
      expect(Array.isArray(resList.body)).toBe(true);

      const waybillNumbers = resList.body.map((wb: any) => wb.waybillNumber);
      // Driver A list should include TEST-WB-A and TEST-WB-UNASSIGNED, but NOT TEST-WB-B
      expect(waybillNumbers).toContain('TEST-WB-A');
      expect(waybillNumbers).toContain('TEST-WB-UNASSIGNED');
      expect(waybillNumbers).not.toContain('TEST-WB-B');
    });

    it('allows dispatchers to access all waybills globally', async () => {
      const resList = await request(app)
        .get('/api/waybills')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(resList.status).toBe(200);
      expect(Array.isArray(resList.body)).toBe(true);

      const waybillNumbers = resList.body.map((wb: any) => wb.waybillNumber);
      expect(waybillNumbers).toContain('TEST-WB-A');
      expect(waybillNumbers).toContain('TEST-WB-B');
      expect(waybillNumbers).toContain('TEST-WB-UNASSIGNED');
    });

    it('forbids drivers from accessing admin rates routes (returns 403)', async () => {
      const resAdmin = await request(app)
        .get('/api/admin/rates')
        .set('Authorization', `Bearer ${driverAToken}`);
      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body).toHaveProperty('error', 'Forbidden');
    });

    it('allows dispatchers to access admin rates routes', async () => {
      const resAdmin = await request(app)
        .get('/api/admin/rates')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(resAdmin.status).toBe(200);
      expect(Array.isArray(resAdmin.body)).toBe(true);
    });
  });
});
