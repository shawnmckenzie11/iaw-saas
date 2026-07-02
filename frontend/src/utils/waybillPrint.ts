import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { driverFirstNameFromRoster, getDriverRoster } from '../services/driverRoster';
import { getLocationShortName } from './pricing';

/**
 * Builds print-ready HTML for a single completed waybill receipt.
 */
export function buildWaybillPrintHtml(waybill: Waybill): string {
  const timestamp = waybill.deliveredAt ?? waybill.capturedAt ?? waybill.createdAt ?? new Date().toISOString();
  const formattedDate = new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
  const formattedTime = new Date(timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  const price = waybillPrice(waybill);
  const hasSignature = Boolean(waybill.signatureImageUrl || waybill.signatureName);
  const hasProof = Boolean(waybill.proofPhotoUrl);

  const signatureBlock = hasSignature
    ? `
      <div class="attachment-block">
        <h4>Electronic Signature</h4>
        ${waybill.signatureName ? `<p><strong>Signed by:</strong> ${waybill.signatureName}</p>` : ''}
        ${waybill.signatureImageUrl ? `<img src="${waybill.signatureImageUrl}" alt="Signature" class="signature-img" />` : ''}
      </div>
    `
    : '<p class="muted">No signature captured.</p>';

  const proofBlock = hasProof
    ? `
      <div class="attachment-block">
        <h4>Proof of Delivery Photo</h4>
        <img src="${waybill.proofPhotoUrl}" alt="Proof of delivery" class="proof-img" />
      </div>
    `
    : '<p class="muted">No proof photo captured.</p>';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Waybill ${waybill.waybillNumber}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1C1C1E;
      padding: 30px;
      font-size: 14px;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      border-bottom: 2px solid #FF3B30;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .header h1 {
      margin: 0;
      color: #FF3B30;
      font-size: 24px;
    }
    .meta { text-align: right; }
    .detail-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px 24px;
      margin-bottom: 24px;
    }
    .detail-grid label {
      display: block;
      font-size: 11px;
      color: #8E8E93;
      text-transform: uppercase;
      letter-spacing: 0.4px;
    }
    .detail-grid p { margin: 4px 0 0; font-weight: 500; }
    .route-box {
      background: #F2F2F7;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 24px;
    }
    .attachments {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }
    .attachment-block h4 { margin: 0 0 8px; }
    .signature-img, .proof-img {
      max-width: 100%;
      max-height: 180px;
      border: 1px solid #E5E5EA;
      border-radius: 6px;
    }
    .muted { color: #8E8E93; font-size: 13px; }
    .total-row {
      margin-top: 24px;
      text-align: right;
      font-size: 18px;
      font-weight: 700;
      color: #FF3B30;
    }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>IAW COURIER</h1>
      <p>Completed Waybill Receipt</p>
    </div>
    <div class="meta">
      <p><strong>${waybill.waybillNumber}</strong></p>
      <p>${formattedDate} ${formattedTime}</p>
    </div>
  </div>

  <div class="detail-grid">
    <div>
      <label>Driver</label>
      <p>${driverFirstNameFromRoster(waybill.driverId, getDriverRoster())}</p>
    </div>
    <div>
      <label>Status</label>
      <p>${waybill.status}</p>
    </div>
    <div>
      <label>Cargo</label>
      <p>${waybill.parcelDescription}</p>
    </div>
    <div>
      <label>Amount</label>
      <p>$${price.toFixed(2)}</p>
    </div>
  </div>

  <div class="route-box">
    <label>Route</label>
    <p><strong>From:</strong> ${waybill.pickupLocationName}</p>
    <p>${waybill.pickupAddress || ''}</p>
    <p style="margin-top: 12px;"><strong>To:</strong> ${waybill.dropoffDestinationName}</p>
    <p>${waybill.dropoffAddress || ''}</p>
    <p style="margin-top: 12px;">
      ${getLocationShortName(waybill.pickupLocationName)} ➡️ ${getLocationShortName(waybill.dropoffDestinationName)}
    </p>
  </div>

  <div class="attachments">
    ${signatureBlock}
    ${proofBlock}
  </div>

  <div class="total-row">Total: $${price.toFixed(2)}</div>
</body>
</html>`;
}

/**
 * Opens a print-ready waybill window and triggers the browser print dialog.
 */
export function printWaybill(waybill: Waybill): void {
  const htmlContent = buildWaybillPrintHtml(waybill);
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    window.alert('Popup blocked — please allow popups to print waybills.');
    return;
  }
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => {
    printWindow.print();
  }, 300);
}
