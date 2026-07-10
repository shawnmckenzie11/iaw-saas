import request from 'supertest';

describe('GET /health - Database Downtime Robustness', () => {
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.DATABASE_URL;
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalEnv;
  });

  it('should return 500 and handle the database connectivity failure gracefully', async () => {
    // Reset module registry so prisma and app are re-loaded with the new env
    jest.resetModules();
    
    // Set to a non-existent database/host with a small connection timeout (e.g. 2 seconds)
    process.env.DATABASE_URL = 'postgresql://invalid_user:invalid_password@localhost:54321/non_existent_db?connect_timeout=2';

    const app = require('./app').default;
    const { prisma } = require('./config/db');

    const res = await request(app).get('/health');

    // Confirm that the server did not crash and returned a generic error (no DB detail leak)
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ status: 'ERROR', database: 'DISCONNECTED' });

    await prisma.$disconnect();
  }, 30000); // 30s timeout to allow Prisma connection attempt to fail
});
