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

const DEV_JWT_FALLBACK = 'iaw-dev-jwt-secret';

/**
 * Resolves the JWT signing secret, failing closed in production when unset.
 */
function resolveJwtSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('[Auth] JWT_SECRET is required in production');
  }

  return DEV_JWT_FALLBACK;
}

const JWT_SECRET = resolveJwtSecret();
const JWT_EXPIRY = '12h';

/**
 * Returns true when a driver may mutate the given waybill record.
 * Unassigned waybills (`driverId === null`) are mutable by any authenticated driver.
 */
export function canDriverMutateWaybill(
  record: { driverId: string | null } | null | undefined,
  driverId: string | undefined
): boolean {
  if (!record) return false;
  if (!driverId) return false;
  return record.driverId === null || record.driverId === driverId;
}

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

    if (!canDriverMutateWaybill(record, user.driverId)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

/**
 * Authenticates a request from Bearer JWT or the `iaw_auth_session` cookie
 * (used by same-origin `<img src="/uploads/...">` loads).
 */
export function authenticateTokenOrCookie(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    authenticateToken(req, res, next);
    return;
  }

  const rawCookie = req.headers.cookie ?? '';
  const match = rawCookie.match(/(?:^|;\s*)iaw_auth_session=([^;]*)/);
  if (!match) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  try {
    const session = JSON.parse(decodeURIComponent(match[1])) as { token?: string };
    if (!session.token || revokedTokens.has(session.token)) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }
    const decoded = jwt.verify(session.token, JWT_SECRET) as AuthPayload;
    req.user = decoded;
    req.auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export { JWT_SECRET };

