import { computeTopPickups } from './archiveCsvImporter';
import type { ParsedArchiveRow } from './archiveCsvImporter';

function pickupRow(name: string, index: number): ParsedArchiveRow {
  return {
    timestamp: new Date(`2026-01-${String((index % 28) + 1).padStart(2, '0')}`),
    pickupLocationName: name,
    dropoffDestinationName: 'Toromont',
    pickupAddress: `${name} addr`,
    dropoffAddress: 'Toromont addr',
    vehicleType: 'CAR',
    priority: 'REGULAR',
    parcelDescription: 'Standard Package',
    parcelWeightClass: 'Weight: Under 75',
    parcelWeightLbs: null,
    contactName: '',
    contactPhone: '',
    additionalComments: '',
    calculatedPrice: 50,
    priceCategory: 'Cat 1',
    skidRequired: false,
    requiresManualPricing: false,
  };
}

describe('computeTopPickups', () => {
  it('returns the top 10 pickups by frequency in trailing window', () => {
    const rows: ParsedArchiveRow[] = [];
    const pickups = [
      'Wajax',
      'Toromont',
      'Komatsu (260)',
      'Komatsu (145 McGill)',
      'Epiroc Lively',
      'Sandvik Mining',
      'MacLean Engineering',
      'Strongco',
      'Nedco',
      'Anmar',
      'Consbec',
      'Dunrite',
    ];

    pickups.forEach((name, index) => {
      const count = 12 - index;
      for (let i = 0; i < count; i += 1) {
        rows.push(pickupRow(name, rows.length));
      }
    });

    const top = computeTopPickups(rows);
    expect(top).toHaveLength(10);
    expect(top[0]).toBe('Wajax');
    expect(top[9]).toBe('Anmar');
    expect(top).not.toContain('Consbec');
  });

  it('maps archive pickup aliases to verified business names', () => {
    const rows = [
      pickupRow('KOMATSU 260', 0),
      pickupRow('KOMATSU 260', 1),
      pickupRow('Wajax', 2),
    ];

    const top = computeTopPickups(rows);
    expect(top[0]).toBe('Komatsu (260)');
    expect(top[1]).toBe('Wajax');
  });
});
