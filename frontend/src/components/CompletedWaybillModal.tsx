import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { driverFirstName } from '../data/drivers';
import { IAW_BUSINESS_EMAIL } from '../config/businessContact';
import { formatWaybillDate, formatWaybillTime } from '../utils/formatters';
import { getLocationShortName } from '../utils/pricing';
import { printWaybill } from '../utils/waybillPrint';
import { emailWaybill } from '../utils/waybillEmail';

interface CompletedWaybillModalProps {
  waybill: Waybill;
  onClose: () => void;
}

/**
 * Returns true when the waybill has a captured electronic signature.
 */
function hasSignature(wb: Waybill): boolean {
  return Boolean(wb.signatureImageUrl || wb.signatureName);
}

/**
 * Returns true when the waybill has a proof-of-delivery photo.
 */
function hasProofPhoto(wb: Waybill): boolean {
  return Boolean(wb.proofPhotoUrl);
}

/**
 * Modal detail view for a completed waybill with print and email actions.
 */
export default function CompletedWaybillModal({ waybill, onClose }: CompletedWaybillModalProps) {
  const timestamp = waybill.deliveredAt ?? waybill.capturedAt ?? waybill.createdAt;
  const price = waybillPrice(waybill);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content completed-waybill-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Waybill {waybill.waybillNumber}</h3>

        <div className="capture-badges">
          {hasSignature(waybill) && (
            <span className="capture-badge" title="Signature captured">
              ✍️ Signature
            </span>
          )}
          {hasProofPhoto(waybill) && (
            <span className="capture-badge" title="Proof photo captured">
              📷 Photo
            </span>
          )}
          {!hasSignature(waybill) && !hasProofPhoto(waybill) && (
            <span className="capture-badge muted">No capture attachments</span>
          )}
        </div>

        <div className="modal-details">
          <div>Date: {formatWaybillDate(timestamp)} {formatWaybillTime(timestamp)}</div>
          <div>Driver: {driverFirstName(waybill.driverId)}</div>
          <div>Status: Completed</div>
          <div>Cargo: {waybill.parcelDescription}</div>
          <div>
            Route: {getLocationShortName(waybill.pickupLocationName)} ➡️{' '}
            {getLocationShortName(waybill.dropoffDestinationName)}
          </div>
          <div>Pickup: {waybill.pickupLocationName}</div>
          <div>Dropoff: {waybill.dropoffDestinationName}</div>
          {waybill.signatureName && <div>Signed by: {waybill.signatureName}</div>}
          <div>Amount: ${price.toFixed(2)}</div>
        </div>

        {(waybill.signatureImageUrl || waybill.proofPhotoUrl) && (
          <div className="completed-waybill-previews">
            {waybill.signatureImageUrl && (
              <div className="preview-block">
                <label>Signature</label>
                <img src={waybill.signatureImageUrl} alt="Signature" className="waybill-preview-img" />
              </div>
            )}
            {waybill.proofPhotoUrl && (
              <div className="preview-block">
                <label>Proof Photo</label>
                <img src={waybill.proofPhotoUrl} alt="Proof of delivery" className="waybill-preview-img" />
              </div>
            )}
          </div>
        )}

        <p className="completed-email-note">Email sends to {IAW_BUSINESS_EMAIL}</p>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-secondary" onClick={() => emailWaybill(waybill)}>
            ✉️ Email
          </button>
          <button type="button" className="btn-primary" onClick={() => printWaybill(waybill)}>
            🖨️ Print
          </button>
        </div>
      </div>
    </div>
  );
}
