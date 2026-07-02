export type UserRole = 'DRIVER' | 'DISPATCHER';

export interface AuthSession {
  token: string;
  role: UserRole;
  driverId?: string;
  username: string;
}

const SESSION_KEY = 'iaw_auth_session';
const SESSION_COOKIE = 'iaw_auth_session';

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
 * Maps UI login credentials to backend authentication payloads.
 */
export async function authenticateUser(
  username: string,
  passcode: string
): Promise<AuthSession | null> {
  const userLower = username.trim().toLowerCase();

  if (userLower === 'driver1' && passcode === '1111') {
    const res = await fetch('/api/auth/driver/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '1111' }),
    });
    if (!res.ok) return null;
    const { token } = await res.json();
    return { token, role: 'DRIVER', driverId: 'drv-01', username: 'driver1' };
  }

  if (userLower === 'driver2' && passcode === '2222') {
    const res = await fetch('/api/auth/driver/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '2222' }),
    });
    if (!res.ok) return null;
    const { token } = await res.json();
    return { token, role: 'DRIVER', driverId: 'drv-02', username: 'driver2' };
  }

  if (userLower === 'dispatch' && passcode === '0000') {
    const res = await fetch('/api/auth/dispatcher/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'dispatcher@example.com', password: 'password123' }),
    });
    if (!res.ok) return null;
    const { token } = await res.json();
    return { token, role: 'DISPATCHER', username: 'dispatch' };
  }

  return null;
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
      return JSON.parse(raw) as AuthSession;
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
