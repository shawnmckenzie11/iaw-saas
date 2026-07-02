/** Client-side waybill view model aligned with API delivery records. */
export interface Waybill {
  waybillNumber: string;
  status: string;
  driverId: string | null;
  clientSideUuid?: string;
  pickupLocationName: string;
  pickupAddress: string;
  dropoffDestinationName: string;
  dropoffAddress?: string;
  parcelDescription: string;
  parcelWeightClass?: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  dropoffContactName?: string;
  dropoffContactPhone?: string;
  vehicleType?: string;
  skidRequired?: boolean;
  optionalNotes?: string;
  priority?: 'REGULAR' | 'RUSH';
  driverQueueRank?: number | null;
  externalSource?: string | null;
  calculatedPrice?: number;
  pricingTotalCost?: number;
  syncStatus?: string;
  additionalComments?: string;
  podRequired?: boolean;
  capturedAt?: string;
  createdAt?: string;
  deliveredAt?: string | null;
}

/** Resolves display price from API fields or route calculator output. */
export function waybillPrice(wb: Waybill): number {
  if (typeof wb.calculatedPrice === 'number' && wb.calculatedPrice > 0) return wb.calculatedPrice;
  if (typeof wb.pricingTotalCost === 'number' && wb.pricingTotalCost > 0) return wb.pricingTotalCost;
  return 0;
}
