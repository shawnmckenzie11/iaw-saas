import request from 'supertest';
import app from '../app';
import { prisma } from '../config/db';
import { loadTestCredentials } from '../seedConfig';

describe('M2 Dual Auth & RBAC Boundaries Integration Tests', () => {
  let dispatcherToken: string;
  let driver1Token: string;
  let driver2Token: string;
  const credentials = loadTestCredentials();

  beforeAll(async () => {
    // Ensure test records are clean
    await prisma.deliveryRecord.deleteMany({
      where: {
        OR: [
          { waybillNumber: { in: ['W-TEST-01', 'W-TEST-02', 'W-TEST-UNASSIGNED'] } },
          { clientSideUuid: { in: ['11111111-1111-1111-1111-fffffffffaaa', '22222222-2222-2222-2222-fffffffffbbb', '33333333-3333-3333-3333-fffffffffccc'] } }
        ]
      },
    });

    // Create test waybills for RBAC tests
    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: '11111111-1111-1111-1111-fffffffffaaa',
        waybillNumber: 'W-TEST-01',
        pickupLocationName: 'Sudbury Depot',
        pickupAddress: 'Sudbury Depot',
        dropoffDestinationName: 'Lively Hub',
        dropoffAddress: 'Lively Hub',
        parcelDescription: 'Test Box 1',
        driverId: 'drv-01',
        capturedAt: new Date(),
        status: 'DRAFT',
      },
    });

    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: '22222222-2222-2222-2222-fffffffffbbb',
        waybillNumber: 'W-TEST-02',
        pickupLocationName: 'Sudbury Depot',
        pickupAddress: 'Sudbury Depot',
        dropoffDestinationName: 'Hanmer Site',
        dropoffAddress: 'Hanmer Site',
        parcelDescription: 'Test Box 2',
        driverId: 'drv-02',
        capturedAt: new Date(),
        status: 'DRAFT',
      },
    });

    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid: '33333333-3333-3333-3333-fffffffffccc',
        waybillNumber: 'W-TEST-UNASSIGNED',
        pickupLocationName: 'Sudbury Depot',
        pickupAddress: 'Sudbury Depot',
        dropoffDestinationName: 'Azilda Office',
        dropoffAddress: 'Azilda Office',
        parcelDescription: 'Test Box 3',
        driverId: null,
        capturedAt: new Date(),
        status: 'DRAFT',
      },
    });
  });

  afterAll(async () => {
    // Clean up test records
    await prisma.deliveryRecord.deleteMany({
      where: {
        OR: [
          { waybillNumber: { in: ['W-TEST-01', 'W-TEST-02', 'W-TEST-UNASSIGNED'] } },
          { clientSideUuid: { in: ['11111111-1111-1111-1111-fffffffffaaa', '22222222-2222-2222-2222-fffffffffbbb', '33333333-3333-3333-3333-fffffffffccc'] } }
        ]
      },
    });
    await prisma.$disconnect();
  });

  describe('Dispatcher Authentication', () => {
    const dispatcherLogin = {
      email: credentials.dispatcherEmail,
      password: credentials.dispatcherPassword,
    };

    it('should authenticate dispatcher on main route /dispatcher/login', async () => {
      const res = await request(app)
        .post('/api/auth/dispatcher/login')
        .send(dispatcherLogin);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      dispatcherToken = res.body.token;
    });

    it('should authenticate dispatcher on alias route /login/dispatcher', async () => {
      const res = await request(app)
        .post('/api/auth/login/dispatcher')
        .send(dispatcherLogin);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
    });

    it('should deny dispatcher login with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: credentials.dispatcherEmail, password: 'wrong' });
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should deny dispatcher login with malformed email', async () => {
      const res = await request(app)
        .post('/api/auth/dispatcher/login')
        .send({ email: 'notanemail', password: credentials.dispatcherPassword });
      expect(res.status).toBe(400);
    });
  });

  describe('Driver PIN Authentication', () => {
    it('should authenticate Driver 1 with seeded PIN on /driver/login', async () => {
      const res = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: credentials.driver1Pin });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      driver1Token = res.body.token;
    });

    it('should authenticate Driver 2 with seeded PIN on alias /login/driver', async () => {
      const res = await request(app)
        .post('/api/auth/login/driver')
        .send({ pin: credentials.driver2Pin });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      driver2Token = res.body.token;
    });

    it('should deny driver login with invalid PIN', async () => {
      const res = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: '9999' });
      expect(res.status).toBe(401);
    });

    it('should return 400 for non-numeric PIN', async () => {
      const res = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: 'abcd' });
      expect(res.status).toBe(400);
    });

    it('should return 400 for PIN with incorrect length', async () => {
      const res = await request(app)
        .post('/api/auth/driver/login')
        .send({ pin: '123' });
      expect(res.status).toBe(400);
    });
  });

  describe('RBAC Scoping Boundaries', () => {
    it('should allow dispatcher global access to all waybills', async () => {
      const w1 = await request(app)
        .get('/api/waybills/W-TEST-01')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(w1.status).toBe(200);

      const w2 = await request(app)
        .get('/api/waybills/W-TEST-02')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(w2.status).toBe(200);

      const wUnassigned = await request(app)
        .get('/api/waybills/W-TEST-UNASSIGNED')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(wUnassigned.status).toBe(200);
    });

    it('should allow driver to access their assigned waybill', async () => {
      const res = await request(app)
        .get('/api/waybills/W-TEST-01')
        .set('Authorization', `Bearer ${driver1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.waybillNumber).toBe('W-TEST-01');
    });

    it('should allow driver to access unassigned waybill', async () => {
      const res = await request(app)
        .get('/api/waybills/W-TEST-UNASSIGNED')
        .set('Authorization', `Bearer ${driver1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.waybillNumber).toBe('W-TEST-UNASSIGNED');
    });

    it('should deny driver access to another driver waybill', async () => {
      const res = await request(app)
        .get('/api/waybills/W-TEST-02')
        .set('Authorization', `Bearer ${driver1Token}`);
      expect(res.status).toBe(403);
    });

    it('should deny driver access to dispatcher-restricted admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/rates')
        .set('Authorization', `Bearer ${driver1Token}`);
      expect(res.status).toBe(403);
    });

    it('should allow dispatcher access to dispatcher-restricted admin routes', async () => {
      const res = await request(app)
        .get('/api/admin/rates')
        .set('Authorization', `Bearer ${dispatcherToken}`);
      expect(res.status).toBe(200);
    });
  });
});
