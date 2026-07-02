import type { PriorityLevel } from '@prisma/client';
import { calculatePrice } from '../utils/pricing';
import {
  mapToVerifiedConfident,
  mapVehicleType,
  parseWeightClass,
} from '../utils/csvLocationMapper';
import { ParsedRequestRow, REQUEST_PRICE_FALLBACK } from './types';

/** Legacy column indices for archive CSV / older form responses. */
const LEGACY_COLUMNS = {
  timestamp: 0,
  pickup: 1,
  destination: 2,
  vehicle: 3,
  deliveryDate: 4,
  priority: 5,
  businessOrResidential: 6,
  additionalComments: 7,
  description: 8,
  name: 9,
  phone: 10,
  requestedPickupTime: 11,
} as const;

/** Resolved column indices for a form or sheet header row. */
export interface FormColumnMap {
  timestamp: number;
  pickup: number;
  destination: number;
  vehicle: number;
  deliveryDate: number;
  priority: number;
  businessOrResidential: number;
  additionalComments: number;
  description: number;
  weight: number | null;
  name: number;
  phone: number;
  requestedPickupTime: number;
}

/**
 * Normalizes a sheet header label for fuzzy matching.
 */
export function normalizeFormHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Builds a column map from Google Form / sheet header labels.
 */
export function buildFormColumnMap(headers: string[]): FormColumnMap {
  const find = (...needles: string[]): number | null => {
    const index = headers.findIndex((header) => {
      const normalized = normalizeFormHeader(header);
      return needles.some((needle) => normalized.includes(needle));
    });
    return index >= 0 ? index : null;
  };

  const serviceTierIndex = headers.findIndex((header) => {
    const normalized = normalizeFormHeader(header);
    return normalized.includes('service') || normalized.includes('delivery speed');
  });

  const weight =
    find('weight') ??
    find('over 75') ??
    find('lbs') ??
    null;

  const priorityField =
    find('priority') ??
    (serviceTierIndex >= 0 ? serviceTierIndex : LEGACY_COLUMNS.priority);

  return {
    timestamp: find('timestamp') ?? LEGACY_COLUMNS.timestamp,
    pickup: find('pick up') ?? find('pickup') ?? LEGACY_COLUMNS.pickup,
    destination: find('destination') ?? find('dropoff') ?? LEGACY_COLUMNS.destination,
    vehicle: find('vehicle') ?? LEGACY_COLUMNS.vehicle,
    deliveryDate: find('date of delivery') ?? find('delivery date') ?? LEGACY_COLUMNS.deliveryDate,
    priority: priorityField,
    businessOrResidential:
      find('business or residential') ?? find('business') ?? LEGACY_COLUMNS.businessOrResidential,
    additionalComments: find('additional comment') ?? LEGACY_COLUMNS.additionalComments,
    description: find('description of parcel') ?? find('description') ?? LEGACY_COLUMNS.description,
    weight,
    name: find('name') ?? LEGACY_COLUMNS.name,
    phone: find('phone') ?? LEGACY_COLUMNS.phone,
    requestedPickupTime:
      find('requested time') ?? find('pick-up') ?? LEGACY_COLUMNS.requestedPickupTime,
  };
}

/**
 * Reads a field value using the resolved column map with legacy fallback.
 */
function readField(fields: string[], columnMap: FormColumnMap, key: keyof FormColumnMap): string {
  const index = columnMap[key];
  if (index === null || index === undefined || index < 0) return '';
  return fields[index] ?? '';
}

/**
 * Parses an explicit weight entry from the form; only values over 75 lbs are used.
 */
export function parseExplicitWeightLbs(raw: string | undefined | null): number | null {
  if (!raw?.trim()) return null;

  const match = raw.trim().match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const lbs = parseFloat(match[1]);
  if (Number.isNaN(lbs) || lbs <= 75) return null;
  return lbs;
}

/**
 * Resolves parcel weight class, preferring the dedicated form weight field when present.
 */
export function resolveParcelWeightClass(
  explicitWeightLbs: number | null,
  description: string,
  additionalComments: string
): string {
  if (explicitWeightLbs !== null) {
    return `${explicitWeightLbs} lbs`;
  }
  return parseWeightClass(description, additionalComments);
}

/**
 * Parses a flexible date string from archive / form rows.
 */
