import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

/** Serializes a driver roster entry for dispatch UI consumption. */
function serializeDriverRosterEntry(driver: {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}, employee?: { firstName: string; lastName: string; isActive: boolean } | null) {
  const useEmployee = employee?.isActive !== false;
  return {
    id: driver.id,
    firstName: useEmployee ? employee!.firstName : driver.firstName,
    lastName: useEmployee ? employee!.lastName : driver.lastName,
    isActive: driver.isActive,
  };
}

router.use(requireAuth, requireRole('DISPATCHER'));

/**
 * GET /api/admin/drivers — Lists active drivers with payroll-linked display names.
 */
router.get('/', async (_req: Request, res: Response) => {
  const drivers = await prisma.driver.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });

  const employees = await prisma.employee.findMany({
    where: {
      driverId: { in: drivers.map((d) => d.id) },
      role: 'DRIVER',
    },
  });

  const employeeByDriverId = new Map(
    employees.filter((e) => e.driverId).map((e) => [e.driverId as string, e])
  );

  res.json(
    drivers.map((driver) =>
      serializeDriverRosterEntry(driver, employeeByDriverId.get(driver.id))
    )
  );
});

export default router;
