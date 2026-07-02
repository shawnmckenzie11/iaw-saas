import type { PriorityLevel, VehicleType } from '@prisma/client';

/** Normalized pickup request row shared by CSV archive, Google Sheets, and future web form. */
export interface ParsedRequestRow {
  timestamp: Date;
  pickupLocationName: string;
  dropoffDestinationName: string;
  pickupAddress: string;
  dropoffAddress: string;
  vehicleType: VehicleType;
  priority: PriorityLevel;
  parcelDescription: string;
  parcelWeightClass: string;
  /** Numeric weight from the form when the shipper entered a value over 75 lbs. */
  parcelWeightLbs: number | null;
  contactName: string;
  contactPhone: string;
  additionalComments: string;
  calculatedPrice: number;
  priceCategory: string;
  skidRequired: boolean;
  /** True when pickup or dropoff could not be confidently mapped — dispatch must set price. */
  requiresManualPricing: boolean;
}

/** Minimum price when route pricing returns zero or manual. */
export const REQUEST_PRICE_FALLBACK = 1;
