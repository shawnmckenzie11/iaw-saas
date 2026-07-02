import { useEffect, useMemo, useState } from 'react';
import { iawDb, queueEvent, removeSyncedEvents } from '../db/indexedDb';
import { FALLBACK_WAYBILLS } from '../data/fallbackWaybills';
import {
  DRIVER_ROSTER_CHANGED_EVENT,
  driverFirstNameFromRoster,
  fetchDriverRoster,
  getDriverRoster,
  type DriverRosterEntry,
} from '../services/driverRoster';
import type { AuthSession } from '../services/auth';
import { syncManager, type SyncStats } from '../services/SyncManager';
import type { Waybill } from '../types/waybill';
import { formatWaybillDate, formatWaybillTime, abbreviateCargo } from '../utils/formatters';
import { getLocationShortName } from '../utils/pricing';
import { mergeQueuedWaybills } from '../utils/queuedWaybills';
import { groupCompletedDeliveries, groupPendingPriceWaybills, type CompletedBucket, type PendingPriceBucket } from '../utils/completedDeliveries';
import { effectiveWaybillPrice, isCompletedPricedDelivery, isPendingDispatcherPrice } from '../utils/waybillPricing';
import {
  isRushTierWaybill,
  priorityBadgeLabel,
  sortDispatchActiveWaybills,
  sortDriverDeliveryQueue,
} from '../utils/waybillSort';
import { APP_BUILD } from '../config/appBuild';
import WaybillDetailModal, { type WaybillEditDraft } from '../components/WaybillDetailModal';
import { hasPendingDropoff } from '../utils/pendingDropoff';

export type { Waybill };

type QueuePosition = 'top' | 'bottom' | { afterWaybillNumber: string };

type AssignmentDraft = {
  driverId: string;
  priority: 'REGULAR' | 'RUSH';
  queuePosition: QueuePosition;
};

type DispatchTab = 'ACTIVE' | 'PENDING_PRICE' | 'COMPLETED';

interface DashboardProps {
  session: AuthSession;
  isOnline: boolean;
  syncStats: SyncStats;
  onToggleNetwork: () => void;
  onSignOut: () => void;
  onNewPickup: () => void;
  onContinuePickup: (waybill: Waybill) => void;
  onSignOff: (waybill: Waybill) => void;
  onOpenAccounting: () => void;
}

/**
 * Dispatcher assignment control: always shows driver chips so jobs with a
 * pre-set driver (driver-created) can be reassigned to another driver.
 */
function DispatchAssignmentCell({
  wb,
  drivers,
  onAssignClick,
}: {
  wb: Waybill;
  drivers: DriverRosterEntry[];
  onAssignClick: (driverId: string) => void;
}) {
  if (wb.status === 'DELIVERED') {
    return <span className="driver-chip-label">{driverFirstNameFromRoster(wb.driverId, drivers)}</span>;
  }

  return (
    <div className="assigned-row">
      <div className="driver-assign-chips">
        {drivers.map((driver) => (
          <button
            key={driver.id}
            type="button"
            className={`driver-assign-chip${wb.driverId === driver.id ? ' is-active' : ''}`}
            title={driver.firstName}
            aria-label={`Assign ${driver.firstName}`}
            aria-pressed={wb.driverId === driver.id}
            onClick={(e) => {
              e.stopPropagation();
              onAssignClick(driver.id);
            }}
          >
            {driver.firstName[0]}
          </button>
        ))}
      </div>
      {wb.driverId ? (
        <button
          type="button"
          className="btn-unassign"
          title="Unassign driver"
          aria-label="Unassign driver"
          onClick={(e) => {
            e.stopPropagation();
            onAssignClick('__unassign__');
          }}
        >
          X
        </button>
      ) : null}
    </div>
  );
}

/**
 * Returns a human-readable operational status label for dashboard tables.
 */
