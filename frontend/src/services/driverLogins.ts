import { DRIVERS } from '../data/drivers';
import {
  assignUniqueDriverLoginUsernames,
  driverDisplayName,
  driverIdForLoginUsername,
} from '../utils/driverLoginUsername';

/** Driver login row from GET /api/auth/driver-logins. */
export interface DriverLoginEntry {
  id: string;
  firstName: string;
  lastName: string;
  loginUsername: string;
}

let cachedLogins: DriverLoginEntry[] = DRIVERS.map((d) => ({
  id: d.id,
  firstName: d.firstName,
  lastName: d.lastName,
  loginUsername: '',
}));

let idToUsername = assignUniqueDriverLoginUsernames(
  DRIVERS.map((d) => ({ id: d.id, firstName: d.firstName, lastName: d.lastName }))
);

for (const row of cachedLogins) {
  row.loginUsername = idToUsername.get(row.id) ?? '';
}

/**
 * Returns cached driver login entries (fallback until API fetch completes).
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
 * Returns the display name for a driver id from cached login entries.
 */
export function driverDisplayNameForId(driverId: string | undefined): string | undefined {
  if (!driverId) return undefined;
  const row = cachedLogins.find((entry) => entry.id === driverId);
  if (!row) return undefined;
  return driverDisplayName(row.firstName, row.lastName);
}

/**
 * Fetches public driver login usernames and refreshes the in-memory cache.
 */
export async function fetchDriverLogins(): Promise<DriverLoginEntry[]> {
  try {
    const res = await fetch('/api/auth/driver-logins', { cache: 'no-store' });
    if (!res.ok) return cachedLogins;

    const rows = (await res.json()) as DriverLoginEntry[];
    if (rows.length === 0) return cachedLogins;

    cachedLogins = rows;
    idToUsername = assignUniqueDriverLoginUsernames(rows);
    for (const row of cachedLogins) {
      if (!row.loginUsername) {
        row.loginUsername = idToUsername.get(row.id) ?? '';
      }
    }
    return cachedLogins;
  } catch {
    return cachedLogins;
  }
}
