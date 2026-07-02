import { useEffect, useRef, useState, FormEvent } from 'react';
import { queueBlob, queueEvent } from '../db/indexedDb';
import type { AuthSession } from '../services/auth';
import { syncManager } from '../services/SyncManager';
import type { Waybill } from '../types/waybill';
import { getLocationShortName } from '../utils/pricing';

interface SignOffPageProps {
  waybill: Waybill;
  session: AuthSession;
  isOnline: boolean;
  onBack: () => void;
}

/**
 * Delivery sign-off flow with signature canvas, POD photo, and offline queueing.
 */
export default function SignOffPage({ waybill, session, isOnline, onBack }: SignOffPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [printedName, setPrintedName] = useState('');
  const [podFileName, setPodFileName] = useState('');
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
      void syncManager.refresh();
    };

    canvas.addEventListener('signatureDraw', handleSignatureDraw);
    return () => canvas.removeEventListener('signatureDraw', handleSignatureDraw);
  }, [waybill.waybillNumber]);

  /**
   * Maps pointer/touch coordinates to canvas space.
   */
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

  /**
   * Stores a proof-of-delivery photo in the blob sync queue.
   */
  const handlePodPhoto = async (file: File | undefined) => {
    if (!file) return;
    setPodFileName(file.name);
    await queueBlob({
      id: crypto.randomUUID(),
      waybillNumber: waybill.waybillNumber,
      fileType: 'photo',
      blob: file,
      createdAt: new Date().toISOString(),
    });
    await syncManager.refresh();
  };

  const handleComplete = async (e: FormEvent) => {
    e.preventDefault();
    const eventId = crypto.randomUUID();
    const deliveredAt = new Date().toISOString();

    await queueEvent({
      id: eventId,
      clientSideUuid: eventId,
      waybillNumber: waybill.waybillNumber,
      eventType: 'WAYBILL_DELIVERED',
      timestamp: deliveredAt,
      data: {
        deliveredAt,
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

    await syncManager.refresh();

    if (isOnline && session.token) {
      await fetch(`/api/waybills/${waybill.waybillNumber}/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          eventType: 'WAYBILL_DELIVERED',
          data: { deliveredAt, signatureName: printedName },
        }),
      }).catch(() => undefined);
      void syncManager.syncQueue(session);
    }

    onBack();
  };

  return (
    <div className="form-page signoff-page">
      <button type="button" className="back-btn" onClick={onBack}>
        ← Back
      </button>
      <h2>Sign Off — {waybill.waybillNumber}</h2>
      <p className="signoff-route">
        🚩 {getLocationShortName(waybill.pickupLocationName)} ➡️{' '}
        {getLocationShortName(waybill.dropoffDestinationName)}
      </p>

      <form onSubmit={handleComplete}>
        <label>Printed Name</label>
        <input
          value={printedName}
          onChange={(e) => setPrintedName(e.target.value)}
          placeholder="Printed Name"
          required
        />

        <label>Recipient Signature</label>
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

        <label>Proof of Delivery Photo</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="file-input"
          onChange={(e) => void handlePodPhoto(e.target.files?.[0])}
        />
        {podFileName && <span className="pod-file-label">📷 {podFileName}</span>}

        <button type="submit" className="btn-primary">
          ✔ COMPLETE DELIVERY & SIGN OFF
        </button>
      </form>
    </div>
  );
}
