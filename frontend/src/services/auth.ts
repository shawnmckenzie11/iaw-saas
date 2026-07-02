export type UserRole = 'DRIVER' | 'DISPATCHER';

export interface AuthSession {
  token: string;
  role: UserRole;
  driverId?: string;
  username: string;
}

const SESSION_KEY = 'iaw_auth_session';
const SESSION_COOKIE = 'iaw_auth_session';

/** Maps UI driver usernames to expected driver IDs for session labeling. */
const DRIVER_USERNAME_MAP: Record<string, string> = {
  driver1: 'drv-01',
  driver2: 'drv-02',
  driver3: 'drv-03',
  driver4: 'drv-04',
};

/**
 * Reads a cookie value by name.
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Writes a cookie that survives offline page reloads.
 */
function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax; max-age=43200`;
}

/**
 * Removes a persisted auth cookie.
 */
function clearCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}

/**
 * Decodes JWT payload claims without verifying the signature (client-side session labeling only).
 */
function decodeJwtPayload(token: string): { role?: UserRole; driverId?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  try {
    return JSON.parse(atob(parts[1])) as { role?: UserRole; driverId?: string };
  } catch {
    return {};
  }
}

/**
 * Authenticates a driver via 4-digit PIN against the backend API.
 */
async function loginDriver(username: string, pin: string): Promise<AuthSession | null> {
  const res = await fetch('/api/auth/driver/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return null;

  const { token } = (await res.json()) as { token: string };
  const claims = decodeJwtPayload(token);
  const normalized = username.trim().toLowerCase();
  const expectedDriverId = DRIVER_USERNAME_MAP[normalized];

  if (expectedDriverId && claims.driverId && claims.driverId !== expectedDriverId) {
    return null;
  }

  return {
    token,
    role: 'DRIVER',
    driverId: claims.driverId ?? expectedDriverId,
    username: normalized || `driver-${claims.driverId ?? 'unknown'}`,
  };
}

/**
 * Authenticates a dispatcher via email/password against the backend API.
 */
async function loginDispatcher(email: string, password: string): Promise<AuthSession | null> {
  const res = await fetch('/api/auth/dispatcher/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (!res.ok) return null;
  const { token } = (await res.json()) as { token: string };
  return { token, role: 'DISPATCHER', username: 'dispatch' };
}

/**
 * Maps UI login credentials to backend authentication payloads.
 */
export async function authenticateUser(
  mode: 'driver' | 'dispatcher',
  usernameOrEmail: string,
  passcodeOrPassword: string
): Promise<AuthSession | null> {
  const userLower = usernameOrEmail.trim().toLowerCase();

  if (mode === 'dispatcher') {
    return loginDispatcher(usernameOrEmail, passcodeOrPassword);
  }

  if (!/^\d{4}$/.test(passcodeOrPassword)) {
    return null;
  }

  return loginDriver(userLower, passcodeOrPassword);
}

/**
 * Persists the auth session across localStorage, sessionStorage, and IndexedDB.
 */
export async function saveSession(session: AuthSession): Promise<void> {
  const serialized = JSON.stringify(session);
  localStorage.setItem(SESSION_KEY, serialized);
  sessionStorage.setItem(SESSION_KEY, serialized);
  setCookie(SESSION_COOKIE, serialized);
  const { iawDb } = await import('../db/indexedDb');
  await iawDb.open();
  await iawDb.meta.put({ key: SESSION_KEY, value: serialized });
}

/**
 * Loads the persisted auth session from synchronous browser storage.
 */
export function loadSession(): AuthSession | null {
  const sources = [
    getCookie(SESSION_COOKIE),
    sessionStorage.getItem(SESSION_KEY),
    localStorage.getItem(SESSION_KEY),
  ];

  for (const raw of sources) {
    if (!raw) continue;
    try {
      const session = JSON.parse(raw) as AuthSession;
      if (session.role === 'DRIVER' && session.token && !session.driverId) {
        const claims = decodeJwtPayload(session.token);
        session.driverId = claims.driverId;
      }
      return session;
    } catch {
      // try next store
    }
  }
  return null;
}

/**
 * Loads auth session from IndexedDB for offline reload recovery.
 */
export async function loadSessionFromIndexedDb(): Promise<AuthSession | null> {
  const { iawDb } = await import('../db/indexedDb');
  await iawDb.open();
  const row = await iawDb.meta.get(SESSION_KEY);
  if (!row?.value) return null;
  try {
    const session = JSON.parse(row.value) as AuthSession;
    sessionStorage.setItem(SESSION_KEY, row.value);
    localStorage.setItem(SESSION_KEY, row.value);
    setCookie(SESSION_COOKIE, row.value);
    return session;
  } catch {
    return null;
  }
}

/**
 * Clears the persisted auth session from all storage layers.
 */
export async function clearSession(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  clearCookie(SESSION_COOKIE);
  const { iawDb } = await import('../db/indexedDb');
  await iawDb.open();
  await iawDb.meta.delete(SESSION_KEY);
}
