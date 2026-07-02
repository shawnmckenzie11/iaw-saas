/** Driver roster entry returned by GET /api/admin/drivers. */
export interface DriverRosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

/** Custom event name fired when payroll mutates driver-linked employees. */
export const DRIVER_ROSTER_CHANGED_EVENT = 'iaw:driver-roster-changed';

/** Fallback roster when API is unavailable (offline / pre-fetch). */
const FALLBACK_ROSTER: DriverRosterEntry[] = [
  { id: 'drv-01', firstName: 'Driver', lastName: 'One', isActive: true },
  { id: 'drv-02', firstName: 'Driver', lastName: 'Two', isActive: true },
  { id: 'drv-03', firstName: 'Driver', lastName: 'Three', isActive: true },
  { id: 'drv-04', firstName: 'Driver', lastName: 'Four', isActive: true },
];

let cachedRoster: DriverRosterEntry[] = [...FALLBACK_ROSTER];

/**
 * Returns the most recently fetched driver roster (or fallback).
 */
export function getDriverRoster(): DriverRosterEntry[] {
  return cachedRoster;
}

/**
 * Returns the display first name for a driver id using the given roster.
 */
export function driverFirstNameFromRoster(
  driverId: string | null | undefined,
  roster: DriverRosterEntry[] = cachedRoster
): string {
  if (!driverId) return 'Unassigned';
  return roster.find((d) => d.id === driverId)?.firstName ?? driverId;
}

/**
 * Notifies listeners that the driver roster should be refetched.
 */
export function notifyDriverRosterChanged(): void {
  window.dispatchEvent(new Event(DRIVER_ROSTER_CHANGED_EVENT));
}

/**
 * Fetches active drivers from the admin API and updates the in-memory cache.
 */
export async function fetchDriverRoster(token: string): Promise<DriverRosterEntry[]> {
  try {
    const res = await fetch('/api/admin/drivers', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return cachedRoster;
    }
    const rows = (await res.json()) as DriverRosterEntry[];
    if (rows.length > 0) {
      cachedRoster = rows;
    }
    return cachedRoster;
  } catch {
    return cachedRoster;
  }
}
