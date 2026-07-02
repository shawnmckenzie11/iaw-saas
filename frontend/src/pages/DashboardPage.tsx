import { useEffect, useMemo, useState } from 'react';
import { iawDb, queueEvent, removeSyncedEvents } from '../db/indexedDb';
import { FALLBACK_WAYBILLS } from '../data/fallbackWaybills';
import { DRIVERS, driverFirstName } from '../data/drivers';
import type { AuthSession } from '../services/auth';
import { syncManager, type SyncStats } from '../services/SyncManager';
import type { Waybill } from '../types/waybill';
import { waybillPrice } from '../types/waybill';
import { formatWaybillDate, formatWaybillTime } from '../utils/formatters';
import { calculatePrice, getLocationShortName } from '../utils/pricing';
import { mergeQueuedWaybills } from '../utils/queuedWaybills';

export type { Waybill };

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
  onAssign,
}: {
  wb: Waybill;
  onAssign: (driverId: string | null) => void;
}) {
  if (wb.status === 'DELIVERED') {
    return <span className="driver-chip-label">{driverFirstName(wb.driverId)}</span>;
  }

  return (
    <div className="assigned-row">
      <div className="driver-assign-chips">
        {DRIVERS.map((driver) => (
          <button
            key={driver.id}
            type="button"
            className={`driver-assign-chip${wb.driverId === driver.id ? ' is-active' : ''}`}
            title={driver.firstName}
            aria-label={`Assign ${driver.firstName}`}
            aria-pressed={wb.driverId === driver.id}
            onClick={(e) => {
              e.stopPropagation();
              if (wb.driverId !== driver.id) {
                onAssign(driver.id);
              }
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
            onAssign(null);
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
  const [showDriverRoster, setShowDriverRoster] = useState(true);
  const [completedSearchQuery, setCompletedSearchQuery] = useState('');
  const [completedStartDate, setCompletedStartDate] = useState('');
  const [completedEndDate, setCompletedEndDate] = useState('');
  const [pendingPriceWaybill, setPendingPriceWaybill] = useState<Waybill | null>(null);
  const [deliverConfirmWaybill, setDeliverConfirmWaybill] = useState<Waybill | null>(null);
  const [quotePrice, setQuotePrice] = useState('');
  const [conflictEvents, setConflictEvents] = useState<Array<{ id: string; waybillNumber: string }>>([]);
  const isDispatcher = session.role === 'DISPATCHER';

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

  /** Poll for dispatcher assignment updates while the driver dashboard is open. */
  useEffect(() => {
    if (isDispatcher || !isOnline) return;
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
  }, [isDispatcher, isOnline, session.token]);

  /**
   * Posts a driver assignment event and refreshes local waybill cache.
   */
  const handleAssignDriver = async (wb: Waybill, driverId: string | null) => {
    if (!isDispatcher) return;

    setWaybills((prev) => {
      const next = prev.map((row) =>
        row.waybillNumber === wb.waybillNumber ? { ...row, driverId } : row
      );
      sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
      return next;
    });

    try {
      const res = await fetch(`/api/waybills/${wb.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'WAYBILL_ASSIGNED',
          data: { driverId },
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
   * Saves a dispatcher manual price quote via override event.
   */
  const handleConfirmQuotePrice = async () => {
    if (!pendingPriceWaybill || !quotePrice.trim()) return;
    const priceVal = parseFloat(quotePrice);
    if (Number.isNaN(priceVal) || priceVal < 0) return;

    try {
      await fetch(`/api/waybills/${pendingPriceWaybill.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'DISPATCHER_OVERRIDE',
          data: { pricingTotalCost: priceVal },
        }),
      });
      setWaybills((prev) => {
        const next = prev.map((row) =>
          row.waybillNumber === pendingPriceWaybill.waybillNumber
            ? { ...row, calculatedPrice: priceVal, pricingTotalCost: priceVal }
            : row
        );
        sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
        return next;
      });
    } catch {
      // offline placeholder update
      setWaybills((prev) => {
        const next = prev.map((row) =>
          row.waybillNumber === pendingPriceWaybill.waybillNumber
            ? { ...row, calculatedPrice: priceVal, pricingTotalCost: priceVal }
            : row
        );
        sessionStorage.setItem('iaw_waybills', JSON.stringify(next));
        return next;
      });
    }

    setPendingPriceWaybill(null);
    setQuotePrice('');
  };

  /**
   * Marks a non-POD waybill delivered after driver confirmation (no signature required).
   */
  const handleConfirmDelivery = async (wb: Waybill) => {
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
    const needsPod = wb.podRequired === true || wb.additionalComments === '__podRequired';

    if (wb.status === 'DRAFT') {
      onContinuePickup(wb);
      return;
    }
    if (wb.status === 'PICKED_UP') {
      if (needsPod) {
        onSignOff(wb);
      } else {
        setDeliverConfirmWaybill(wb);
      }
    }
  };

  const isAssignedToMe = (wb: Waybill): boolean => {
    if (!session.driverId) return false;
    return wb.driverId === session.driverId;
  };

  const scopedWaybills = useMemo(() => {
    if (isDispatcher) return waybills;
    return waybills.filter((w) => isAssignedToMe(w));
  }, [isDispatcher, session.driverId, waybills]);

  const visibleWaybills = useMemo(() => {
    if (!isDispatcher) {
      return scopedWaybills.filter(
        (w) => w.status === 'DRAFT' || w.status === 'PICKED_UP' || w.status === 'DELIVERED'
      );
    }

    if (dispatchTab === 'COMPLETED') {
      let list = scopedWaybills.filter((w) => w.status === 'DELIVERED' && waybillPrice(w) > 0);

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
      return scopedWaybills.filter((w) => w.status === 'DELIVERED' && waybillPrice(w) <= 0);
    }

    return scopedWaybills.filter((w) => w.status === 'DRAFT' || w.status === 'PICKED_UP');
  }, [
    completedEndDate,
    completedSearchQuery,
    completedStartDate,
    dispatchTab,
    isDispatcher,
    scopedWaybills,
  ]);

  const conflictWaybillNumbers = new Set(conflictEvents.map((e) => e.waybillNumber));

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          {isDispatcher ? (
            <span className="dispatch-title">⚙️ Dispatch</span>
          ) : (
            <span className="driver-title">Driver Portal</span>
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
          <button type="button" className="btn-accounting" onClick={onOpenAccounting}>
            📊 ACCOUNTING & INVOICES
          </button>
        )}
      </div>

      {isDispatcher && (
        <div className="dispatch-tabs">
          {(['ACTIVE', 'PENDING_PRICE', 'COMPLETED'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={dispatchTab === tab ? 'dispatch-tab active' : 'dispatch-tab'}
              onClick={() => setDispatchTab(tab)}
            >
              {tab === 'ACTIVE' ? 'Active Jobs' : tab === 'PENDING_PRICE' ? 'Pending Price' : 'Completed'}
            </button>
          ))}
        </div>
      )}

      {isDispatcher && dispatchTab === 'COMPLETED' && (
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

      <div className="waybill-table-wrap">
        <table className="waybill-table">
          <thead>
            <tr>
              <th>Waybill</th>
              <th>Date</th>
              <th>Time</th>
              <th>Cargo</th>
              <th>Route</th>
              <th>Status</th>
              {isDispatcher ? <th>Assignment</th> : <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {visibleWaybills.map((wb) => {
              const quote = calculatePrice(
                wb.pickupLocationName,
                wb.dropoffDestinationName,
                undefined,
                false,
                wb.priority
              );
              const price = waybillPrice(wb) || quote.price;
              const timestamp = wb.capturedAt ?? wb.createdAt;
              const hasConflict = conflictWaybillNumbers.has(wb.waybillNumber);
              const isCompleted = wb.status === 'DELIVERED';
              const showDriverAction =
                !isDispatcher && isAssignedToMe(wb) && (wb.status === 'DRAFT' || wb.status === 'PICKED_UP');

              return (
                <tr
                  key={wb.waybillNumber}
                  className={hasConflict ? 'row-conflict' : undefined}
                  onClick={() => {
                    if (isDispatcher && dispatchTab === 'PENDING_PRICE') {
                      setPendingPriceWaybill(wb);
                      setQuotePrice('');
                      return;
                    }
                    if (showDriverAction) {
                      handleDriverAction(wb);
                    }
                  }}
                >
                  <td>
                    <div className="table-waybill">{wb.waybillNumber}</div>
                    {wb.priority === 'RUSH' && <span className="rush-badge">RUSH</span>}
                    {hasConflict && <span className="conflict-badge">CONFLICT</span>}
                  </td>
                  <td>{formatWaybillDate(timestamp)}</td>
                  <td>{formatWaybillTime(timestamp)}</td>
                  <td>{wb.parcelDescription}</td>
                  <td>
                    <div className="route">
                      🚩 {getLocationShortName(wb.pickupLocationName)} ➡️{' '}
                      {getLocationShortName(wb.dropoffDestinationName)}
                    </div>
                    <div className="route-price">{price > 0 ? `$${price.toFixed(2)}` : 'Manual'}</div>
                  </td>
                  <td>
                    <span className={`status-tag status-${wb.status.toLowerCase()}`}>
                      {statusLabel(wb.status)}
                    </span>
                  </td>
                  <td
                    onClick={(e) => {
                      if (isDispatcher) e.stopPropagation();
                    }}
                  >
                    {isDispatcher ? (
                      <DispatchAssignmentCell
                        wb={wb}
                        onAssign={(driverId) => void handleAssignDriver(wb, driverId)}
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
                      ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isDispatcher && (
        <div className="driver-roster">
          <button
            type="button"
            className="roster-toggle"
            onClick={() => setShowDriverRoster((v) => !v)}
          >
            {showDriverRoster ? '▼' : '▶'} Drivers
          </button>
          {showDriverRoster &&
            DRIVERS.map((driver) => (
              <span key={driver.id} className="driver-chip">
                {driver.firstName} {driver.lastName[0]}.
              </span>
            ))}
        </div>
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

      {pendingPriceWaybill && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Set Dispatcher Price Quote</h3>
            <div className="modal-details">
              <div>Waybill #: {pendingPriceWaybill.waybillNumber}</div>
              <div>From: {pendingPriceWaybill.pickupLocationName}</div>
              <div>To: {pendingPriceWaybill.dropoffDestinationName}</div>
              <div>Cargo: {pendingPriceWaybill.parcelDescription}</div>
            </div>
            <label>Enter Quote Price ($) *</label>
            <input
              value={quotePrice}
              onChange={(e) => setQuotePrice(e.target.value)}
              placeholder="e.g. 75.00"
              autoFocus
            />
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setPendingPriceWaybill(null);
                  setQuotePrice('');
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!quotePrice.trim()}
                onClick={() => void handleConfirmQuotePrice()}
              >
                Confirm Price
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
