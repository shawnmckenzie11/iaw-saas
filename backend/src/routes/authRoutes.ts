import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { signToken } from '../middleware/auth';
import { hashPin, isValidPinFormat } from '../utils/pinHash';

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/driver/login — Authenticates a driver via 4-digit PIN.
 */
router.post('/driver/login', async (req: Request, res: Response) => {
  const { pin } = req.body;

  if (!isValidPinFormat(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 4 numeric digits' });
    return;
  }

  const pinHash = hashPin(pin);
  const driver = await prisma.driver.findFirst({
    where: { pinHash, isActive: true },
  });

  if (!driver) {
    res.status(401).json({ error: 'Invalid PIN' });
    return;
  }

  const token = signToken({
    sub: driver.id,
    role: 'DRIVER',
    driverId: driver.id,
  });

  res.json({ token });
});

/**
 * POST /api/auth/dispatcher/login — Authenticates a dispatcher via email/password.
 */
router.post('/dispatcher/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  if (!EMAIL_REGEX.test(email)) {
    res.status(400).json({ error: 'Invalid email format' });
    return;
  }

  const dispatcher = await prisma.dispatcher.findUnique({ where: { email } });
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
});

export default router;
