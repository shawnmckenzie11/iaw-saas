import type { Waybill } from '../types/waybill';
import { isPendingDispatcherPrice } from './waybillPricing';

export type CompletedBucket = 'today' | 'week' | 'month';

export type PendingPriceBucket = 'today' | 'unassigned';

const BUCKET_LABELS: Record<CompletedBucket, string> = {
  today: "Today's",
  week: "This week's",
  month: "This month's",
};

/**
 * Returns calendar boundaries used to group completed deliveries.
 */
function getCompletedDateBoundaries(now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return { startOfToday, startOfWeek, startOfMonth };
}

/**
 * Resolves the delivery timestamp used for completed-history grouping.
 */
export function completedDeliveryTimestamp(wb: Waybill): Date | null {
  const raw = wb.deliveredAt ?? wb.capturedAt ?? wb.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Assigns a completed waybill to Today, This week, or This month buckets.
 */
export function bucketCompletedDelivery(wb: Waybill, now = new Date()): CompletedBucket | null {
  if (wb.status !== 'DELIVERED') return null;
  const deliveredAt = completedDeliveryTimestamp(wb);
  if (!deliveredAt) return null;

  const { startOfToday, startOfWeek, startOfMonth } = getCompletedDateBoundaries(now);
  if (deliveredAt < startOfMonth) return null;
  if (deliveredAt >= startOfToday) return 'today';
  if (deliveredAt >= startOfWeek) return 'week';
  return 'month';
}

/**
 * Groups completed deliveries into Today / This week / This month sections.
 */
export function groupCompletedDeliveries(
  waybills: Waybill[],
  now = new Date()
): Array<{ bucket: CompletedBucket; label: string; items: Waybill[] }> {
  const grouped: Record<CompletedBucket, Waybill[]> = {
    today: [],
    week: [],
    month: [],
  };

  for (const wb of waybills) {
    const bucket = bucketCompletedDelivery(wb, now);
    if (bucket) grouped[bucket].push(wb);
  }

  return (['today', 'week', 'month'] as const)
    .filter((bucket) => grouped[bucket].length > 0)
    .map((bucket) => ({
      bucket,
      label: BUCKET_LABELS[bucket],
      items: grouped[bucket],
    }));
}

const PENDING_PRICE_LABELS: Record<PendingPriceBucket, string> = {
  today: "Today's",
  unassigned: 'Unassigned',
};

/**
 * Groups pending-price deliveries into Today and older Unassigned sections.
 */
export function groupPendingPriceWaybills(
  waybills: Waybill[],
  now = new Date()
): Array<{ bucket: PendingPriceBucket; label: string; items: Waybill[] }> {
  const pending = waybills.filter(isPendingDispatcherPrice);
  const { startOfToday } = getCompletedDateBoundaries(now);
  const grouped: Record<PendingPriceBucket, Waybill[]> = {
    today: [],
    unassigned: [],
  };

  for (const wb of pending) {
    const deliveredAt = completedDeliveryTimestamp(wb);
    if (deliveredAt && deliveredAt >= startOfToday) {
      grouped.today.push(wb);
    } else {
      grouped.unassigned.push(wb);
    }
  }

  return (['today', 'unassigned'] as const).map((bucket) => ({
    bucket,
    label: PENDING_PRICE_LABELS[bucket],
    items: grouped[bucket],
  }));
}
