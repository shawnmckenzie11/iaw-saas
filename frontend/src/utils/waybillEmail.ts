import { IAW_BUSINESS_EMAIL } from '../config/businessContact';
import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { driverFirstNameFromRoster, getDriverRoster } from '../services/driverRoster';
import { getLocationShortName } from './pricing';

/**
 * Builds a mailto URL with a pre-filled waybill summary for dispatcher email actions.
 */
export function buildWaybillMailtoUrl(waybill: Waybill): string {
  const timestamp = waybill.deliveredAt ?? waybill.capturedAt ?? waybill.createdAt ?? new Date().toISOString();
  const formattedDate = new Date(timestamp).toLocaleString('en-US');
  const price = waybillPrice(waybill);
  const hasSignature = Boolean(waybill.signatureImageUrl || waybill.signatureName);
  const hasProof = Boolean(waybill.proofPhotoUrl);

  const subject = `IAW Waybill ${waybill.waybillNumber} — Delivery Receipt`;
  const body = [
    'IAW Courier — Completed Waybill Summary',
    '',
    `Waybill #: ${waybill.waybillNumber}`,
    `Date: ${formattedDate}`,
    `Driver: ${driverFirstNameFromRoster(waybill.driverId, getDriverRoster())}`,
    `Route: ${getLocationShortName(waybill.pickupLocationName)} → ${getLocationShortName(waybill.dropoffDestinationName)}`,
    `Pickup: ${waybill.pickupLocationName}`,
    `Dropoff: ${waybill.dropoffDestinationName}`,
    `Cargo: ${waybill.parcelDescription}`,
    `Amount: $${price.toFixed(2)}`,
    `Signature captured: ${hasSignature ? 'Yes' : 'No'}`,
    hasSignature && waybill.signatureName ? `Signed by: ${waybill.signatureName}` : '',
    `Proof photo captured: ${hasProof ? 'Yes' : 'No'}`,
    '',
    'Use Print on the waybill detail view to attach a PDF copy if needed.',
    '',
    '— IAW Courier Dispatch',
  ]
    .filter(Boolean)
    .join('\n');

  const params = new URLSearchParams({
    subject,
    body,
  });

  return `mailto:${IAW_BUSINESS_EMAIL}?${params.toString()}`;
}

/**
 * Opens the default mail client with a pre-filled waybill summary.
 */
export function emailWaybill(waybill: Waybill): void {
  window.location.href = buildWaybillMailtoUrl(waybill);
}