export function parseRequestDate(raw: string): Date {
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
 * Maps form priority values; customer-facing "Eco" is stored as rush service.
 */
export function resolveFormPriority(priorityRaw: string, vehicleRaw = ''): PriorityLevel {
  const priorityField = priorityRaw.trim().toLowerCase();
  const combined = `${priorityRaw} ${vehicleRaw}`.trim().toLowerCase();
  if (priorityField.includes('eco') || combined.includes(' eco') || combined.includes('rush')) {
    return 'RUSH';
  }
  return 'REGULAR';
}

/** @deprecated Use resolveFormPriority — kept for tests. */
export function mapFormPriority(priorityRaw: string, vehicleRaw = ''): PriorityLevel {
  return resolveFormPriority(priorityRaw, vehicleRaw);
}

/**
 * Returns true when the vehicle selection implies a skid/pallet load.
 */
export function isSkidRequiredFromVehicle(vehicleRaw: string): boolean {
  const v = vehicleRaw.toLowerCase();
  const isCargoVan = v.includes('cargo') && v.includes('van');
  const isThreeQuarterTon =
    v.includes('3/4') || v.includes('3-4') || v.includes('three quarter') || v.includes('¾');
  return isCargoVan && isThreeQuarterTon;
}

/**
 * Returns true when text fields explicitly mention skid or pallet freight.
 */
export function isSkidRequiredFromDescription(additionalComments: string, description: string): boolean {
  const combined = `${additionalComments} ${description}`.toLowerCase();
  return combined.includes('skid') || combined.includes('pallet');
}

/**
 * Parses archive / Google Form column fields into a normalized request row.
 * Uses verified business names only when confidently matched; otherwise keeps raw text.
 */
export function parseRequestFields(fields: string[], headers: string[] = []): ParsedRequestRow | null {
  const columnMap = headers.length > 0 ? buildFormColumnMap(headers) : buildFormColumnMap([]);

  const rawPickup = readField(fields, columnMap, 'pickup');
  const rawDropoff = readField(fields, columnMap, 'destination');
  if (!rawPickup.trim() || !rawDropoff.trim()) return null;

  const pickupVerified = mapToVerifiedConfident(rawPickup);
  const dropoffVerified = mapToVerifiedConfident(rawDropoff);
  const requiresManualPricing = pickupVerified === null || dropoffVerified === null;
  const pickupLocationName = pickupVerified ?? rawPickup.trim();
  const dropoffDestinationName = dropoffVerified ?? rawDropoff.trim();

  const timestamp = parseRequestDate(readField(fields, columnMap, 'timestamp'));
  const vehicleRaw = readField(fields, columnMap, 'vehicle') || 'CAR';
  const vehicleType = mapVehicleType(vehicleRaw);
  const priority = resolveFormPriority(
    readField(fields, columnMap, 'priority') || 'Regular',
    vehicleRaw
  );
  const additionalComments = readField(fields, columnMap, 'additionalComments');
  const description = readField(fields, columnMap, 'description') || 'Standard Package';
  const contactName = readField(fields, columnMap, 'name');
  const contactPhone = readField(fields, columnMap, 'phone');
  const weightRaw = columnMap.weight !== null ? readField(fields, columnMap, 'weight') : '';
  const parcelWeightLbs = parseExplicitWeightLbs(weightRaw);
  const weightClass = resolveParcelWeightClass(parcelWeightLbs, description, additionalComments);
  const skidRequired =
    isSkidRequiredFromVehicle(vehicleRaw) ||
    isSkidRequiredFromDescription(additionalComments, description);

  let calculatedPrice = 0;
  let priceCategory = 'Manual — dispatch approval required';

  if (!requiresManualPricing) {
    const pricing = calculatePrice(
      pickupLocationName,
      dropoffDestinationName,
      weightClass,
      skidRequired,
      priority
    );
    calculatedPrice = pricing.price;
    priceCategory = pricing.category;
  }

  return {
    timestamp,
    pickupLocationName,
    dropoffDestinationName,
    pickupAddress: rawPickup.trim(),
    dropoffAddress: rawDropoff.trim(),
    vehicleType,
    priority,
    parcelDescription: description || 'Standard Package',
    parcelWeightClass: weightClass,
    parcelWeightLbs,
    contactName,
    contactPhone,
    additionalComments,
    calculatedPrice,
    priceCategory,
    skidRequired,
    requiresManualPricing,
  };
}

/**
 * Resolves a delivery price from pricing rules, using fallback when unrated.
 * Returns zero when dispatch must approve pricing first.
 */
export function resolveRequestPrice(row: ParsedRequestRow, fallback = REQUEST_PRICE_FALLBACK): number {
  if (row.requiresManualPricing) return 0;
  return row.calculatedPrice > 0 ? row.calculatedPrice : fallback;
}
