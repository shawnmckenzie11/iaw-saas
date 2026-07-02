import { useEffect, useMemo, useState } from 'react';
import LocationQuickSelect from '../components/LocationQuickSelect';
import { queueEvent } from '../db/indexedDb';
import {
  TOP_PICKUPS,
  addressForLocation,
  coordsForLocation,
  locationSuggestions,
} from '../data/locationSuggestions';
import type { AuthSession } from '../services/auth';
import { syncManager } from '../services/SyncManager';
import type { Waybill } from '../types/waybill';
import { calculatePrice } from '../utils/pricing';

interface PickupPageProps {
  session: AuthSession;
  isOnline: boolean;
  editWaybill?: Waybill | null;
  onBack: () => void;
}

const STANDARD_DESCRIPTION = 'Standard Package';
const UNDER_75_WEIGHT = 'Weight: Under 75';

/**
 * Validates custom over-75 weight entry (integer strictly greater than 75).
 */
function isValidCustomWeight(value: string): boolean {
  if (!/^\d+$/.test(value.trim())) return false;
  return parseInt(value.trim(), 10) > 75;
}

/**
 * Three-step pickup wizard ported from mobile PickupScreen (main branch).
 * New pickups save at step 2; continuing a dispatch-assigned DRAFT emits WAYBILL_PICKED_UP.
 */
