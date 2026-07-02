import {
  assignUniqueDriverLoginUsernames,
  driverDisplayName,
  driverIdForLoginUsername,
} from '../utils/driverLoginUsername';

/** Driver login row from GET /api/auth/driver-logins (payroll-linked names). */
export interface DriverLoginEntry {
  id: string;
  firstName: string;
  lastName: string;
  loginUsername: string;
}

/** Fired when payroll employee names change so login hints refresh. */
export const DRIVER_LOGINS_CHANGED_EVENT = 'iaw:driver-logins-changed';

/** Empty until the public driver-logins API is fetched. */
let cachedLogins: DriverLoginEntry[] = [];
let idToUsername = new Map<string, string>();

/**
 * Rebuilds the username index from login rows returned by the API.
 */
function applyLoginRows(rows: DriverLoginEntry[]): void {
  cachedLogins = rows;
  idToUsername = assignUniqueDriverLoginUsernames(rows);
  for (const row of cachedLogins) {
    if (!row.loginUsername) {
      row.loginUsername = idToUsername.get(row.id) ?? '';
    }
  }
}

/**
 * Returns cached driver login entries (payroll employee names when linked).
 */
export function getDriverLogins(): DriverLoginEntry[] {
  return cachedLogins;
}

/**
 * Resolves a login username to a driver id using the cached login index.
 */
export function resolveDriverIdFromLogin(username: string): string | undefined {
  return driverIdForLoginUsername(username, idToUsername);
}

/**
 * Returns the display name for a driver id from cached payroll-linked login entries.
 */
export function driverDisplayNameForId(driverId: string | undefined): string | undefined {
  if (!driverId) return undefined;
  const row = cachedLogins.find((entry) => entry.id === driverId);
  if (!row) return undefined;
  return driverDisplayName(row.firstName, row.lastName);
}

/**
 * Notifies listeners that driver login usernames should be refetched.
 */
export function notifyDriverLoginsChanged(): void {
  window.dispatchEvent(new Event(DRIVER_LOGINS_CHANGED_EVENT));
}

/**
 * Fetches driver logins from payroll-linked employee names and refreshes the cache.
 */
export async function fetchDriverLogins(): Promise<DriverLoginEntry[]> {
  try {
    const res = await fetch('/api/auth/driver-logins', { cache: 'no-store' });
    if (!res.ok) return cachedLogins;

    const rows = (await res.json()) as DriverLoginEntry[];
    if (rows.length === 0) return cachedLogins;

    applyLoginRows(rows);
    return cachedLogins;
  } catch {
    return cachedLogins;
  }
}
