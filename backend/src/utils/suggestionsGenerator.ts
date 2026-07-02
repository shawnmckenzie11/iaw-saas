import fs from 'fs';
import path from 'path';
import { mapToVerified, VERIFIED_BUSINESSES } from './csvLocationMapper';
import { LOCATION_ADDRESSES, LOCATION_COORDS } from './locationGeoLookup';
import { ParsedArchiveRow, readArchiveCsv } from './archiveCsvImporter';

/** Minimum archive rows required before overwriting committed synthetic fixtures. */
export const SUGGESTIONS_ARCHIVE_MIN_ROWS = 50;

export interface LocationDetail {
  address: string;
  lat: number;
  lon: number;
}

export interface LocationSuggestionsArtifact {
  commonPickups: string[];
  conditionalDropoffs: Record<string, string[]>;
  locations: Record<string, LocationDetail>;
}

const DEFAULT_SUGGESTIONS_PATH = path.join(
  process.cwd(),
  '..',
  'frontend',
  'public',
  'data',
  'suggestions.generated.json'
);

/**
 * Sorts verified business names alphabetically for the common pickup list.
 */
export function buildCommonPickups(): string[] {
  return [...VERIFIED_BUSINESSES].sort((a, b) => a.localeCompare(b));
}

/**
 * Returns the top dropoff destinations for each pickup based on archive frequency.
 */
export function computeConditionalDropoffs(
  rows: ParsedArchiveRow[],
  limitPerPickup = 10
): Record<string, string[]> {
  const verifiedSet = new Set<string>(VERIFIED_BUSINESSES);
  const pairs = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const pickup = mapToVerified(row.pickupLocationName);
    const dropoff = mapToVerified(row.dropoffDestinationName);
    if (!pickup || !dropoff || pickup === dropoff) continue;
    if (!verifiedSet.has(pickup) || !verifiedSet.has(dropoff)) continue;

    if (!pairs.has(pickup)) pairs.set(pickup, new Map());
    const dropoffCounts = pairs.get(pickup)!;
    dropoffCounts.set(dropoff, (dropoffCounts.get(dropoff) ?? 0) + 1);
  }

  const result: Record<string, string[]> = {};
  for (const [pickup, dropoffCounts] of pairs.entries()) {
    const sorted = [...dropoffCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
      .filter((name) => name !== pickup)
      .slice(0, limitPerPickup);
    if (sorted.length > 0) result[pickup] = sorted;
  }

  return result;
}

/**
 * Picks the most frequent raw address string for each canonical location name.
 */
export function computeLocationAddresses(rows: ParsedArchiveRow[]): Map<string, string> {
  const addressCounts = new Map<string, Map<string, number>>();

  const recordAddress = (name: string, rawAddress: string) => {
    const address = rawAddress.trim();
    if (!name || !address) return;
    if (!addressCounts.has(name)) addressCounts.set(name, new Map());
    const counts = addressCounts.get(name)!;
    counts.set(address, (counts.get(address) ?? 0) + 1);
  };

  for (const row of rows) {
    recordAddress(row.pickupLocationName, row.pickupAddress);
    recordAddress(row.dropoffDestinationName, row.dropoffAddress);
  }

  const bestAddress = new Map<string, string>();
  for (const [name, counts] of addressCounts.entries()) {
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (top) bestAddress.set(name, top);
  }

  return bestAddress;
}

/**
 * Builds the full location suggestions artifact from parsed archive rows.
 */
export function buildSuggestionsArtifact(rows: ParsedArchiveRow[]): LocationSuggestionsArtifact {
  const commonPickups = buildCommonPickups();
  const conditionalDropoffs = computeConditionalDropoffs(rows);
  const addresses = computeLocationAddresses(rows);
  const locations: Record<string, LocationDetail> = {};

  const allNames = new Set<string>([...commonPickups, ...Object.keys(conditionalDropoffs)]);
  for (const dropoffs of Object.values(conditionalDropoffs)) {
    for (const name of dropoffs) allNames.add(name);
  }

  for (const name of allNames) {
    const coords = LOCATION_COORDS[name];
    const address = addresses.get(name) ?? LOCATION_ADDRESSES[name];
    if (address) {
      locations[name] = {
        address,
        lat: coords?.lat ?? 46.49,
        lon: coords?.lon ?? -80.99,
      };
      continue;
    }
    if (!coords) continue;
    locations[name] = {
      address: addresses.get(name) ?? name,
      lat: coords.lat,
      lon: coords.lon,
    };
  }

  for (const [name, address] of Object.entries(LOCATION_ADDRESSES)) {
    if (locations[name]) continue;
    const coords = LOCATION_COORDS[name];
    locations[name] = {
      address,
      lat: coords?.lat ?? 46.49,
      lon: coords?.lon ?? -80.99,
    };
  }

  return { commonPickups, conditionalDropoffs, locations };
}

/**
 * Writes location suggestions JSON consumed by the frontend pickup wizard.
 */
export function writeSuggestionsJson(
  artifact: LocationSuggestionsArtifact,
  outPath: string = DEFAULT_SUGGESTIONS_PATH
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
}

/**
 * Loads archive data and writes frontend suggestions when the CSV is substantial.
 * Returns null when the archive is too small (synthetic example CSV / fresh clone).
 */
export function generateSuggestionsArtifact(csvPath?: string): LocationSuggestionsArtifact | null {
  const rows = readArchiveCsv(csvPath);
  if (rows.length < SUGGESTIONS_ARCHIVE_MIN_ROWS) {
    return null;
  }

  const artifact = buildSuggestionsArtifact(rows);
  writeSuggestionsJson(artifact);
  return artifact;
}