export default function PickupPage({ session, isOnline, editWaybill = null, onBack }: PickupPageProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState('');

  const [pickupLocation, setPickupLocation] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupContact, setPickupContact] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');

  const [dropoffDestination, setDropoffDestination] = useState('');
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffContact, setDropoffContact] = useState('');
  const [dropoffPhone, setDropoffPhone] = useState('');

  const [description, setDescription] = useState(STANDARD_DESCRIPTION);
  const [descriptionOption, setDescriptionOption] = useState(STANDARD_DESCRIPTION);
  const [weightClass, setWeightClass] = useState('');
  const [weightClassOption, setWeightClassOption] = useState(UNDER_75_WEIGHT);
  const [skidRequired, setSkidRequired] = useState(false);
  const [podRequired, setPodRequired] = useState(false);
  const [optionalNotes, setOptionalNotes] = useState('');
  const [manualWaybill, setManualWaybill] = useState('');
  const [vehicleType, setVehicleType] = useState('CAR');
  const [priority, setPriority] = useState<'REGULAR' | 'RUSH'>('REGULAR');

  const [pickupIsOther, setPickupIsOther] = useState(false);
  const [dropoffIsOther, setDropoffIsOther] = useState(false);
  const [showAllPickups, setShowAllPickups] = useState(false);
  const [showAllDropoffs, setShowAllDropoffs] = useState(false);
  const [selectedPickupKey, setSelectedPickupKey] = useState<string | null>(null);

  const isEditing = !!editWaybill;
  const finalDesc = descriptionOption === 'Other' ? description : descriptionOption;
  const finalWeight =
    weightClassOption === 'Other' ? `Weight: ${weightClass.trim()} lbs` : weightClassOption;
  const pricingEst = useMemo(
    () => calculatePrice(pickupLocation, dropoffDestination || 'Pending Dropoff', finalWeight, skidRequired, priority),
    [dropoffDestination, finalWeight, pickupLocation, priority, skidRequired]
  );

  const filteredQuickPickups = useMemo(
    () => locationSuggestions.commonPickups.filter((name) => TOP_PICKUPS.includes(name)),
    []
  );
  const quickPickups = showAllPickups || filteredQuickPickups.length === 0
    ? locationSuggestions.commonPickups
    : filteredQuickPickups;

  const baseDropoffs = selectedPickupKey && locationSuggestions.conditionalDropoffs[selectedPickupKey]
    ? locationSuggestions.conditionalDropoffs[selectedPickupKey]
    : locationSuggestions.commonPickups.filter((name) => name !== pickupLocation);

  const filteredQuickDropoffs = baseDropoffs.filter((name) => TOP_PICKUPS.includes(name));
  const quickDropoffs = showAllDropoffs || filteredQuickDropoffs.length === 0
    ? baseDropoffs
    : filteredQuickDropoffs;

  /**
   * Hydrates wizard fields when continuing a dispatch-created pending pickup.
   */
  useEffect(() => {
    if (!editWaybill) return;

    const wb = editWaybill;
    setPickupLocation(wb.pickupLocationName);
    setPickupAddress(wb.pickupAddress);
    setPickupContact(wb.pickupContactName ?? '');
    setPickupPhone(wb.pickupContactPhone ?? '');

    setDropoffDestination(wb.dropoffDestinationName);
    setDropoffAddress(wb.dropoffAddress ?? '');
    setDropoffContact(wb.dropoffContactName ?? '');
    setDropoffPhone(wb.dropoffContactPhone ?? '');

    if (wb.parcelDescription === STANDARD_DESCRIPTION) {
      setDescriptionOption(STANDARD_DESCRIPTION);
      setDescription(STANDARD_DESCRIPTION);
    } else {
      setDescriptionOption('Other');
      setDescription(wb.parcelDescription);
    }

    const wClass = wb.parcelWeightClass ?? UNDER_75_WEIGHT;
    if (wClass === UNDER_75_WEIGHT) {
      setWeightClassOption(UNDER_75_WEIGHT);
      setWeightClass('');
    } else {
      setWeightClassOption('Other');
      const numeric = wClass.replace(/[^0-9]/g, '');
      setWeightClass(numeric);
    }

    setSkidRequired(wb.skidRequired ?? false);
    setPodRequired(wb.podRequired === true || wb.additionalComments === '__podRequired');
    setOptionalNotes(wb.optionalNotes ?? '');
    setVehicleType(wb.vehicleType ?? 'CAR');
    setPriority(wb.priority ?? 'REGULAR');

    if (wb.waybillNumber.startsWith('K')) {
      setManualWaybill(wb.waybillNumber);
    }

    const commonPickups = locationSuggestions.commonPickups;
    const commonDropoffs = locationSuggestions.conditionalDropoffs[wb.pickupLocationName] ?? [];
    setPickupIsOther(!commonPickups.includes(wb.pickupLocationName));
    setDropoffIsOther(!commonDropoffs.includes(wb.dropoffDestinationName));
    setSelectedPickupKey(wb.pickupLocationName);
    setCurrentStep(1);
  }, [editWaybill]);

  /**
   * Applies a pickup selection and auto-fills address metadata.
   */
  const handleSelectPickup = (name: string) => {
    setPickupLocation(name);
    setPickupIsOther(false);
    const address = addressForLocation(name);
    if (address) setPickupAddress(address);
    setSelectedPickupKey(name);
    setDropoffDestination('');
    setDropoffAddress('');
    setDropoffIsOther(false);
  };

  /**
   * Applies a dropoff selection and auto-fills address metadata.
   */
  const handleSelectDropoff = (name: string) => {
    setDropoffDestination(name);
    setDropoffIsOther(false);
    const address = addressForLocation(name);
    if (address) setDropoffAddress(address);
  };

  /**
   * Validates the active wizard step before navigation or submit.
   */
  const isStepValid = (): boolean => {
    if (currentStep === 1) {
      const isDescValid = descriptionOption === 'Other' ? !!description.trim() : true;
      const isWeightValid =
        weightClassOption === 'Other' ? isValidCustomWeight(weightClass) : true;
      const isManualWaybillValid = !manualWaybill.trim() || /^K\d{5}$/.test(manualWaybill.trim());
      return !!pickupLocation && !!pickupAddress && isDescValid && isWeightValid && isManualWaybillValid;
    }
    if (currentStep === 2) {
      return !!dropoffDestination && !!dropoffAddress;
    }
    return true;
  };

  /**
   * Builds the shared event payload for create or pickup-complete flows.
   */
  const buildEventData = () => {
    const coordsP = coordsForLocation(pickupLocation);
    const coordsD = coordsForLocation(dropoffDestination);
    return {
      pickupLocationName: pickupLocation,
      pickupAddress,
      pickupContactName: pickupContact || undefined,
      pickupContactPhone: pickupPhone || undefined,
      pickupLatitude: coordsP.lat,
      pickupLongitude: coordsP.lon,
      parcelDescription: finalDesc,
      parcelWeightClass: finalWeight,
      dropoffDestinationName: dropoffDestination,
      dropoffAddress,
      dropoffContactName: dropoffContact || undefined,
      dropoffContactPhone: dropoffPhone || undefined,
      dropoffLatitude: coordsD.lat,
      dropoffLongitude: coordsD.lon,
      driverId: session.driverId,
      vehicleType,
      priority,
      skidRequired,
      podRequired,
      optionalNotes: optionalNotes || undefined,
      calculatedPrice: pricingEst.price,
      priceCategory: pricingEst.category,
    };
  };

  /**
   * Queues WAYBILL_CREATED plus WAYBILL_PICKED_UP for a new driver capture.
   */
  const queueNewWaybillEvents = async (
    waybillNumber: string,
    clientId: string,
    eventData: ReturnType<typeof buildEventData>,
    dropoffPending: boolean
  ) => {
    const pickedUpAt = new Date().toISOString();
    const payload = dropoffPending
      ? {
          ...eventData,
          dropoffDestinationName: 'Pending Dropoff',
          dropoffAddress: 'Pending Address',
        }
      : eventData;

    await queueEvent({
      id: clientId,
      clientSideUuid: clientId,
      waybillNumber,
      eventType: 'WAYBILL_CREATED',
      timestamp: pickedUpAt,
      data: { ...payload, waybillNumber },
    });

    const pickId = crypto.randomUUID();
    await queueEvent({
      id: pickId,
      clientSideUuid: clientId,
      waybillNumber,
      eventType: 'WAYBILL_PICKED_UP',
      timestamp: pickedUpAt,
      data: { ...payload, pickedUpAt },
    });
  };

  /**
   * Saves pickup-only (hand off to another driver for dropoff later).
   */
  const persistPickupOnly = async () => {
    if (!isStepValid()) {
      if (weightClassOption === 'Other' && !isValidCustomWeight(weightClass)) {
        setErrorMsg('Weight must be a whole number greater than 75 lbs.');
      } else {
        setErrorMsg('Please complete all required fields (*).');
      }
      return;
    }
    setErrorMsg('');
    const pickedUpAt = new Date().toISOString();
    const eventData = buildEventData();
    const pendingPayload = {
      ...eventData,
      dropoffDestinationName: 'Pending Dropoff',
      dropoffAddress: 'Pending Address',
    };

    if (isEditing && editWaybill) {
      const eventId = crypto.randomUUID();
      await queueEvent({
        id: eventId,
        clientSideUuid: editWaybill.clientSideUuid ?? eventId,
        waybillNumber: editWaybill.waybillNumber,
        eventType: 'WAYBILL_PICKED_UP',
        timestamp: pickedUpAt,
        data: { ...pendingPayload, pickedUpAt },
      });
    } else {
      const id = crypto.randomUUID();
      const waybillNumber = manualWaybill.trim() || `W-${Date.now().toString().slice(-4)}`;
      await queueNewWaybillEvents(waybillNumber, id, eventData, true);
    }

    await syncManager.refresh();
    if (isOnline && session.token) {
      void syncManager.syncQueue(session);
    }
    onBack();
  };

  /**
   * Queues the waybill event locally and optionally syncs online.
   */
  const persistWaybill = async () => {
    const pickedUpAt = new Date().toISOString();
    const eventData = buildEventData();

    if (isEditing && editWaybill) {
      const eventId = crypto.randomUUID();
      await queueEvent({
        id: eventId,
        clientSideUuid: editWaybill.clientSideUuid ?? eventId,
        waybillNumber: editWaybill.waybillNumber,
        eventType: 'WAYBILL_PICKED_UP',
        timestamp: pickedUpAt,
        data: { ...eventData, pickedUpAt },
      });
    } else {
      const id = crypto.randomUUID();
      const waybillNumber = manualWaybill.trim() || `W-${Date.now().toString().slice(-4)}`;
      await queueNewWaybillEvents(waybillNumber, id, eventData, false);
    }

    await syncManager.refresh();
    if (isOnline && session.token) {
      void syncManager.syncQueue(session);
    }
    onBack();
  };

  /**
   * Advances the wizard or saves at step 2 (matching mobile PickupScreen).
   */
  const handleNext = async () => {
    if (!isStepValid()) {
      if (weightClassOption === 'Other' && !isValidCustomWeight(weightClass)) {
        setErrorMsg('Weight must be a whole number greater than 75 lbs.');
      } else {
        setErrorMsg('Please complete all required fields (*).');
      }
      return;
    }
    setErrorMsg('');
    if (currentStep === 2) {
      await persistWaybill();
      return;
    }
    setCurrentStep((s) => s + 1);
  };

  /**
   * Navigates to the previous step or exits the wizard.
   */
  const handleBack = () => {
    setErrorMsg('');
    if (currentStep === 1) {
      onBack();
      return;
    }
    setCurrentStep((s) => s - 1);
  };

  /**
   * Normalizes manual waybill input to K##### format.
   */
  const handleManualWaybillChange = (text: string) => {
    let cleaned = text.toUpperCase();
    if (cleaned.length > 0 && !cleaned.startsWith('K')) {
      cleaned = `K${cleaned.replace(/[^0-9]/g, '')}`;
    } else {
      cleaned = `K${cleaned.slice(1).replace(/[^0-9]/g, '')}`;
    }
    if (cleaned.length > 6) cleaned = cleaned.slice(0, 6);
    setManualWaybill(cleaned === 'K' ? '' : cleaned);
  };

  /**
   * Restricts custom weight input to integer digits only.
   */
  const handleCustomWeightChange = (text: string) => {
    setWeightClass(text.replace(/[^0-9]/g, ''));
  };

  return (
    <div className="form-page pickup-page pickup-wizard">
      <header className="pickup-header">
        <button type="button" className="back-header-btn" onClick={handleBack}>
          ← {currentStep === 1 ? 'Exit' : 'Back'}
        </button>
        <h2 className="pickup-title">
          {isEditing ? `Continue Pickup — ${editWaybill?.waybillNumber}` : 'New Delivery Capture'}
        </h2>
      </header>

      <div className="wizard-steps stepper-3">
        {['Pickup', 'Dropoff', 'Sign'].map((label, index) => {
          const step = index + 1;
          const done = currentStep > step;
          const active = currentStep === step;
          return (
            <div key={label} className={`step-indicator ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
              <span className="step-badge">{done ? '✓' : step}</span>
              <span className="step-label">{label}</span>
            </div>
          );
        })}
      </div>

      {errorMsg && <div className="login-error">{errorMsg}</div>}

      {currentStep === 1 && (
        <div className="wizard-card">
          <LocationQuickSelect
            label="Quick Select Pickup Location:"
            quickOptions={quickPickups}
            fullOptions={locationSuggestions.commonPickups}
            selected={pickupLocation}
            isOther={pickupIsOther}
            showAll={showAllPickups}
            onSelect={handleSelectPickup}
            onOther={() => {
              setPickupIsOther(true);
              setPickupLocation('');
              setPickupAddress('');
              setPickupContact('');
              setPickupPhone('');
              setSelectedPickupKey(null);
            }}
            onShowAll={() => setShowAllPickups(true)}
          />

          {pickupIsOther && (
            <div className="compact-frame">
              <div className="compact-frame-title">Pickup Details Verification</div>

              <label className="field-label">Pickup Location Name *</label>
              <input
                className="wizard-input"
                value={pickupLocation}
                onChange={(e) => {
                  setPickupLocation(e.target.value);
                  setSelectedPickupKey(null);
                }}
                placeholder="Location name"
                required
              />

              <label className="field-label">Pickup Address *</label>
              <input
                className="wizard-input"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="Street Address"
                required
              />

              <div className="form-row-2col">
                <div>
                  <label className="field-label">Contact Person</label>
                  <input
                    className="wizard-input"
                    value={pickupContact}
                    onChange={(e) => setPickupContact(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div>
                  <label className="field-label">Phone Number</label>
                  <input
                    className="wizard-input"
                    value={pickupPhone}
                    onChange={(e) => setPickupPhone(e.target.value)}
                    placeholder="Phone"
                    type="tel"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="compact-frame">
            <div className="compact-frame-title">Delivery Details</div>

            {!isEditing && (
              <>
                <label className="field-label">Optional Manual Waybill #</label>
                <input
                  className="wizard-input"
                  value={manualWaybill}
                  onChange={(e) => handleManualWaybillChange(e.target.value)}
                  placeholder="Starts with K followed by 5 digits (e.g. K00001)"
                  maxLength={6}
                />
                {manualWaybill.trim().length > 0 && !/^K\d{5}$/.test(manualWaybill.trim()) && (
                  <p className="field-error">⚠️ Must be K followed by 5 digits (e.g. K00001)</p>
                )}
              </>
            )}

            <label className="field-label">Delivery Details *</label>
            <div className="picker-row">
              {[STANDARD_DESCRIPTION, 'Other'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={descriptionOption === opt ? 'picker-option active' : 'picker-option'}
                  onClick={() => {
                    setDescriptionOption(opt);
                    setDescription(opt === 'Other' ? '' : STANDARD_DESCRIPTION);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
            {descriptionOption === 'Other' && (
              <input
                className="wizard-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Note any important details or challenges for dispatch..."
                required
              />
            )}

            <label className="field-label">Weight Range *</label>
            <div className="picker-row">
              {[UNDER_75_WEIGHT, 'Other'].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={weightClassOption === opt ? 'picker-option active' : 'picker-option'}
                  onClick={() => {
                    setWeightClassOption(opt);
                    if (opt !== 'Other') {
                      setWeightClass('');
                    }
                  }}
                >
                  {opt === 'Other' ? 'Enter weight' : opt.replace('Weight: ', '')}
                </button>
              ))}
            </div>
            {weightClassOption === 'Other' && (
              <>
                <input
                  className="wizard-input"
                  value={weightClass}
                  onChange={(e) => handleCustomWeightChange(e.target.value)}
                  placeholder="Enter whole number over 75 lbs"
                  inputMode="numeric"
                />
                {weightClass.trim().length > 0 && !isValidCustomWeight(weightClass) && (
                  <p className="field-error">⚠️ Weight must be a whole number greater than 75 lbs.</p>
                )}
              </>
            )}

            <button type="button" className="option-toggle" onClick={() => setSkidRequired((v) => !v)}>
              <span className={`custom-checkbox ${skidRequired ? 'checked' : ''}`}>
                {skidRequired && '✓'}
              </span>
              <span>Skid Required (+$20)</span>
            </button>
            <button type="button" className="option-toggle" onClick={() => setPriority((p) => (p === 'RUSH' ? 'REGULAR' : 'RUSH'))}>
              <span className={`custom-checkbox ${priority === 'RUSH' ? 'checked' : ''}`}>
                {priority === 'RUSH' && '✓'}
              </span>
              <span>Rush Delivery (Priority) (+$15)</span>
            </button>
            <button type="button" className="option-toggle" onClick={() => setPodRequired((v) => !v)}>
              <span className={`custom-checkbox ${podRequired ? 'checked' : ''}`}>
                {podRequired && '✓'}
              </span>
              <span>Proof of Delivery Required (Signature &amp; Signoff)</span>
            </button>
          </div>

          <div className="checkout-options-row">
            <button
              type="button"
              className="btn-secondary checkout-btn"
              disabled={!isStepValid()}
              onClick={() => void persistPickupOnly()}
            >
              🚚 Log Pickup (Hand Off Later)
            </button>
            <button
              type="button"
              className="btn-primary checkout-btn"
              disabled={!isStepValid()}
              onClick={() => void handleNext()}
            >
              Confirm Drop Off Location ➡
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="wizard-card">
          <LocationQuickSelect
            label="Quick Select Dropoff Destination:"
            quickOptions={quickDropoffs}
            fullOptions={baseDropoffs}
            selected={dropoffDestination}
            isOther={dropoffIsOther}
            showAll={showAllDropoffs}
            onSelect={handleSelectDropoff}
            onOther={() => {
              setDropoffIsOther(true);
              setDropoffDestination('');
              setDropoffAddress('');
              setDropoffContact('');
              setDropoffPhone('');
            }}
            onShowAll={() => setShowAllDropoffs(true)}
          />

          {dropoffIsOther && (
            <div className="compact-frame">
              <div className="compact-frame-title">Dropoff Details Verification</div>

              <label className="field-label">Dropoff Destination *</label>
              <input
                className="wizard-input"
                value={dropoffDestination}
                onChange={(e) => setDropoffDestination(e.target.value)}
                placeholder="Destination name"
                required
              />

              <label className="field-label">Dropoff Address *</label>
              <input
                className="wizard-input"
                value={dropoffAddress}
                onChange={(e) => setDropoffAddress(e.target.value)}
                placeholder="Street Address"
                required
              />

              <div className="form-row-2col">
                <div>
                  <label className="field-label">Contact Person</label>
                  <input
                    className="wizard-input"
                    value={dropoffContact}
                    onChange={(e) => setDropoffContact(e.target.value)}
                    placeholder="Name"
                  />
                </div>
                <div>
                  <label className="field-label">Phone Number</label>
                  <input
                    className="wizard-input"
                    value={dropoffPhone}
                    onChange={(e) => setDropoffPhone(e.target.value)}
                    placeholder="Phone"
                    type="tel"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="price-preview">
            <span className="price-preview-label">Route Quote</span>
            {pricingEst.price > 0
              ? `$${pricingEst.price.toFixed(2)} — ${pricingEst.category}`
              : `Manual — ${pricingEst.category}`}
          </div>

          <div className="navigation-row">
            <button type="button" className="btn-primary nav-btn-next" disabled={!isStepValid()} onClick={() => void handleNext()}>
              {isEditing ? '💾 COMPLETE PICKUP' : '💾 COMPLETE PICKUP & LOG WAYBILL'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
