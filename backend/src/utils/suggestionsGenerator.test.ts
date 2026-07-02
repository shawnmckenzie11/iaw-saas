import {
  buildCommonPickups,
  buildSuggestionsArtifact,
  computeConditionalDropoffs,
  computeLocationAddresses,
  SUGGESTIONS_ARCHIVE_MIN_ROWS,
} from './suggestionsGenerator';
import { VERIFIED_BUSINESSES } from './csvLocationMapper';
import type { ParsedArchiveRow } from './archiveCsvImporter';

function makeRow(
  pickup: string,
  dropoff: string,
  pickupAddress = `${pickup} address`,
  dropoffAddress = `${dropoff} address`
): ParsedArchiveRow {
  return {
    timestamp: new Date('2026-01-15'),
    pickupLocationName: pickup,
    dropoffDestinationName: dropoff,
    pickupAddress,
    dropoffAddress,
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

describe('suggestionsGenerator', () => {
  it('buildCommonPickups returns sorted verified businesses', () => {
    const pickups = buildCommonPickups();
    expect(pickups).toHaveLength(VERIFIED_BUSINESSES.length);
    expect(pickups[0]).toBe('Airport');
    expect(pickups).toEqual([...pickups].sort((a, b) => a.localeCompare(b)));
  });

  it('computeConditionalDropoffs ranks dropoffs by frequency per pickup', () => {
    const rows = [
      makeRow('Komatsu (260)', 'Wajax'),
      makeRow('Komatsu (260)', 'Wajax'),
      makeRow('Komatsu (260)', 'Toromont'),
      makeRow('Wajax', 'Komatsu (260)'),
    ];

    const dropoffs = computeConditionalDropoffs(rows);
    expect(dropoffs['Komatsu (260)']).toEqual(['Wajax', 'Toromont']);
    expect(dropoffs['Wajax']).toEqual(['Komatsu (260)']);
  });

  it('computeLocationAddresses picks the most frequent raw address', () => {
    const rows = [
      makeRow('Wajax', 'Toromont', '199 Mumford Rd', 'Toromont addr'),
      makeRow('Wajax', 'Toromont', '199 Mumford Rd', 'Toromont addr'),
      makeRow('Wajax', 'Toromont', '200 Other Rd', 'Toromont addr'),
    ];

    const addresses = computeLocationAddresses(rows);
    expect(addresses.get('Wajax')).toBe('199 Mumford Rd');
  });

  it('buildSuggestionsArtifact includes common pickups and conditional routes', () => {
    const rows = Array.from({ length: SUGGESTIONS_ARCHIVE_MIN_ROWS }, (_, i) =>
      makeRow('Wajax', i % 2 === 0 ? 'Toromont' : 'Komatsu (260)')
    );

    const artifact = buildSuggestionsArtifact(rows);
    expect(artifact.commonPickups.length).toBeGreaterThan(40);
    expect(artifact.conditionalDropoffs['Wajax']?.length).toBeGreaterThan(0);
    expect(artifact.locations['Wajax']?.address).toBe('Wajax address');
    expect(artifact.locations['Wajax']?.lat).toBeDefined();
  });
});
