import fs from 'fs';
import path from 'path';
import { DeliveryStatus, PriorityLevel, VehicleType } from '@prisma/client';
import { calculatePrice } from './pricing';
import {
  mapPriority,
  mapToVerified,
  mapVehicleType,
  parseWeightClass,
  VERIFIED_BUSINESSES,
} from './csvLocationMapper';

export interface ParsedArchiveRow {
  timestamp: Date;
  pickupLocationName: string;
  dropoffDestinationName: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: VehicleType;
  priority: PriorityLevel;
  parcelDescription: string;
  parcelWeightClass: string;
  contactName: string;
  contactPhone: string;
  additionalComments: string;
  calculatedPrice: number;
  priceCategory: string;
  skidRequired: boolean;
}

export interface TopPickupsStats {
  generatedAt: string;
  windowDays: number;
  topPickups: string[];
}

/** Resolves repo-root paths when seed runs from `backend/`. */
function repoPath(...segments: string[]): string {
  return path.join(process.cwd(), '..', ...segments);
}

const DEFAULT_CSV_PATH = repoPath('docs', 'BACKUP of Requests - Archive.csv');
const CONTAINER_CSV_PATH = path.join(process.cwd(), 'data', 'archive.csv');

/**
 * Resolves the archive CSV path for local dev or Fly container layouts.
 */
export function resolveArchiveCsvPath(): string {
  if (fs.existsSync(DEFAULT_CSV_PATH)) return DEFAULT_CSV_PATH;
  if (fs.existsSync(CONTAINER_CSV_PATH)) return CONTAINER_CSV_PATH;
  return DEFAULT_CSV_PATH;
}

const DEFAULT_TOP_PICKUPS_PATH = repoPath('frontend', 'src', 'data', 'topPickups.json');

/**
 * Parses a single CSV line handling quoted fields with embedded commas.
 */
export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').trim());
  return result;
}

/**
 * Parses a flexible date string from archive CSV rows.
 */
function parseArchiveDate(raw: string): Date {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const parts = raw.split(/[/-]/);
  if (parts.length >= 3) {
    const month = parseInt(parts[0], 10) - 1;
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2].length === 2 ? `20${parts[2]}` : parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date();
}

/**
 * Reads and parses all valid rows from the archive CSV.
 */
export function readArchiveCsv(csvPath?: string): ParsedArchiveRow[] {
  const resolvedPath = csvPath ?? resolveArchiveCsvPath();
  if (!fs.existsSync(resolvedPath)) {
    console.warn(`[Archive] CSV not found at ${resolvedPath}`);
    return [];
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const rows: ParsedArchiveRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    if (fields.length < 3) continue;

    const rawPickup = fields[1];
    const rawDropoff = fields[2];
    const pickup = mapToVerified(rawPickup);
    const dropoff = mapToVerified(rawDropoff);
    if (!pickup || !dropoff) continue;

    const timestamp = parseArchiveDate(fields[0] || '');
    const vehicleType = mapVehicleType(fields[3] || 'CAR');
    const priority = mapPriority(fields[5] || 'Regular') as PriorityLevel;
    const additionalComments = fields[7] || '';
    const description = fields[8] || 'Standard Package';
    const contactName = fields[9] || '';
    const contactPhone = fields[10] || '';
    const weightClass = parseWeightClass(description, additionalComments);
    const skidRequired =
      additionalComments.toLowerCase().includes('skid') ||
      description.toLowerCase().includes('skid') ||
      description.toLowerCase().includes('pallet');
    const pricing = calculatePrice(pickup, dropoff, weightClass, skidRequired, priority);

    rows.push({
      timestamp,
      pickupLocationName: pickup,
      dropoffDestinationName: dropoff,
      pickupAddress: rawPickup,
      dropoffAddress: rawDropoff,
      vehicleType,
      priority,
      parcelDescription: description || 'Standard Package',
      parcelWeightClass: weightClass,
      contactName,
      contactPhone,
      additionalComments,
      calculatedPrice: pricing.price,
      priceCategory: pricing.category,
      skidRequired,
    });
  }

  rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return rows;
}

/**
 * Returns the six most frequent pickup locations within the trailing window.
 */
export function computeTopPickups(rows: ParsedArchiveRow[], windowDays = 365, limit = 6): string[] {
  if (rows.length === 0) return VERIFIED_BUSINESSES.slice(0, limit);

  const newest = rows[0]?.timestamp ?? new Date();
  const cutoff = new Date(newest);
  cutoff.setDate(cutoff.getDate() - windowDays);

  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.timestamp < cutoff) continue;
    counts.set(row.pickupLocationName, (counts.get(row.pickupLocationName) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  if (sorted.length >= limit) return sorted.slice(0, limit);

  const fallback = VERIFIED_BUSINESSES.filter((name) => !sorted.includes(name));
  return [...sorted, ...fallback].slice(0, limit);
}

/** Minimum price applied when route pricing returns zero or manual. */
export const ARCHIVE_PRICE_FALLBACK = 1;

/** Default cutoff for YTD archive imports (Jan 1 of current year). */
export function archiveYearStart(year?: number): Date {
  return new Date(year ?? new Date().getFullYear(), 0, 1, 0, 0, 0, 0);
}

/**
 * Returns archive rows on or after the cutoff date, oldest first.
 */
export function filterArchiveRowsSince(rows: ParsedArchiveRow[], since: Date): ParsedArchiveRow[] {
  return rows
    .filter((row) => row.timestamp >= since)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Resolves a delivery price from pricing rules, using fallback when unrated.
 */
export function resolveArchivePrice(row: ParsedArchiveRow, fallback = ARCHIVE_PRICE_FALLBACK): number {
  return row.calculatedPrice > 0 ? row.calculatedPrice : fallback;
}

/**
 * Returns the last N archive rows for database seeding.
 */
export function getLastArchiveRows(rows: ParsedArchiveRow[], count = 100): ParsedArchiveRow[] {
  return rows.slice(0, count);
}

/**
 * Assigns mixed realistic statuses for baseline testing (~70/20/10).
 */
export function statusForArchiveIndex(index: number): DeliveryStatus {
  const bucket = index % 10;
  if (bucket < 7) return 'DELIVERED';
  if (bucket < 9) return 'PICKED_UP';
  return 'DRAFT';
}

/**
 * Writes top pickup stats JSON consumed by the frontend pickup wizard.
 */
export function writeTopPickupsJson(stats: TopPickupsStats, outPath: string = DEFAULT_TOP_PICKUPS_PATH): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf-8');
}

/**
 * Loads archive data, computes top pickups, and writes frontend JSON artifact.
 */
export function generateTopPickupsArtifact(csvPath?: string): TopPickupsStats {
  const rows = readArchiveCsv(csvPath);
  const topPickups = computeTopPickups(rows);
  const stats: TopPickupsStats = {
    generatedAt: new Date().toISOString().slice(0, 10),
    windowDays: 365,
    topPickups,
  };
  writeTopPickupsJson(stats);
  return stats;
}
