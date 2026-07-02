/** Driver roster row used to derive login usernames. */
export interface DriverNameRow {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Builds the base login username: firstname + "." + last initial (lowercase).
 */
export function buildDriverLoginUsername(firstName: string, lastName: string): string {
  const first = firstName.trim().toLowerCase().replace(/\s+/g, '');
  const last = lastName.trim();
  if (!first || !last) return first || 'driver';
  return `${first}.${last.charAt(0).toLowerCase()}`;
}

/**
 * Assigns unique login usernames for a roster, extending the last-name suffix on collision.
 */
export function assignUniqueDriverLoginUsernames(
  entries: DriverNameRow[]
): Map<string, string> {
  const usernameToId = new Map<string, string>();
  const idToUsername = new Map<string, string>();

  for (const entry of entries) {
    const first = entry.firstName.trim().toLowerCase().replace(/\s+/g, '');
    const last = entry.lastName.trim().toLowerCase().replace(/\s+/g, '');
    let candidate = `${first}.${last.charAt(0)}`;
    let lastLen = 1;

    while (usernameToId.has(candidate) && usernameToId.get(candidate) !== entry.id) {
      lastLen += 1;
      if (lastLen <= last.length) {
        candidate = `${first}.${last.slice(0, lastLen)}`;
      } else {
        candidate = `${first}.${last}${lastLen - last.length}`;
      }
    }

    usernameToId.set(candidate, entry.id);
    idToUsername.set(entry.id, candidate);
  }

  return idToUsername;
}

/**
 * Resolves a login username to a driver id using the assigned username map.
 */
export function driverIdForLoginUsername(
  username: string,
  idToUsername: Map<string, string>
): string | undefined {
  const normalized = username.trim().toLowerCase();
  for (const [driverId, login] of idToUsername.entries()) {
    if (login === normalized) return driverId;
  }
  return undefined;
}
