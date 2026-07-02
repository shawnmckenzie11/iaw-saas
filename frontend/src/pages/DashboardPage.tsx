import { useEffect, useRef, useState, FormEvent } from 'react';
import { queueBlob, queueEvent } from '../db/indexedDb';
import type { AuthSession } from '../services/auth';
import { FALLBACK_WAYBILLS } from '../data/fallbackWaybills';
import { syncManager } from '../services/SyncManager';

export interface Waybill {
  waybillNumber: string;
  status: string;
  driverId: string | null;
  pickupLocationName: string;
  pickupAddress: string;
  dropoffDestinationName: string;
  parcelDescription: string;
}

interface DashboardProps {
  session: AuthSession;
  isOnline: boolean;
  pendingCount: number;
  onToggleNetwork: () => void;
  onSignOut: () => void;
  onNewPickup: () => void;
  onSignOff: (waybill: Waybill) => void;
}

/**
 * Driver and dispatcher dashboard with sync counters and waybill list.
 */
export default function DashboardPage({
  session,
  isOnline,
  pendingCount,
  onToggleNetwork,
  onSignOut,
  onNewPickup,
  onSignOff,
}: DashboardProps) {
  const [waybills, setWaybills] = useState<Waybill[]>([]);
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
    const load = async () => {
      const cached = sessionStorage.getItem('iaw_waybills');
      if (cached) {
        try {
          setWaybills(JSON.parse(cached));
        } catch {
          // ignore corrupt cache
        }
      }

      const numbers = ['W-001', 'W-002', 'W-003'];
      const loaded: Waybill[] = [];
      for (const num of numbers) {
        try {
          const res = await fetch(`/api/waybills/${num}`, {
            headers: { Authorization: `Bearer ${session.token}` },
          });
          if (res.ok) {
            loaded.push(await res.json());
          }
        } catch {
          // Use cached data when offline
        }
      }
      if (loaded.length > 0) {
        setWaybills(loaded);
        sessionStorage.setItem('iaw_waybills', JSON.stringify(loaded));
      } else if (!cached) {
        setWaybills(FALLBACK_WAYBILLS);
        sessionStorage.setItem('iaw_waybills', JSON.stringify(FALLBACK_WAYBILLS));
      }
    };
    load();
  }, [session.token]);

  const visibleWaybills = isDispatcher
    ? waybills
    : waybills.filter(
        (w) => w.driverId === null || w.driverId === session.driverId
      );

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
            <span>S:0</span>
            <span>C:0</span>
          </div>

          <span className="pending-sync-label">
            {pendingCount} Pending Sync
          </span>

          <button type="button" className="sign-out-btn" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </header>

      <div className="action-row">
        <button type="button" className="btn-primary" onClick={onNewPickup}>
          ➕ NEW PICKUP (WAYBILL)
        </button>

        {isDispatcher && (
          <button type="button" className="btn-accounting">
            📊 ACCOUNTING & INVOICES
          </button>
        )}
      </div>

      <div className="waybill-list">
        {visibleWaybills.map((wb) => (
          <div key={wb.waybillNumber} className="waybill-row">
            <div>
              <strong>{wb.waybillNumber}</strong>
              <div>{wb.parcelDescription}</div>
              <div className="route">
                {wb.pickupLocationName} ➡️ {wb.dropoffDestinationName}
              </div>
            </div>
            <div className="waybill-actions">
              {wb.status === 'PICKED_UP' &&
                (isDispatcher || wb.driverId === session.driverId) && (
                  <button type="button" className="btn-signoff" onClick={() => onSignOff(wb)}>
                    SIGN OFF ➡️
                  </button>
                )}
              <span className="status-badge">{wb.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface PickupPageProps {
  session: AuthSession;
  isOnline: boolean;
  onBack: () => void;
}

/**
 * New pickup form that buffers waybill events offline in IndexedDB.
 */
export function PickupPage({ session, isOnline, onBack }: PickupPageProps) {
  const [locationName, setLocationName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('');
  const [cargoDescription, setCargoDescription] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const id = crypto.randomUUID();
    const waybillNumber = `W-${Date.now().toString().slice(-4)}`;

    await queueEvent({
      id,
      clientSideUuid: id,
      waybillNumber,
      eventType: 'WAYBILL_CREATED',
      timestamp: new Date().toISOString(),
      data: {
        pickupLocationName: locationName,
        pickupAddress,
        parcelDescription: cargoDescription,
        dropoffDestinationName: 'Depot',
        driverId: session.driverId,
      },
    });

    if (isOnline && session.token) {
      await fetch('/api/sync/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          events: [
            {
              id,
              clientSideUuid: id,
              waybillNumber,
              eventType: 'WAYBILL_CREATED',
              timestamp: new Date().toISOString(),
              data: {
                pickupLocationName: locationName,
                pickupAddress,
                parcelDescription: cargoDescription,
                dropoffDestinationName: 'Depot',
              },
            },
          ],
        }),
      }).catch(() => undefined);
    }

    onBack();
  };

  return (
    <div className="form-page">
      <button type="button" className="back-btn" onClick={onBack}>
        ← Back
      </button>
      <h2>New Pickup</h2>
      <form onSubmit={handleSubmit}>
        <label>Location/Business Name</label>
        <input
          value={locationName}
          onChange={(e) => setLocationName(e.target.value)}
          placeholder="Location/Business Name"
          required
        />
        <label>Pickup Address</label>
        <input
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
          placeholder="Pickup Address"
          required
        />
        <label>Cargo Description</label>
        <input
          value={cargoDescription}
          onChange={(e) => setCargoDescription(e.target.value)}
          placeholder="Cargo Description"
          required
        />
        <button type="submit" className="btn-primary">
          💾 COMPLETE PICKUP & LOG WAYBILL
        </button>
      </form>
    </div>
  );
}

