import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../config/db';
import { loadTestCredentials } from '../seedConfig';

describe('Driver roster API', () => {
  let dispatcherToken: string;
  let driverToken: string;

  beforeAll(async () => {
    await prisma.dispatcher.deleteMany({
      where: { email: 'driver-roster-dispatcher@example.com' },
    });

    const passwordHash = await bcrypt.hash('driver-roster-test-password', 10);
    await prisma.dispatcher.create({
      data: {
        email: 'driver-roster-dispatcher@example.com',
        passwordHash,
        firstName: 'Roster',
        lastName: 'Tester',
        isActive: true,
      },
    });

    const dispatcherRes = await request(app)
      .post('/api/auth/dispatcher/login')
      .send({ email: 'driver-roster-dispatcher@example.com', password: 'driver-roster-test-password' });
    dispatcherToken = dispatcherRes.body.token;

    const testCreds = loadTestCredentials();
    const driverRes = await request(app).post('/api/auth/driver/login').send({ pin: testCreds.driver1Pin });
    driverToken = driverRes.body.token;
  });

  afterAll(async () => {
    await prisma.dispatcher.deleteMany({
      where: { email: 'driver-roster-dispatcher@example.com' },
    });
    await prisma.$disconnect();
  });

  it('denies drivers from the roster route', async () => {
    const res = await request(app)
      .get('/api/admin/drivers')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(403);
  });

  it('lists active drivers for dispatch UI', async () => {
    const res = await request(app)
      .get('/api/admin/drivers')
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toMatchObject({
      id: expect.any(String),
      firstName: expect.any(String),
      lastName: expect.any(String),
      isActive: true,
    });
  });
});
