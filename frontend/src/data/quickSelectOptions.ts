/** Default quick-select chip count before "More..." reveals the full list. */
export const QUICK_SELECT_LIMIT = 10;

/**
 * Returns the ranked quick pickup list (archive frequency order, capped at limit).
 */
export function quickPickupOptions(
  topPickups: string[],
  commonPickups: string[],
  showAll: boolean,
  limit = QUICK_SELECT_LIMIT
): string[] {
  if (showAll) return commonPickups;

  const ranked = topPickups.filter((name) => commonPickups.includes(name));
  const quick =
    ranked.length > 0 ? ranked.slice(0, limit) : commonPickups.slice(0, limit);

  return quick.length === 0 ? commonPickups : quick;
}

/**
 * Returns quick dropoff chips: pickup-specific ranked destinations first, then
 * alphabetical top-up from registered businesses until limit. "More" shows all registered.
 */
export function quickDropoffOptions(
  rankedDropoffs: string[],
  allRegistered: string[],
  showAll: boolean,
  limit = QUICK_SELECT_LIMIT
): string[] {
  if (showAll) return allRegistered;

  const registeredSet = new Set(allRegistered);
  const quick: string[] = [];
  const seen = new Set<string>();

  for (const name of rankedDropoffs) {
    if (!registeredSet.has(name) || seen.has(name)) continue;
    quick.push(name);
    seen.add(name);
    if (quick.length >= limit) return quick;
  }

  const alphabetical = [...allRegistered]
    .filter((name) => !seen.has(name))
    .sort((a, b) => a.localeCompare(b));

  for (const name of alphabetical) {
    quick.push(name);
    if (quick.length >= limit) break;
  }

  return quick.length === 0 ? allRegistered.slice(0, limit) : quick;
}

/**
 * Filters archive-ranked dropoffs to registered business names only.
 */
export function rankedRegisteredDropoffs(
  pickupKey: string | null,
  conditionalDropoffs: Record<string, string[]>,
  registeredBusinesses: string[],
  pickupLocation: string
): string[] {
  if (!pickupKey) return [];

  const registered = new Set(registeredBusinesses);
  return (conditionalDropoffs[pickupKey] ?? []).filter(
    (name) => registered.has(name) && name !== pickupLocation
  );
}

/**
 * All registered businesses eligible as dropoff (excludes the active pickup).
 */
export function allRegisteredDropoffs(
  registeredBusinesses: string[],
  pickupLocation: string
): string[] {
  return registeredBusinesses.filter((name) => name !== pickupLocation);
}