function statusLabel(status: string): string {
  if (status === 'DELIVERED') return 'Completed';
  if (status === 'DRAFT') return 'Pending-Pickup';
  if (status === 'PICKED_UP') return 'Pending-Delivery';
  return status;
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
 * Driver and dispatcher dashboard with tabular waybill views and sync counters.
 */
export default function DashboardPage({
  session,
  isOnline,
  syncStats,
  onToggleNetwork,
  onSignOut,
  onNewPickup,
  onContinuePickup,
  onSignOff,
  onOpenAccounting,
}: DashboardProps) {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
  const [dispatchTab, setDispatchTab] = useState<DispatchTab>('ACTIVE');
  const [completedSearchQuery, setCompletedSearchQuery] = useState('');
  const [completedStartDate, setCompletedStartDate] = useState('');
  const [completedEndDate, setCompletedEndDate] = useState('');
  const [completedDetailWaybill, setCompletedDetailWaybill] = useState<Waybill | null>(null);
  const [pendingPriceWaybill, setPendingPriceWaybill] = useState<Waybill | null>(null);
  const [deliverConfirmWaybill, setDeliverConfirmWaybill] = useState<Waybill | null>(null);
  const [driverRoster, setDriverRoster] = useState<DriverRosterEntry[]>(() => getDriverRoster());
  const [conflictEvents, setConflictEvents] = useState<Array<{ id: string; waybillNumber: string }>>([]);
  const [assignModalWaybill, setAssignModalWaybill] = useState<Waybill | null>(null);
  const [assignDraft, setAssignDraft] = useState<AssignmentDraft | null>(null);
  const [driverPreviewId, setDriverPreviewId] = useState<string | null>(null);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [completedExpandedBuckets, setCompletedExpandedBuckets] = useState<Set<CompletedBucket>>(
    new Set()
  );
  const [pendingPriceExpandedBuckets, setPendingPriceExpandedBuckets] = useState<Set<PendingPriceBucket>>(
    new Set(['today', 'unassigned'])
  );
  const [deleteConfirmWaybill, setDeleteConfirmWaybill] = useState<Waybill | null>(null);
  const isDispatcher = session.role === 'DISPATCHER';
  const isDriverPreview = isDispatcher && driverPreviewId !== null;
  const showDriverPortal = !isDispatcher || isDriverPreview;
  const hideDriverPricing = session.role === 'DRIVER';
  const previewDriverName = driverPreviewId
    ? driverFirstNameFromRoster(driverPreviewId, driverRoster)
    : null;

  /**
   * Loads the active driver roster from the admin API (dispatcher only).
   */
  const loadDriverRoster = async () => {
    if (!isDispatcher || !session.token) return;
    const roster = await fetchDriverRoster(session.token);
    setDriverRoster(roster);
  };

  useEffect(() => {
    void loadDriverRoster();
  }, [isDispatcher, session.token]);

  useEffect(() => {
    const onRosterChanged = () => void loadDriverRoster();
    window.addEventListener(DRIVER_ROSTER_CHANGED_EVENT, onRosterChanged);
    return () => window.removeEventListener(DRIVER_ROSTER_CHANGED_EVENT, onRosterChanged);
  }, [isDispatcher, session.token]);

  useEffect(() => {
    syncManager.refresh();
    const interval = window.setInterval(() => syncManager.refresh(), 200);
    const onPageShow = () => syncManager.refresh();
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    void iawDb.waybill_events.toArray().then((rows) => {
      setConflictEvents(
        rows
          .filter((r) => r.syncStatus === 'CONFLICT')
          .map((r) => ({ id: r.id, waybillNumber: r.waybillNumber }))
      );
    });
  }, [syncStats.conflictCount, syncStats.pendingCount]);

  /**
   * Persists merged API + local queue waybills to state and session cache.
   */
  const applyWaybillList = async (loaded: Waybill[]) => {
    const merged = await mergeQueuedWaybills(loaded);
    setWaybills(merged);
    sessionStorage.setItem('iaw_waybills', JSON.stringify(merged));
  };

  /**
   * Loads waybills from API with sessionStorage fallback for offline use.
   */
  const loadWaybills = async () => {
    let loaded: Waybill[] = [];

    if (isOnline) {
      try {
        const res = await fetch('/api/waybills', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (res.status === 401) {
          onSignOut();
          return;
        }
        if (res.ok) {
          loaded = (await res.json()) as Waybill[];
        }
      } catch {
        // fall through to cache below
      }
    }

    if (loaded.length === 0) {
      const cached = sessionStorage.getItem('iaw_waybills');
      if (cached) {
        try {
          loaded = JSON.parse(cached) as Waybill[];
        } catch {
          // ignore corrupt cache
        }
      }
    }

    if (loaded.length === 0) {
      loaded = FALLBACK_WAYBILLS;
    }

    await applyWaybillList(loaded);
  };

  useEffect(() => {
    void loadWaybills();
  }, [session.token, syncStats.pendingCount, syncStats.syncedCount]);

  /** Poll for assignment and intake updates while the dashboard is open. */
  useEffect(() => {
    if (!isOnline) return;
    const interval = window.setInterval(() => {
      void loadWaybills();
    }, 12000);
    const onFocus = () => void loadWaybills();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('pageshow', onFocus);
    };
  }, [isOnline, session.token]);

  /**
   * Opens the assignment modal with defaults based on rush tier and target driver queue.
   */
  const openAssignModal = (wb: Waybill, driverId: string) => {
    if (driverId === '__unassign__') {
      void handleAssignDriver(wb, null);
      return;
    }

    const rush = isRushTierWaybill(wb);
    setAssignModalWaybill(wb);
    setAssignDraft({
      driverId,
      priority: rush ? 'RUSH' : wb.priority ?? 'REGULAR',
      queuePosition: rush ? 'top' : 'bottom',
    });
  };

  /**
   * Posts a driver assignment event and refreshes local waybill cache.
   */
  const handleAssignDriver = async (
    wb: Waybill,
    driverId: string | null,
    options?: Omit<AssignmentDraft, 'driverId'>
  ) => {
    if (!isDispatcher) return;

    const nextPriority = options?.priority ?? wb.priority ?? 'REGULAR';

    setWaybills((prev) => {
      const next = prev.map((row) =>
        row.waybillNumber === wb.waybillNumber
          ? {
              ...row,
              driverId,
              priority: nextPriority,
            }
          : row
      );
      sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
      return next;
    });

    try {
      const body: Record<string, unknown> = { driverId };
      if (options) {
        body.priority = options.priority;
        if (options.queuePosition === 'top' || options.queuePosition === 'bottom') {
          body.queuePosition = options.queuePosition;
        } else if ('afterWaybillNumber' in options.queuePosition) {
          body.afterWaybillNumber = options.queuePosition.afterWaybillNumber;
        }
      }

      const res = await fetch(`/api/waybills/${wb.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'WAYBILL_ASSIGNED',
          data: body,
        }),
      });
      if (!res.ok) {
        await loadWaybills();
        return;
      }

      await loadWaybills();
    } catch {
      // optimistic update already applied for offline responsiveness
    }
  };

  /**
   * Confirms assignment modal choices and closes the dialog.
   */
  const handleConfirmAssignment = async () => {
    if (!assignModalWaybill || !assignDraft) return;
    await handleAssignDriver(assignModalWaybill, assignDraft.driverId, {
      priority: assignDraft.priority,
      queuePosition: assignDraft.queuePosition,
    });
    setAssignModalWaybill(null);
    setAssignDraft(null);
  };

  /**
   * Saves dispatcher corrections and optional price via event-sourced API calls.
   */
  const handleWaybillDetailSave = async (wb: Waybill, draft: WaybillEditDraft) => {
    const correctionData: Record<string, unknown> = {};
    if (draft.pickupLocationName.trim() !== wb.pickupLocationName) {
      correctionData.pickupLocationName = draft.pickupLocationName.trim();
    }
    if (draft.pickupAddress.trim() !== (wb.pickupAddress ?? wb.pickupLocationName)) {
      correctionData.pickupAddress = draft.pickupAddress.trim();
    }
    if (draft.dropoffDestinationName.trim() !== wb.dropoffDestinationName) {
      correctionData.dropoffDestinationName = draft.dropoffDestinationName.trim();
    }
    if (draft.dropoffAddress.trim() !== (wb.dropoffAddress ?? wb.dropoffDestinationName)) {
      correctionData.dropoffAddress = draft.dropoffAddress.trim();
    }
    if (draft.parcelDescription.trim() !== wb.parcelDescription) {
      correctionData.parcelDescription = draft.parcelDescription.trim();
    }

    const priceVal = draft.pricingTotalCost.trim() ? parseFloat(draft.pricingTotalCost) : NaN;
    const hasPrice = !Number.isNaN(priceVal) && priceVal >= 0;
    const storedPrice = effectiveWaybillPrice(wb);
    const priceChanged = hasPrice && priceVal !== storedPrice;

    if (priceChanged) {
      correctionData.pricingTotalCost = priceVal;
    }

    if (Object.keys(correctionData).length > 0) {
      const eventType =
        Object.keys(correctionData).length === 1 && priceChanged && correctionData.pricingTotalCost !== undefined
          ? 'DISPATCHER_OVERRIDE'
          : 'DISPATCHER_CORRECTION';

      await fetch(`/api/waybills/${wb.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType,
          data: correctionData,
        }),
      });
    }

    await loadWaybills();
    setCompletedDetailWaybill(null);
    setPendingPriceWaybill(null);
    if (hasPrice && wb.status === 'DELIVERED' && effectiveWaybillPrice(wb) <= 0) {
      setDispatchTab('COMPLETED');
    }
  };

  /**
   * Voids a waybill from pending-price or completed modals (dispatcher only).
   */
  const handleWaybillDetailDelete = async (wb: Waybill) => {
    const res = await fetch(`/api/waybills/${wb.waybillNumber}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        eventType: 'WAYBILL_VOIDED',
        data: {},
      }),
    });

    if (res.ok) {
      setWaybills((prev) => {
        const next = prev.filter((row) => row.waybillNumber !== wb.waybillNumber);
        sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
        return next;
      });
    } else {
      await loadWaybills();
    }

    setCompletedDetailWaybill(null);
    setPendingPriceWaybill(null);
  };

  /**
   * Marks a non-POD waybill delivered after driver confirmation (no signature required).
   */
  const handleConfirmDelivery = async (wb: Waybill) => {
    if (hasPendingDropoff(wb)) {
      setDeliverConfirmWaybill(null);
      onContinuePickup(wb);
      return;
    }

    const eventId = crypto.randomUUID();
    const deliveredAt = new Date().toISOString();

    await queueEvent({
      id: eventId,
      clientSideUuid: eventId,
      waybillNumber: wb.waybillNumber,
      eventType: 'WAYBILL_DELIVERED',
      timestamp: deliveredAt,
      data: { deliveredAt },
    });

    await syncManager.refresh();

    if (isOnline && session.token) {
      const res = await fetch(`/api/waybills/${wb.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'WAYBILL_DELIVERED',
          data: { deliveredAt },
        }),
      }).catch(() => undefined);
      if (res?.ok) {
        await removeSyncedEvents([eventId]);
      }
      await syncManager.syncQueue(session);
    }

    setWaybills((prev) => {
      const next = prev.map((row) =>
        row.waybillNumber === wb.waybillNumber
          ? { ...row, status: 'DELIVERED', deliveredAt }
          : row
      );
      sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
      return next;
    });
    setDeliverConfirmWaybill(null);
  };

  /**
   * Routes a driver row action to pickup, POD sign-off, or quick delivery confirmation.
   */
  const handleDriverAction = (wb: Waybill) => {
    if (wb.status === 'DRAFT' || (wb.status === 'PICKED_UP' && hasPendingDropoff(wb))) {
      onContinuePickup(wb);
      return;
    }

    const needsPod = wb.podRequired === true || wb.additionalComments === '__podRequired';

    if (wb.status === 'PICKED_UP') {
      if (needsPod) {
        onSignOff(wb);
      } else {
        setDeliverConfirmWaybill(wb);
      }
    }
  };

  const isAssignedToMe = (wb: Waybill, driverId?: string | null): boolean => {
    const targetDriverId = driverId ?? session.driverId;
    if (!targetDriverId) return false;
    return wb.driverId === targetDriverId;
  };

  const scopedWaybills = useMemo(() => {
    const live = waybills.filter((w) => w.status !== 'VOIDED');
    if (isDriverPreview && driverPreviewId) {
      return live.filter((w) => w.driverId === driverPreviewId);
    }
    if (isDispatcher) return live;
    return live.filter((w) => isAssignedToMe(w));
  }, [driverPreviewId, isDispatcher, isDriverPreview, session.driverId, waybills]);

  const visibleWaybills = useMemo(() => {
    if (showDriverPortal) {
      return sortDriverDeliveryQueue(
        scopedWaybills.filter(
          (w) => w.status === 'DRAFT' || w.status === 'PICKED_UP' || w.status === 'DELIVERED'
        )
      );
    }

    if (dispatchTab === 'COMPLETED') {
      let list = scopedWaybills.filter(isCompletedPricedDelivery);

      if (completedSearchQuery.trim()) {
        const q = completedSearchQuery.toLowerCase().trim();
        list = list.filter(
          (w) =>
            w.waybillNumber.toLowerCase().includes(q) ||
            w.pickupLocationName.toLowerCase().includes(q) ||
            w.dropoffDestinationName.toLowerCase().includes(q)
        );
      }

      if (completedStartDate.trim()) {
        const start = new Date(completedStartDate.trim()).getTime();
        if (!Number.isNaN(start)) {
          list = list.filter((w) => {
            const ts = w.createdAt ?? w.capturedAt;
            return ts ? new Date(ts).getTime() >= start : false;
          });
        }
      }

      if (completedEndDate.trim()) {
        const end = new Date(completedEndDate.trim());
        end.setHours(23, 59, 59, 999);
        const endTime = end.getTime();
        if (!Number.isNaN(endTime)) {
          list = list.filter((w) => {
            const ts = w.createdAt ?? w.capturedAt;
            return ts ? new Date(ts).getTime() <= endTime : false;
          });
        }
      }

      return list;
    }

    if (dispatchTab === 'PENDING_PRICE') {
      return scopedWaybills.filter(isPendingDispatcherPrice);
    }

    return sortDispatchActiveWaybills(
      scopedWaybills.filter((w) => w.status === 'DRAFT' || w.status === 'PICKED_UP')
    );
  }, [
    completedEndDate,
    completedSearchQuery,
    completedStartDate,
    dispatchTab,
    isDispatcher,
    scopedWaybills,
    showDriverPortal,
  ]);

  const driverActiveWaybills = useMemo(() => {
    if (!showDriverPortal) return [];
    return sortDriverDeliveryQueue(
      scopedWaybills.filter((w) => w.status === 'DRAFT' || w.status === 'PICKED_UP')
    );
  }, [scopedWaybills, showDriverPortal]);

  const driverCompletedGroups = useMemo(() => {
    if (!showDriverPortal) return [];
    const completed = sortDriverDeliveryQueue(scopedWaybills.filter((w) => w.status === 'DELIVERED'));
    return groupCompletedDeliveries(completed);
  }, [scopedWaybills, showDriverPortal]);

  const driverCompletedCount = useMemo(
    () => driverCompletedGroups.reduce((sum, group) => sum + group.items.length, 0),
    [driverCompletedGroups]
  );

  const pendingPriceGroups = useMemo(() => {
    if (!isDispatcher || isDriverPreview || dispatchTab !== 'PENDING_PRICE') return [];
    return groupPendingPriceWaybills(scopedWaybills);
  }, [dispatchTab, isDispatcher, isDriverPreview, scopedWaybills]);

  const pendingPriceCount = useMemo(
    () => scopedWaybills.filter(isPendingDispatcherPrice).length,
    [scopedWaybills]
  );

  const completedPricedCount = useMemo(
    () => scopedWaybills.filter(isCompletedPricedDelivery).length,
    [scopedWaybills]
  );

  const conflictWaybillNumbers = new Set(conflictEvents.map((e) => e.waybillNumber));

  const driverQueueOptions = useMemo(() => {
    if (!assignModalWaybill || !assignDraft) return [];
    return sortDriverDeliveryQueue(
      waybills.filter(
        (w) =>
          w.driverId === assignDraft.driverId &&
          w.waybillNumber !== assignModalWaybill.waybillNumber &&
          (w.status === 'DRAFT' || w.status === 'PICKED_UP')
      )
    );
  }, [assignDraft, assignModalWaybill, waybills]);

  /**
   * Voids an active waybill after dispatcher confirmation (DRAFT or PICKED_UP only).
   */
  const handleConfirmDelete = async (wb: Waybill) => {
    if (!isDispatcher || isDriverPreview) return;

    try {
      const res = await fetch(`/api/waybills/${wb.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'WAYBILL_VOIDED',
          data: {},
        }),
      });

      if (!res.ok) {
        await loadWaybills();
        setDeleteConfirmWaybill(null);
        return;
      }

      setWaybills((prev) => {
        const next = prev.filter((row) => row.waybillNumber !== wb.waybillNumber);
        sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
        return next;
      });
    } catch {
      await loadWaybills();
    }

    setDeleteConfirmWaybill(null);
  };

  const assignDriverName =
    driverRoster.find((d) => d.id === assignDraft?.driverId)?.firstName ?? 'Driver';

  const showDispatchDeleteCol =
    isDispatcher && !isDriverPreview && dispatchTab === 'ACTIVE';

  /**
   * Toggles expansion for a completed-delivery time bucket in the driver view.
   */
  const toggleCompletedBucket = (bucket: CompletedBucket) => {
    setCompletedExpandedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  };

  /**
   * Toggles expansion for a pending-price time bucket in the dispatch view.
   */
  const togglePendingPriceBucket = (bucket: PendingPriceBucket) => {
    setPendingPriceExpandedBuckets((prev) => {
      const next = new Set(prev);
      if (next.has(bucket)) {
        next.delete(bucket);
      } else {
        next.add(bucket);
      }
      return next;
    });
  };

  /**
   * Renders waybill table column headers for dispatch and driver portal views.
   */
  const renderTableHeader = (opts: {
    showCapture?: boolean;
    actionLabel?: string;
    showDelete?: boolean;
    hidePrice?: boolean;
  }) => (
    <thead>
      <tr>
        <th>Waybill</th>
        <th>Date</th>
        <th>Time</th>
        <th className="col-cargo">Cargo</th>
        <th className="col-pickup">Pickup</th>
        <th className="col-dropoff">Dropoff</th>
        {!opts.hidePrice && <th className="col-price">$</th>}
        <th>Status</th>
        {opts.showCapture && <th>Capture</th>}
        <th className="col-action">{opts.actionLabel ?? 'Action'}</th>
        {opts.showDelete && (
          <th className="col-delete" aria-label="Delete">
            {' '}
          </th>
        )}
      </tr>
    </thead>
  );

  /**
   * Renders a single waybill table row for dispatch or driver portal views.
   */
  const renderWaybillRow = (wb: Waybill, readOnly = false) => {
    const price = effectiveWaybillPrice(wb);
    const timestamp = wb.capturedAt ?? wb.createdAt;
    const hasConflict = conflictWaybillNumbers.has(wb.waybillNumber);
    const previewDriverId = isDriverPreview ? driverPreviewId : session.driverId;
    const showDriverAction =
      showDriverPortal &&
      !readOnly &&
      isAssignedToMe(wb, previewDriverId) &&
      (wb.status === 'DRAFT' || wb.status === 'PICKED_UP');
    const canDelete =
      isDispatcher &&
      !isDriverPreview &&
      dispatchTab === 'ACTIVE' &&
      (wb.status === 'DRAFT' || wb.status === 'PICKED_UP');

    return (
      <tr
        key={wb.waybillNumber}
        className={hasConflict ? 'row-conflict' : undefined}
        onClick={() => {
          if (isDispatcher && !isDriverPreview && dispatchTab === 'COMPLETED') {
            setCompletedDetailWaybill(wb);
            return;
          }
          if (isDispatcher && !isDriverPreview && dispatchTab === 'PENDING_PRICE') {
            setPendingPriceWaybill(wb);
            return;
          }
          if (showDriverAction) {
            handleDriverAction(wb);
          }
        }}
      >
        <td>
          <div className="table-waybill">{wb.waybillNumber}</div>
          {wb.externalSource === 'google_sheet' && !hideDriverPricing && (
            <span className="form-intake-badge">LIVE FORM</span>
          )}
          {priorityBadgeLabel(wb) && (
            <div className="priority-badges">
              <span className="rush-badge">{priorityBadgeLabel(wb)}</span>
            </div>
          )}
          {hasConflict && <span className="conflict-badge">CONFLICT</span>}
        </td>
        <td>{formatWaybillDate(timestamp)}</td>
        <td>{formatWaybillTime(timestamp)}</td>
        <td className="col-cargo" title={wb.parcelDescription}>
          {abbreviateCargo(wb.parcelDescription)}
        </td>
        <td className="col-pickup" title={wb.pickupLocationName}>
          {getLocationShortName(wb.pickupLocationName)}
        </td>
        <td className="col-dropoff" title={wb.dropoffDestinationName}>
          {getLocationShortName(wb.dropoffDestinationName)}
        </td>
        {!hideDriverPricing && (
          <td className="col-price">{price > 0 ? `$${price.toFixed(0)}` : '—'}</td>
        )}
        <td>
          <span className={`status-tag status-${wb.status.toLowerCase()}`}>
            {statusLabel(wb.status)}
          </span>
        </td>
        {isDispatcher && !isDriverPreview && dispatchTab === 'COMPLETED' && (
          <td>
            <div className="capture-icons" aria-label="Capture status">
              {hasSignature(wb) && (
                <span className="capture-icon" title="Signature captured">
                  ✍️
                </span>
              )}
              {hasProofPhoto(wb) && (
                <span className="capture-icon" title="Proof photo captured">
                  📷
                </span>
              )}
              {!hasSignature(wb) && !hasProofPhoto(wb) && (
                <span className="capture-icon muted" title="No captures">
                  —
                </span>
              )}
            </div>
          </td>
        )}
        <td
          className="col-action"
          onClick={(e) => {
            if (isDispatcher && !isDriverPreview) e.stopPropagation();
          }}
        >
          {isDispatcher && !isDriverPreview ? (
            <DispatchAssignmentCell
              wb={wb}
              drivers={driverRoster}
              onAssignClick={(driverId) => openAssignModal(wb, driverId)}
            />
          ) : showDriverAction ? (
            <button
              type="button"
              className="action-badge-btn"
              onClick={(e) => {
                e.stopPropagation();
                handleDriverAction(wb);
              }}
            >
              {wb.status === 'DRAFT'
                ? 'Pick Up'
                : wb.podRequired || wb.additionalComments === '__podRequired'
                  ? 'Deliver w/ POD'
                  : 'Deliver'}
            </button>
          ) : readOnly && wb.status === 'DELIVERED' ? (
            <span className="driver-readonly-label">Completed</span>
          ) : null}
        </td>
        {showDispatchDeleteCol && (
          <td
            className="col-delete"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            {canDelete && (
              <button
                type="button"
                className="btn-delete-waybill"
                title="Delete waybill"
                aria-label={`Delete ${wb.waybillNumber}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirmWaybill(wb);
                }}
              >
                🗑
              </button>
            )}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          {isDriverPreview ? (
            <span className="driver-title">{previewDriverName}&apos;s View (read-only)</span>
          ) : isDispatcher ? (
            <span className="dispatch-title">⚙️ Dispatch <span className="build-stamp">{APP_BUILD}</span></span>
          ) : (
            <span className="driver-title">Driver Portal <span className="build-stamp">{APP_BUILD}</span></span>
          )}
        </div>

        <div className="header-right">
          <button type="button" className="network-toggle" onClick={onToggleNetwork}>
            {isOnline ? '🟢 Live' : '🔴 Off'}
          </button>

          <div className="sync-stats">
            <span>
              S:<span className="synced">{syncStats.syncedCount}</span>
            </span>
            <span>
              C:<span className={syncStats.conflictCount > 0 ? 'conflict' : ''}>{syncStats.conflictCount}</span>
            </span>
          </div>

          <span className="pending-sync-label">{syncStats.pendingCount} Pending Sync</span>

          <button type="button" className="sign-out-btn" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      {syncStats.conflictCount > 0 && (
        <div className="conflict-banner">
          {conflictEvents.map((evt) => (
            <div key={evt.id} className="conflict-row">
              <span>
                ⚠️ {evt.waybillNumber}: sync conflict — server rejected duplicate collision
              </span>
              <button
                type="button"
                className="btn-retry-sync"
                onClick={() => void syncManager.resolveConflictForce(evt.id, session)}
              >
                Retry
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="action-row">
        <button type="button" className="btn-primary" onClick={onNewPickup}>
          ➕ NEW PICKUP (WAYBILL)
        </button>

        {isDispatcher && (
          <>
            {isDriverPreview ? (
              <button
                type="button"
                className="btn-driver-preview active"
                onClick={() => setDriverPreviewId(null)}
              >
                ← Back to Dispatch
              </button>
            ) : (
              <div className="driver-preview-wrap">
                <button
                  type="button"
                  className="btn-driver-preview"
                  onClick={() => setShowDriverPicker((open) => !open)}
                >
                  👤 Driver View
                </button>
                {showDriverPicker && (
                  <div className="driver-preview-menu">
                    {driverRoster.map((driver) => (
                      <button
                        key={driver.id}
                        type="button"
                        onClick={() => {
                          setDriverPreviewId(driver.id);
                          setShowDriverPicker(false);
                        }}
                      >
                        {driver.firstName} {driver.lastName[0]}.
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button type="button" className="btn-accounting" onClick={onOpenAccounting}>
              📊 ACCOUNTING & INVOICES
            </button>
          </>
        )}
      </div>

      {isDispatcher && !isDriverPreview && (
        <div className="dispatch-tabs">
          {(['ACTIVE', 'PENDING_PRICE', 'COMPLETED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={dispatchTab === tab ? 'dispatch-tab active' : 'dispatch-tab'}
              onClick={() => setDispatchTab(tab)}
            >
              {tab === 'ACTIVE'
                ? 'Active Jobs'
                : tab === 'PENDING_PRICE'
                  ? `Pending Price (${pendingPriceCount})`
                  : `Completed (${completedPricedCount})`}
            </button>
          ))}
        </div>
      )}

      {isDispatcher && !isDriverPreview && dispatchTab === 'COMPLETED' && (
        <div className="completed-filters">
          <input
            className="search-input"
            value={completedSearchQuery}
            onChange={(e) => setCompletedSearchQuery(e.target.value)}
            placeholder="🔍 Search waybill or business name..."
          />
          <div className="date-filter-row">
            <label>
              From:
              <input
                className="date-input"
                value={completedStartDate}
                onChange={(e) => setCompletedStartDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>
            <label>
              To:
              <input
                className="date-input"
                value={completedEndDate}
                onChange={(e) => setCompletedEndDate(e.target.value)}
                placeholder="YYYY-MM-DD"
              />
            </label>
            {(completedSearchQuery || completedStartDate || completedEndDate) && (
              <button
                type="button"
                className="btn-clear-filters"
                onClick={() => {
                  setCompletedSearchQuery('');
                  setCompletedStartDate('');
                  setCompletedEndDate('');
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {showDriverPortal ? (
        <>
          <div className="waybill-table-wrap">
            <table className="waybill-table driver-portal-table">
              {renderTableHeader({ actionLabel: 'Action', hidePrice: hideDriverPricing })}
              <tbody>{driverActiveWaybills.map((wb) => renderWaybillRow(wb, isDriverPreview))}</tbody>
            </table>
          </div>

          {driverCompletedCount > 0 && (
            <div className="completed-deliveries-section">
              {driverCompletedGroups.map((group) => {
                const isOpen = completedExpandedBuckets.has(group.bucket);
                return (
                  <div key={group.bucket} className="completed-deliveries-group">
                    <button
                      type="button"
                      className="completed-deliveries-bar"
                      onClick={() => toggleCompletedBucket(group.bucket)}
                    >
                      <span className="completed-deliveries-bar-label">
                        {isOpen ? '▼' : '▶'} {group.label} completed
                      </span>
                      <span className="completed-deliveries-bar-count">{group.items.length}</span>
                    </button>

                    {isOpen && (
                      <div className="waybill-table-wrap completed-deliveries-table">
                        <table className="waybill-table driver-portal-table">
                          {renderTableHeader({ actionLabel: 'Action', hidePrice: hideDriverPricing })}
                          <tbody>
                            {group.items.map((wb) => renderWaybillRow(wb, true))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : isDispatcher && !isDriverPreview && dispatchTab === 'PENDING_PRICE' ? (
        <div className="completed-deliveries-section pending-price-section">
          {pendingPriceGroups.map((group) => {
            const isOpen = pendingPriceExpandedBuckets.has(group.bucket);
            return (
              <div key={group.bucket} className="completed-deliveries-group">
                <button
                  type="button"
                  className="completed-deliveries-bar"
                  onClick={() => togglePendingPriceBucket(group.bucket)}
                >
                  <span className="completed-deliveries-bar-label">
                    {isOpen ? '▼' : '▶'} {group.label} — pending price
                  </span>
                  <span className="completed-deliveries-bar-count">{group.items.length}</span>
                </button>

                {isOpen && (
                  <div className="waybill-table-wrap completed-deliveries-table">
                    {group.items.length > 0 ? (
                      <table className="waybill-table">
                        {renderTableHeader({ actionLabel: 'Assignment' })}
                        <tbody>{group.items.map((wb) => renderWaybillRow(wb))}</tbody>
                      </table>
                    ) : (
                      <p className="empty-text pending-price-empty">No deliveries in this section.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="waybill-table-wrap">
          <table className="waybill-table">
            {renderTableHeader({
              showCapture: isDispatcher && !isDriverPreview && dispatchTab === 'COMPLETED',
              actionLabel: 'Assignment',
              showDelete: showDispatchDeleteCol,
            })}
            <tbody>{visibleWaybills.map((wb) => renderWaybillRow(wb))}</tbody>
          </table>
        </div>
      )}

      {completedDetailWaybill && (
        <WaybillDetailModal
          waybill={completedDetailWaybill}
          mode="completed"
          driverRoster={driverRoster}
          onClose={() => setCompletedDetailWaybill(null)}
          onSave={(draft) => handleWaybillDetailSave(completedDetailWaybill, draft)}
          onDelete={() => handleWaybillDetailDelete(completedDetailWaybill)}
        />
      )}

      {pendingPriceWaybill && (
        <WaybillDetailModal
          waybill={pendingPriceWaybill}
          mode="pending-price"
          driverRoster={driverRoster}
          onClose={() => setPendingPriceWaybill(null)}
          onSave={(draft) => handleWaybillDetailSave(pendingPriceWaybill, draft)}
          onDelete={() => handleWaybillDetailDelete(pendingPriceWaybill)}
        />
      )}

      {deliverConfirmWaybill && (
        <div className="modal-overlay">
          <div className="modal-content deliver-confirm-modal">
            <h3>Confirm Delivery</h3>
            <div className="modal-details">
              <div>Waybill #: {deliverConfirmWaybill.waybillNumber}</div>
              <div>
                Route: {getLocationShortName(deliverConfirmWaybill.pickupLocationName)} ➡️{' '}
                {getLocationShortName(deliverConfirmWaybill.dropoffDestinationName)}
              </div>
              <div>Cargo: {deliverConfirmWaybill.parcelDescription}</div>
            </div>
            <p className="deliver-confirm-note">
              No signature required. Tap below to mark this delivery complete.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeliverConfirmWaybill(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleConfirmDelivery(deliverConfirmWaybill)}
              >
                ✔ Confirm Delivery
              </button>
            </div>
          </div>
        </div>
      )}

      {assignModalWaybill && assignDraft && (
        <div className="modal-overlay">
          <div className="modal-content assign-modal">
            <h3>Assign to {assignDriverName}</h3>
            <div className="modal-details">
              <div>Waybill #: {assignModalWaybill.waybillNumber}</div>
              <div>Route: {assignModalWaybill.pickupLocationName} → {assignModalWaybill.dropoffDestinationName}</div>
              <div>Cargo: {assignModalWaybill.parcelDescription}</div>
            </div>

            <label>Priority</label>
            <div className="assign-priority-row">
              {(['REGULAR', 'RUSH'] as const).map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`assign-option${assignDraft.priority === level ? ' active' : ''}`}
                  onClick={() =>
                    setAssignDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            priority: level,
                            queuePosition: level === 'RUSH' ? 'top' : 'bottom',
                          }
                        : prev
                    )
                  }
                >
                  {level === 'REGULAR' ? 'Regular' : 'Rush'}
                </button>
              ))}
            </div>

            <label>Queue position for {assignDriverName}</label>
            <select
              className="assign-queue-select"
              value={
                assignDraft.queuePosition === 'top'
                  ? 'top'
                  : assignDraft.queuePosition === 'bottom'
                    ? 'bottom'
                    : assignDraft.queuePosition.afterWaybillNumber
              }
              onChange={(e) => {
                const value = e.target.value;
                setAssignDraft((prev) => {
                  if (!prev) return prev;
                  if (value === 'top' || value === 'bottom') {
                    return { ...prev, queuePosition: value };
                  }
                  return { ...prev, queuePosition: { afterWaybillNumber: value } };
                });
              }}
            >
              <option value="top">Top of queue (deliver first)</option>
              {driverQueueOptions.map((job) => (
                <option key={job.waybillNumber} value={job.waybillNumber}>
                  After {job.waybillNumber} — {job.pickupLocationName}
                </option>
              ))}
              <option value="bottom">Bottom of queue (after current jobs)</option>
            </select>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setAssignModalWaybill(null);
                  setAssignDraft(null);
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn-primary" onClick={() => void handleConfirmAssignment()}>
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmWaybill && (
        <div className="modal-overlay">
          <div className="modal-content delete-confirm-modal">
            <h3>Delete Active Delivery?</h3>
            <div className="modal-details">
              <div>Waybill #: {deleteConfirmWaybill.waybillNumber}</div>
              <div>
                Route: {getLocationShortName(deleteConfirmWaybill.pickupLocationName)} ➡️{' '}
                {getLocationShortName(deleteConfirmWaybill.dropoffDestinationName)}
              </div>
              <div>Status: {statusLabel(deleteConfirmWaybill.status)}</div>
            </div>
            <p className="delete-confirm-note">
              This will void the waybill and remove it from active jobs. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeleteConfirmWaybill(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => void handleConfirmDelete(deleteConfirmWaybill)}
              >
                Delete Waybill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
