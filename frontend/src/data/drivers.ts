/** Synthetic driver roster used for dispatch assignment chips and table labels. */
export const DRIVERS = [
  { id: 'drv-01', firstName: 'Shawn', lastName: 'McKenzie', qboDriverId: '101' },
  { id: 'drv-02', firstName: 'Driver', lastName: 'Two', qboDriverId: '102' },
  { id: 'drv-03', firstName: 'Sarah', lastName: 'Connor', qboDriverId: '103' },
  { id: 'drv-04', firstName: 'Alex', lastName: 'Mercer', qboDriverId: '104' },
] as const;

/**
 * Returns the display first name for a driver id, or a fallback label.
 */
export function driverFirstName(driverId: string | null | undefined): string {
  if (!driverId) return 'Unassigned';
  return DRIVERS.find((d) => d.id === driverId)?.firstName ?? driverId;
}
