import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { signToken, revokedTokens, requireAuth, requireRole } from '../middleware/auth';
import { hashPin, isValidPinFormat } from '../utils/pinHash';
import {
  assignUniqueDriverLoginUsernames,
  driverIdForLoginUsername,
} from '../utils/driverLoginUsername';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// In-memory brute force lockout store
const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();

/**
 * Loads active driver display names (payroll employee names when linked).
 */
async function loadActiveDriverNames() {
  const drivers = await prisma.driver.findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
  });
  const employees = await prisma.employee.findMany({
    where: {
      driverId: { in: drivers.map((d) => d.id) },
      role: 'DRIVER',
      isActive: true,
    },
  });
  const employeeByDriverId = new Map(
    employees.filter((e) => e.driverId).map((e) => [e.driverId as string, e])
  );

  return drivers.map((driver) => {
    const employee = employeeByDriverId.get(driver.id);
    return {
      id: driver.id,
      firstName: employee?.firstName ?? driver.firstName,
      lastName: employee?.lastName ?? driver.lastName,
    };
  });
}

/**
 * Driver login handler.
 */
const handleDriverLogin = async (req: Request, res: Response) => {
  const { pin, driverId, loginUsername } = req.body;

  const ipKey = req.ip || 'unknown-ip';
  const targetKey = driverId || loginUsername || ipKey;

  const attempt = failedAttempts.get(targetKey);
  if (attempt && attempt.lockedUntil > Date.now()) {
    res.status(423).json({ error: 'Account locked. Try again later.' });
    return;
  }

  if (!isValidPinFormat(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 numeric digits' });
    return;
  }

  let expectedDriverId: string | undefined = driverId;
  if (loginUsername) {
    const names = await loadActiveDriverNames();
    const idToUsername = assignUniqueDriverLoginUsernames(names);
    expectedDriverId = driverIdForLoginUsername(String(loginUsername), idToUsername);
    if (!expectedDriverId) {
      res.status(401).json({ error: 'Invalid PIN' });
      return;
    }
  }

  const pinHash = hashPin(pin);
  const driver = await prisma.driver.findFirst({
    where: { pinHash, isActive: true },
  });

  if (!driver || (expectedDriverId && driver.id !== expectedDriverId)) {
    const count = (attempt ? attempt.count : 0) + 1;
    let lockedUntil = 0;
    if (count >= 5) {
      lockedUntil = Date.now() + 60 * 1000; // Lock for 60 seconds
    }
    failedAttempts.set(targetKey, { count, lockedUntil });

    res.status(401).json({ error: 'Invalid PIN' });
    return;
  }

  // Clear failed attempts on success
  failedAttempts.delete(targetKey);

  const token = signToken({
    sub: driver.id,
    role: 'DRIVER',
    driverId: driver.id,
  });

  const names = await loadActiveDriverNames();
  const profile = names.find((row) => row.id === driver.id);
  const idToUsername = assignUniqueDriverLoginUsernames(names);

  res.json({
    token,
    firstName: profile?.firstName,
    lastName: profile?.lastName,
    loginUsername: idToUsername.get(driver.id),
  });
};

/**
 * Dispatcher login handler.
 */
const handleDispatcherLogin = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  const dispatcher = await prisma.dispatcher.findUnique({ where: { email: normalizedEmail } });
  if (!dispatcher || !dispatcher.isActive) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const valid = await bcrypt.compare(password, dispatcher.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = signToken({
    sub: dispatcher.id,
    role: 'DISPATCHER',
  });

  res.json({ token });
};

// Map both paths to the handlers
router.get('/driver-logins', async (_req: Request, res: Response) => {
  const names = await loadActiveDriverNames();
  const idToUsername = assignUniqueDriverLoginUsernames(names);

  res.json(
    names.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      loginUsername: idToUsername.get(row.id) ?? '',
    }))
  );
});

router.post('/driver/login', handleDriverLogin);
router.post('/login/driver', handleDriverLogin);

router.post('/dispatcher/login', handleDispatcherLogin);
router.post('/login/dispatcher', handleDispatcherLogin);

// POST /api/auth/logout - Revokes active JWT token
router.post('/logout', requireAuth, (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7);
    revokedTokens.add(token);
  }
  res.json({ ok: true });
});

// GET /api/auth/driver-only-test - Restricted route for testing role collision
router.get('/driver-only-test', requireAuth, requireRole('DRIVER'), (req: Request, res: Response) => {
  res.json({ ok: true });
});

export default router;
