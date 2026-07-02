import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';

export interface AuthPayload {
  role: 'DRIVER' | 'DISPATCHER';
  driverId?: string;
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      user?: AuthPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'iaw-dev-jwt-secret';
const JWT_EXPIRY = '12h';

/**
 * Signs a JWT for an authenticated user with role-scoped claims.
 */
export function signToken(payload: Omit<AuthPayload, 'sub'> & { sub: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export const revokedTokens = new Set<string>();

/**
 * Express middleware that verifies Bearer JWT tokens and attaches claims to req.user and req.auth.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  const token = header.slice(7);
  if (revokedTokens.has(token)) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    req.auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Keep requireAuth as an alias to authenticateToken for backward compatibility.
 */
export const requireAuth = authenticateToken;

/**
 * Restricts access to users with one of the allowed roles.
 */
export function requireRole(...roles: AuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user || req.auth;
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

/**
 * Middleware to check if a driver has access to a specific waybill.
 * Dispatchers have global access. Drivers can only access waybills assigned to them
 * or unassigned waybills.
 */
export async function checkWaybillAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user || req.auth;
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (user.role === 'DISPATCHER') {
    next();
    return;
  }

  const { waybillNumber } = req.params;
  if (!waybillNumber) {
    res.status(400).json({ error: 'Waybill number is required' });
    return;
  }

  try {
    const record = await prisma.deliveryRecord.findUnique({
      where: { waybillNumber },
    });

    if (!record) {
      res.status(404).json({ error: 'Waybill not found' });
      return;
    }

    if (record.driverId !== null && record.driverId !== user.driverId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export { JWT_SECRET };

