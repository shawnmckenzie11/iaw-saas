import { Router, Request, Response } from 'express';
import { EmployeeRole, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

/** Serializes an employee row for JSON responses. */
function serializeEmployee(employee: {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: EmployeeRole;
  isActive: boolean;
  payRate: Prisma.Decimal | null;
  driverId: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: employee.id,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    role: employee.role,
    active: employee.isActive,
    payRate: employee.payRate !== null ? Number(employee.payRate) : null,
    driverId: employee.driverId,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

/** Validates create/update payload fields for payroll employees. */
function parseEmployeeBody(body: Record<string, unknown>, partial: boolean) {
  const errors: string[] = [];
  const data: Prisma.EmployeeUpdateInput = {};

  if (!partial || body.firstName !== undefined) {
    if (typeof body.firstName !== 'string' || !body.firstName.trim()) {
      errors.push('firstName is required');
    } else {
      data.firstName = body.firstName.trim();
    }
  }

  if (!partial || body.lastName !== undefined) {
    if (typeof body.lastName !== 'string' || !body.lastName.trim()) {
      errors.push('lastName is required');
    } else {
      data.lastName = body.lastName.trim();
    }
  }

  if (body.email !== undefined) {
    data.email =
      body.email === null || body.email === ''
        ? null
        : typeof body.email === 'string'
          ? body.email.trim()
          : null;
  }

  if (body.phone !== undefined) {
    data.phone =
      body.phone === null || body.phone === ''
        ? null
        : typeof body.phone === 'string'
          ? body.phone.trim()
          : null;
  }

  if (body.role !== undefined) {
    if (body.role !== 'DRIVER' && body.role !== 'DISPATCHER') {
      errors.push('role must be DRIVER or DISPATCHER');
    } else {
      data.role = body.role;
    }
  }

  if (body.active !== undefined) {
    data.isActive = Boolean(body.active);
  }

  if (body.payRate !== undefined) {
    if (body.payRate === null || body.payRate === '') {
      data.payRate = null;
    } else {
      const rate = Number(body.payRate);
      if (Number.isNaN(rate) || rate < 0) {
        errors.push('payRate must be a non-negative number');
      } else {
        data.payRate = rate;
      }
    }
  }

  if (body.driverId !== undefined) {
    data.driverId =
      body.driverId === null || body.driverId === ''
        ? null
        : typeof body.driverId === 'string'
          ? body.driverId.trim()
          : null;
  }

  return { data, errors };
}

router.use(requireAuth, requireRole('DISPATCHER'));

/**
 * GET /api/admin/employees — Lists payroll employee records.
 */
router.get('/', async (_req: Request, res: Response) => {
  const employees = await prisma.employee.findMany({
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  res.json(employees.map(serializeEmployee));
});

/**
 * POST /api/admin/employees — Creates a payroll employee record.
 */
router.post('/', async (req: Request, res: Response) => {
  const { data, errors } = parseEmployeeBody(req.body ?? {}, false);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  const employee = await prisma.employee.create({
    data: {
      firstName: data.firstName as string,
      lastName: data.lastName as string,
      email: (data.email as string | null | undefined) ?? null,
      phone: (data.phone as string | null | undefined) ?? null,
      role: (data.role as EmployeeRole | undefined) ?? EmployeeRole.DRIVER,
      isActive: (data.isActive as boolean | undefined) ?? true,
      payRate: (data.payRate as number | null | undefined) ?? null,
      driverId: (data.driverId as string | null | undefined) ?? null,
    },
  });

  res.status(201).json(serializeEmployee(employee));
});

/**
 * PUT /api/admin/employees/:id — Updates a payroll employee record.
 */
router.put('/:id', async (req: Request, res: Response) => {
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  const { data, errors } = parseEmployeeBody(req.body ?? {}, true);
  if (errors.length > 0) {
    res.status(400).json({ error: errors.join('; ') });
    return;
  }

  const employee = await prisma.employee.update({
    where: { id: req.params.id },
    data,
  });

  res.json(serializeEmployee(employee));
});

/**
 * DELETE /api/admin/employees/:id — Removes a payroll employee record.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }

  await prisma.employee.delete({ where: { id: req.params.id } });
  res.status(204).send();
});

export default router;
