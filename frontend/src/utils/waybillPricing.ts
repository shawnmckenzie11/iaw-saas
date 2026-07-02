import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { calculatePrice } from './pricing';

/**
 * Resolves the operational price for a waybill using stored pricing or auto-rated routes.
 */
export function effectiveWaybillPrice(wb: Waybill): number {
  const stored = waybillPrice(wb);
  if (stored > 0) return stored;

  const quote = calculatePrice(
    wb.pickupLocationName,
    wb.dropoffDestinationName,
    wb.parcelWeightClass,
    wb.skidRequired ?? false,
    wb.priority
  );

  if (!quote.isManual && quote.price > 0) return quote.price;
  return 0;
}

/**
 * Returns true when a delivered waybill still needs a dispatcher price quote.
 */
export function isPendingDispatcherPrice(wb: Waybill): boolean {
  return wb.status === 'DELIVERED' && effectiveWaybillPrice(wb) <= 0;
}

/**
 * Returns true when a delivered waybill has a stored or auto-rated price.
 */
export function isCompletedPricedDelivery(wb: Waybill): boolean {
  return wb.status === 'DELIVERED' && effectiveWaybillPrice(wb) > 0;
}
