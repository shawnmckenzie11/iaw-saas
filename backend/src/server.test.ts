import request from 'supertest';
import app from './app';
import { prisma } from './config/db';

describe('GET /health', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should return 200 OK and connected database status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: 'OK',
      database: 'CONNECTED',
    });
  });
});
