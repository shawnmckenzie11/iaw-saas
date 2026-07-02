import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  archiveYearStart,
  filterArchiveRowsSince,
  generateTopPickupsArtifact,
  readArchiveCsv,
  resolveArchivePrice,
  type ParsedArchiveRow,
} from './utils/archiveCsvImporter';

const DRIVER_IDS = ['drv-01', 'drv-02', 'drv-03', 'drv-04'];

export interface ImportArchiveOptions {
  /** Import rows with timestamps on or after this date. */
  since: Date;
  /** When true, deletes all delivery records and waybill events first. */
  clearExisting: boolean;
  csvPath?: string;
  /** Regenerate frontend topPickups.json from full CSV. */
  writeTopPickups?: boolean;
}

/**
 * Removes all waybill events and delivery records (active, pending price, completed).
 */
export async function clearDeliveryData(prisma: PrismaClient): Promise<void> {
  const events = await prisma.waybillEvent.deleteMany({});
  const records = await prisma.deliveryRecord.deleteMany({});
  console.log(`[Archive] Cleared ${records.count} delivery records and ${events.count} waybill events.`);
}

/**
 * Imports archive CSV rows as completed deliveries with event-sourced history.
 */
export async function importCompletedArchiveRows(
  prisma: PrismaClient,
  rows: ParsedArchiveRow[]
): Promise<number> {
  let imported = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const waybillNumber = `HIST-${String(i + 1).padStart(3, '0')}`;
    const driverId = DRIVER_IDS[i % DRIVER_IDS.length];
    const clientSideUuid = randomUUID();
    const capturedAt = row.timestamp;
    const deliveredAt = row.timestamp;
    const price = resolveArchivePrice(row);

    await prisma.deliveryRecord.create({
      data: {
        clientSideUuid,
        waybillNumber,
        status: 'DELIVERED',
        syncStatus: 'SYNCED',
        driverId,
        vehicleType: row.vehicleType,
        parcelDescription: row.parcelDescription,
        parcelWeightClass: row.parcelWeightClass,
        pickupLocationName: row.pickupLocationName,
        pickupAddress: row.pickupAddress,
        pickupContactName: row.contactName || null,
        pickupContactPhone: row.contactPhone || null,
        dropoffDestinationName: row.dropoffDestinationName,
        dropoffAddress: row.dropoffAddress,
        dropoffContactName: row.contactName || null,
        dropoffContactPhone: row.contactPhone || null,
        priority: row.priority,
        additionalComments: row.additionalComments || null,
        capturedAt,
        createdAt: capturedAt,
        deliveredAt,
        syncedAt: capturedAt,
        pricingTotalCost: price,
        pricingBaseRate: price,
        pricingIsManuallyAdjusted: row.calculatedPrice <= 0,
      },
    });

    let seq = 1;
    await prisma.waybillEvent.create({
      data: {
        clientSideUuid,
        waybillNumber,
        sequenceNumber: seq++,
        eventType: 'WAYBILL_CREATED',
        data: { waybillNumber, priceCategory: row.priceCategory, driverId },
        timestamp: capturedAt,
      },
    });

    await prisma.waybillEvent.create({
      data: {
        clientSideUuid,
        waybillNumber,
        sequenceNumber: seq++,
        eventType: 'WAYBILL_ASSIGNED',
        data: { driverId },
        timestamp: capturedAt,
      },
    });

    await prisma.waybillEvent.create({
      data: {
        clientSideUuid,
        waybillNumber,
        sequenceNumber: seq++,
        eventType: 'WAYBILL_PICKED_UP',
        data: { pickedUpAt: capturedAt.toISOString() },
        timestamp: capturedAt,
      },
    });

    await prisma.waybillEvent.create({
      data: {
        clientSideUuid,
        waybillNumber,
        sequenceNumber: seq++,
        eventType: 'WAYBILL_DELIVERED',
        data: { deliveredAt: deliveredAt.toISOString() },
        timestamp: deliveredAt,
      },
    });

    imported++;
  }

  return imported;
}

/**
 * Clears operational waybills and loads YTD archive CSV rows as completed deliveries.
 */
export async function reseedFromArchive(
  prisma: PrismaClient,
  options: ImportArchiveOptions
): Promise<number> {
  const allRows = readArchiveCsv(options.csvPath);
  const batch = filterArchiveRowsSince(allRows, options.since);

  if (options.writeTopPickups !== false && allRows.length > 0) {
    const stats = generateTopPickupsArtifact(options.csvPath);
    console.log(`[Archive] Top pickups (${stats.windowDays}d): ${stats.topPickups.join(', ')}`);
  }

  if (options.clearExisting) {
    await clearDeliveryData(prisma);
  }

  if (batch.length === 0) {
    console.log(`[Archive] No rows on or after ${options.since.toISOString().slice(0, 10)}.`);
    return 0;
  }

  const imported = await importCompletedArchiveRows(prisma, batch);
  console.log(
    `[Archive] Imported ${imported} completed deliveries (HIST-001..HIST-${String(imported).padStart(3, '0')}) since ${options.since.toISOString().slice(0, 10)}.`
  );
  return imported;
}
