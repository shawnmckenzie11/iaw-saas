import type { Waybill } from '../types/waybill';

/** Returns true when a waybill should be treated as rush service. */
export function isRushTierWaybill(wb: Waybill): boolean {
  return wb.priority === 'RUSH';
}

/**
 * Sorts dispatch Active Jobs with rush rows first, then newest capture time.
 */
export function sortDispatchActiveWaybills(waybills: Waybill[]): Waybill[] {
  return [...waybills].sort((a, b) => {
    const rushDelta = Number(isRushTierWaybill(b)) - Number(isRushTierWaybill(a));
    if (rushDelta !== 0) return rushDelta;

    const ta = new Date(a.capturedAt ?? a.createdAt ?? 0).getTime();
    const tb = new Date(b.capturedAt ?? b.createdAt ?? 0).getTime();
    return tb - ta;
  });
}

/**
 * Sorts a driver's delivery queue using dispatcher-assigned rank, then rush tier.
 */
export function sortDriverDeliveryQueue(waybills: Waybill[]): Waybill[] {
  return [...waybills].sort((a, b) => {
    const rankA = a.driverQueueRank ?? (isRushTierWaybill(a) ? 0 : 10_000);
    const rankB = b.driverQueueRank ?? (isRushTierWaybill(b) ? 0 : 10_000);
    if (rankA !== rankB) return rankA - rankB;

    const rushDelta = Number(isRushTierWaybill(b)) - Number(isRushTierWaybill(a));
    if (rushDelta !== 0) return rushDelta;

    const ta = new Date(a.capturedAt ?? a.createdAt ?? 0).getTime();
    const tb = new Date(b.capturedAt ?? b.createdAt ?? 0).getTime();
    return ta - tb;
  });
}

/** Label shown beside rush waybills in dashboard tables. */
export function priorityBadgeLabel(wb: Waybill): 'RUSH' | null {
  return wb.priority === 'RUSH' ? 'RUSH' : null;
}
