import { iawDb, type QueuedEvent } from '../db/indexedDb';
import type { Waybill } from '../types/waybill';

/**
 * Builds an optimistic waybill view from a queued sync event payload.
 */
function waybillFromEvent(evt: QueuedEvent, base?: Waybill): Waybill {
  const d = evt.data ?? {};
  const now = evt.timestamp ?? new Date().toISOString();
  return {
    waybillNumber: evt.waybillNumber,
    clientSideUuid: evt.clientSideUuid,
    status: base?.status ?? 'DRAFT',
    driverId:
      typeof d.driverId === 'string'
        ? d.driverId
        : base?.driverId ?? null,
    pickupLocationName: String(d.pickupLocationName ?? base?.pickupLocationName ?? ''),
    pickupAddress: String(d.pickupAddress ?? base?.pickupAddress ?? ''),
    dropoffDestinationName: String(
      d.dropoffDestinationName ?? base?.dropoffDestinationName ?? 'Pending Dropoff'
    ),
    dropoffAddress: String(d.dropoffAddress ?? base?.dropoffAddress ?? 'Pending Address'),
    parcelDescription: String(d.parcelDescription ?? base?.parcelDescription ?? 'Standard Package'),
    parcelWeightClass:
      typeof d.parcelWeightClass === 'string' ? d.parcelWeightClass : base?.parcelWeightClass,
    priority: (d.priority as Waybill['priority']) ?? base?.priority ?? 'REGULAR',
    driverQueueRank:
      typeof d.driverQueueRank === 'number' ? d.driverQueueRank : base?.driverQueueRank ?? null,
    calculatedPrice:
      typeof d.calculatedPrice === 'number' ? d.calculatedPrice : base?.calculatedPrice,
    podRequired: d.podRequired === true || base?.podRequired,
    capturedAt: base?.capturedAt ?? now,
    createdAt: base?.createdAt ?? now,
    syncStatus: evt.syncStatus ?? 'PENDING',
  };
}

/**
 * Merges pending IndexedDB queue events into an API waybill list for immediate UI feedback.
 */
export async function mergeQueuedWaybills(apiWaybills: Waybill[]): Promise<Waybill[]> {
  const events = await iawDb.waybill_events.toArray();
  const byNumber = new Map(apiWaybills.map((w) => [w.waybillNumber, { ...w }]));

  const grouped = new Map<string, QueuedEvent[]>();
  for (const evt of events) {
    const list = grouped.get(evt.waybillNumber) ?? [];
    list.push(evt);
    grouped.set(evt.waybillNumber, list);
  }

  for (const [, evts] of grouped) {
    evts.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let wb: Waybill | undefined = byNumber.get(evts[0].waybillNumber);

    for (const evt of evts) {
      if (evt.eventType === 'WAYBILL_CREATED') {
        wb = waybillFromEvent(evt, wb);
        wb.status = 'DRAFT';
        if (typeof evt.data?.driverId === 'string') {
          wb.driverId = evt.data.driverId;
        }
      } else if (evt.eventType === 'WAYBILL_ASSIGNED') {
        wb = wb ?? waybillFromEvent(evt);
        if (evt.data?.driverId === null) {
          wb.driverId = null;
          wb.driverQueueRank = null;
        } else if (typeof evt.data?.driverId === 'string') {
          wb.driverId = evt.data.driverId;
        }
        if (evt.data?.priority === 'RUSH' || evt.data?.priority === 'REGULAR') {
          wb.priority = evt.data.priority;
        }
        if (typeof evt.data?.driverQueueRank === 'number') {
          wb.driverQueueRank = evt.data.driverQueueRank;
        }
      } else if (evt.eventType === 'WAYBILL_PICKED_UP') {
        wb = waybillFromEvent(evt, wb);
        wb.status = 'PICKED_UP';
        if (typeof evt.data?.driverId === 'string') {
          wb.driverId = evt.data.driverId;
        }
      } else if (evt.eventType === 'WAYBILL_DELIVERED') {
        wb = waybillFromEvent(evt, wb);
        wb.status = 'DELIVERED';
        wb.deliveredAt = String(evt.data?.deliveredAt ?? evt.timestamp);
      }
    }

    if (wb && wb.waybillNumber) {
      byNumber.set(wb.waybillNumber, wb);
    }
  }

  return Array.from(byNumber.values()).sort((a, b) => {
    const ta = new Date(a.capturedAt ?? a.createdAt ?? 0).getTime();
    const tb = new Date(b.capturedAt ?? b.createdAt ?? 0).getTime();
    return tb - ta;
  });
}
