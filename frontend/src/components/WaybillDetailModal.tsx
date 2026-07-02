import { useState } from 'react';
import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { driverFirstNameFromRoster, type DriverRosterEntry } from '../services/driverRoster';
import { IAW_BUSINESS_EMAIL } from '../config/businessContact';
import { formatWaybillDate, formatWaybillTime } from '../utils/formatters';
import { getLocationShortName } from '../utils/pricing';
import { printWaybill } from '../utils/waybillPrint';
import { emailWaybill } from '../utils/waybillEmail';

export type WaybillEditDraft = {
  pickupLocationName: string;
  pickupAddress: string;
  dropoffDestinationName: string;
  dropoffAddress: string;
  parcelDescription: string;
  pricingTotalCost: string;
};

interface WaybillDetailModalProps {
  waybill: Waybill;
  mode: 'pending-price' | 'completed';
  driverRoster: DriverRosterEntry[];
  onClose: () => void;
  onSave: (draft: WaybillEditDraft) => Promise<void>;
  onDelete: () => Promise<void>;
}

/**
 * Builds an editable draft from a waybill record.
 */
export function buildWaybillEditDraft(waybill: Waybill): WaybillEditDraft {
  const price = waybillPrice(waybill);
  return {
    pickupLocationName: waybill.pickupLocationName,
    pickupAddress: waybill.pickupAddress ?? waybill.pickupLocationName,
    dropoffDestinationName: waybill.dropoffDestinationName,
    dropoffAddress: waybill.dropoffAddress ?? waybill.dropoffDestinationName,
    parcelDescription: waybill.parcelDescription,
    pricingTotalCost: price > 0 ? price.toFixed(2) : '',
  };
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
 * Modal for pending-price and completed waybills with edit, delete, print, and email actions.
 */
export default function WaybillDetailModal({
  waybill,
  mode,
  driverRoster,
  onClose,
  onSave,
  onDelete,
}: WaybillDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<WaybillEditDraft>(() => buildWaybillEditDraft(waybill));
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const timestamp = waybill.deliveredAt ?? waybill.capturedAt ?? waybill.createdAt;
  const price = waybillPrice(waybill);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content completed-waybill-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          {mode === 'pending-price' ? 'Pending Price — ' : ''}
          Waybill {waybill.waybillNumber}
        </h3>

        {mode === 'completed' && (
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
        )}

        {isEditing ? (
          <div className="waybill-edit-form">
            <label>
              Pickup location
              <input
                value={draft.pickupLocationName}
                onChange={(e) => setDraft((prev) => ({ ...prev, pickupLocationName: e.target.value }))}
              />
            </label>
            <label>
              Pickup address
              <input
                value={draft.pickupAddress}
                onChange={(e) => setDraft((prev) => ({ ...prev, pickupAddress: e.target.value }))}
              />
            </label>
            <label>
              Dropoff location
              <input
                value={draft.dropoffDestinationName}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, dropoffDestinationName: e.target.value }))
                }
              />
            </label>
            <label>
              Dropoff address
              <input
                value={draft.dropoffAddress}
                onChange={(e) => setDraft((prev) => ({ ...prev, dropoffAddress: e.target.value }))}
              />
            </label>
            <label>
              Cargo / parcel
              <input
                value={draft.parcelDescription}
                onChange={(e) => setDraft((prev) => ({ ...prev, parcelDescription: e.target.value }))}
              />
            </label>
            <label>
              Price ($)
              <input
                value={draft.pricingTotalCost}
                onChange={(e) => setDraft((prev) => ({ ...prev, pricingTotalCost: e.target.value }))}
                placeholder={mode === 'pending-price' ? 'Required to complete' : 'Optional'}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="modal-details">
              <div>
                Date: {formatWaybillDate(timestamp)} {formatWaybillTime(timestamp)}
              </div>
              <div>Driver: {driverFirstNameFromRoster(waybill.driverId, driverRoster)}</div>
              <div>Status: {mode === 'pending-price' ? 'Pending Price' : 'Completed'}</div>
              <div>Cargo: {waybill.parcelDescription}</div>
              <div>
                Route: {getLocationShortName(waybill.pickupLocationName)} ➡️{' '}
                {getLocationShortName(waybill.dropoffDestinationName)}
              </div>
              <div>Pickup: {waybill.pickupLocationName}</div>
              <div>Dropoff: {waybill.dropoffDestinationName}</div>
              {waybill.signatureName && <div>Signed by: {waybill.signatureName}</div>}
              <div>Amount: {price > 0 ? `$${price.toFixed(2)}` : '—'}</div>
            </div>

            {mode === 'pending-price' && (
              <label className="pending-price-quote-label">
                Enter Quote Price ($) *
                <input
                  value={draft.pricingTotalCost}
                  onChange={(e) => setDraft((prev) => ({ ...prev, pricingTotalCost: e.target.value }))}
                  placeholder="e.g. 75.00"
                  autoFocus
                />
              </label>
            )}
          </>
        )}

        {mode === 'completed' && !isEditing && (waybill.signatureImageUrl || waybill.proofPhotoUrl) && (
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

        {showDeleteConfirm ? (
          <div className="delete-confirm-inline">
            <p>Void this waybill? It will be removed from dispatch lists.</p>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                disabled={isDeleting}
                onClick={() => void handleDelete()}
              >
                {isDeleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {mode === 'completed' && !isEditing && (
              <p className="completed-email-note">Email sends to {IAW_BUSINESS_EMAIL}</p>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Close
              </button>
              {!isEditing && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => setShowDeleteConfirm(true)}>
                    🗑 Delete
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setDraft(buildWaybillEditDraft(waybill));
                      setIsEditing(true);
                    }}
                  >
                    ✏️ Edit
                  </button>
                </>
              )}
              {isEditing && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setDraft(buildWaybillEditDraft(waybill));
                      setIsEditing(false);
                    }}
                  >
                    Cancel Edit
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={
                      isSaving ||
                      !draft.pickupLocationName.trim() ||
                      !draft.dropoffDestinationName.trim()
                    }
                    onClick={() => void handleSave()}
                  >
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
              {mode === 'completed' && !isEditing && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => emailWaybill(waybill)}>
                    ✉️ Email
                  </button>
                  <button type="button" className="btn-primary" onClick={() => printWaybill(waybill)}>
                    🖨️ Print
                  </button>
                </>
              )}
              {mode === 'pending-price' && !isEditing && (
                <button
                  type="button"
                  className="btn-primary"
                  disabled={isSaving || !draft.pricingTotalCost.trim()}
                  onClick={() => void handleSave()}
                >
                  {isSaving ? 'Saving…' : 'Confirm Price'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
