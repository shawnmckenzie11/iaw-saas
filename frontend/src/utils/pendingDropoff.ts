import type { Waybill } from '../types/waybill';

/**
 * Returns true when dropoff is still the placeholder from "Log Pickup Hand Off Later".
 */
export function hasPendingDropoff(
  waybill: Pick<Waybill, 'dropoffDestinationName' | 'dropoffAddress'>
): boolean {
  const dest = (waybill.dropoffDestinationName ?? '').trim().toLowerCase();
  const addr = (waybill.dropoffAddress ?? '').trim().toLowerCase();

  if (!dest && !addr) return true;
  if (dest.includes('pending dropoff') || dest === 'pending') return true;
  if (addr.includes('pending address') || addr === 'pending') return true;

  return false;
}
