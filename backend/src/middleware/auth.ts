import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  role: 'DRIVER' | 'DISPATCHER';
  driverId?: string;
  sub: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
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

/**
 * Express middleware that verifies Bearer JWT tokens and attaches claims to the request.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization required' });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
    req.auth = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Restricts access to users with one of the allowed roles.
 */
export function requireRole(...roles: AuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
}

export { JWT_SECRET };
