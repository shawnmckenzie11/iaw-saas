import fs from 'fs';
import path from 'path';
import { DeliveryStatus } from '@prisma/client';
import { VERIFIED_BUSINESSES } from './csvLocationMapper';
import {
  parseCsvLine,
  parseRequestFields,
  resolveRequestPrice,
} from '../intake/parseRequestRow';
import { ParsedRequestRow, REQUEST_PRICE_FALLBACK } from '../intake/types';

/** @deprecated Use ParsedRequestRow from intake/types — kept for archive reseed compatibility. */
export type ParsedArchiveRow = ParsedRequestRow;

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

export { parseCsvLine };

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
    const parsed = parseRequestFields(fields);
    if (parsed) rows.push(parsed);
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
export const ARCHIVE_PRICE_FALLBACK = REQUEST_PRICE_FALLBACK;

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
  return resolveRequestPrice(row, fallback);
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
