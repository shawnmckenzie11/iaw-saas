import { Waybill } from '../pages/DashboardPage';

/** Fallback waybill data used when the API is unreachable offline. */
export const FALLBACK_WAYBILLS: Waybill[] = [
  {
    waybillNumber: 'W-001',
    status: 'PICKED_UP',
    driverId: 'drv-01',
    pickupLocationName: 'Wajax',
    pickupAddress: 'Sudbury, ON',
    dropoffDestinationName: 'Redpath Mine',
    parcelDescription: 'Drill Bits',
  },
  {
    waybillNumber: 'W-002',
    status: 'DRAFT',
    driverId: null,
    pickupLocationName: 'Komatsu',
    pickupAddress: 'Sudbury, ON',
    dropoffDestinationName: 'Victoria Mine',
    parcelDescription: 'Hydraulic Parts',
  },
  {
    waybillNumber: 'W-003',
    status: 'DRAFT',
    driverId: 'drv-02',
    pickupLocationName: 'Sling Choker',
    pickupAddress: 'Sudbury, ON',
    dropoffDestinationName: 'Creighton Mine',
    parcelDescription: 'Cables',
  },
];
