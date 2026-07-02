import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../config/db';
import { loadTestCredentials } from '../seedConfig';

describe('Payroll Employee API', () => {
  let dispatcherToken: string;
  let driverToken: string;
  let createdEmployeeId: string;

  beforeAll(async () => {
    await prisma.employee.deleteMany({
      where: { email: { in: ['payroll.test@example.com', 'payroll.updated@example.com'] } },
    });
    await prisma.dispatcher.deleteMany({
      where: { email: 'payroll-dispatcher@example.com' },
    });

    const payrollTestPassword = 'payroll-test-password-local-only';
    const passwordHash = await bcrypt.hash(payrollTestPassword, 10);
    await prisma.dispatcher.create({
      data: {
        email: 'payroll-dispatcher@example.com',
        passwordHash,
        firstName: 'Payroll',
        lastName: 'Tester',
        isActive: true,
      },
    });

    const dispatcherRes = await request(app)
      .post('/api/auth/dispatcher/login')
      .send({ email: 'payroll-dispatcher@example.com', password: payrollTestPassword });
    dispatcherToken = dispatcherRes.body.token;

    const testCreds = loadTestCredentials();
    const driverRes = await request(app).post('/api/auth/driver/login').send({ pin: testCreds.driver1Pin });
    driverToken = driverRes.body.token;
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({
      where: { email: { in: ['payroll.test@example.com', 'payroll.updated@example.com'] } },
    });
    await prisma.dispatcher.deleteMany({
      where: { email: 'payroll-dispatcher@example.com' },
    });
    await prisma.$disconnect();
  });

  it('denies drivers from payroll routes', async () => {
    const res = await request(app)
      .get('/api/admin/employees')
      .set('Authorization', `Bearer ${driverToken}`);
    expect(res.status).toBe(403);
  });

  it('creates an employee record', async () => {
    const res = await request(app)
      .post('/api/admin/employees')
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        firstName: 'Synthetic',
        lastName: 'Worker',
        email: 'payroll.test@example.com',
        phone: '705-555-0101',
        role: 'DRIVER',
        active: true,
        payRate: 19.5,
      });

    expect(res.status).toBe(201);
    expect(res.body.firstName).toBe('Synthetic');
    expect(res.body.payRate).toBe(19.5);
    createdEmployeeId = res.body.id;
  });

  it('lists employees including the created record', async () => {
    const res = await request(app)
      .get('/api/admin/employees')
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((row: { id: string }) => row.id === createdEmployeeId)).toBe(true);
  });

  it('updates an employee record', async () => {
    const res = await request(app)
      .put(`/api/admin/employees/${createdEmployeeId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`)
      .send({
        email: 'payroll.updated@example.com',
        payRate: 23.25,
        active: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('payroll.updated@example.com');
    expect(res.body.payRate).toBe(23.25);
    expect(res.body.active).toBe(false);
  });

  it('deletes an employee record', async () => {
    const res = await request(app)
      .delete(`/api/admin/employees/${createdEmployeeId}`)
      .set('Authorization', `Bearer ${dispatcherToken}`);

    expect(res.status).toBe(204);

    const list = await request(app)
      .get('/api/admin/employees')
      .set('Authorization', `Bearer ${dispatcherToken}`);
    expect(list.body.some((row: { id: string }) => row.id === createdEmployeeId)).toBe(false);
  });
});