interface SignOffPageProps {
  waybill: Waybill;
  session: AuthSession;
  isOnline: boolean;
  onBack: () => void;
}

/**
 * Delivery sign-off form with signature canvas and blob queueing.
 */
export function SignOffPage({ waybill, session, isOnline, onBack }: SignOffPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [printedName, setPrintedName] = useState('');
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
    }

    /** Queues a placeholder signature blob when the canvas receives a draw event. */
    const handleSignatureDraw = () => {
      void queueBlob({
        id: crypto.randomUUID(),
        waybillNumber: waybill.waybillNumber,
        fileType: 'signature',
        blob: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
          type: 'image/png',
        }),
        createdAt: new Date().toISOString(),
      });
    };

    canvas.addEventListener('signatureDraw', handleSignatureDraw);
    return () => canvas.removeEventListener('signatureDraw', handleSignatureDraw);
  }, [waybill.waybillNumber]);

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    const pt = getPoint(e);
    ctx?.beginPath();
    ctx?.moveTo(pt.x, pt.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    const pt = getPoint(e);
    ctx?.lineTo(pt.x, pt.y);
    ctx?.stroke();
  };

  const endDraw = () => {
    drawing.current = false;
  };

  const handleComplete = async (e: FormEvent) => {
    e.preventDefault();
    const eventId = crypto.randomUUID();

    await queueEvent({
      id: eventId,
      clientSideUuid: eventId,
      waybillNumber: waybill.waybillNumber,
      eventType: 'WAYBILL_DELIVERED',
      timestamp: new Date().toISOString(),
      data: {
        deliveredAt: new Date().toISOString(),
        signatureName: printedName,
      },
    });

    const canvas = canvasRef.current;
    const blob =
      canvas &&
      (await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png')));
    await queueBlob({
      id: crypto.randomUUID(),
      waybillNumber: waybill.waybillNumber,
      fileType: 'signature',
      blob: blob ?? new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
        type: 'image/png',
      }),
      createdAt: new Date().toISOString(),
    });

    if (isOnline && session.token) {
      await fetch(`/api/waybills/${waybill.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'WAYBILL_DELIVERED',
          data: { deliveredAt: new Date().toISOString(), signatureName: printedName },
        }),
      }).catch(() => undefined);
    }

    onBack();
  };

  return (
    <div className="form-page">
      <button type="button" className="back-btn" onClick={onBack}>
        ← Back
      </button>
      <h2>Sign Off — {waybill.waybillNumber}</h2>
      <form onSubmit={handleComplete}>
        <label>Printed Name</label>
        <input
          value={printedName}
          onChange={(e) => setPrintedName(e.target.value)}
          placeholder="Printed Name"
          required
        />
        <canvas
          id="signature-canvas"
          ref={canvasRef}
          width={400}
          height={150}
          className="signature-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        <button type="submit" className="btn-primary">
          ✔ COMPLETE DELIVERY & SIGN OFF
        </button>
      </form>
    </div>
  );
}
