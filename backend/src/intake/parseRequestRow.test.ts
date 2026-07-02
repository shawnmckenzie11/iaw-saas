import {
  isSkidRequiredFromVehicle,
  mapFormPriority,
  parseExplicitWeightLbs,
  parseRequestFields,
  resolveRequestPrice,
} from './parseRequestRow';
import { REQUEST_PRICE_FALLBACK } from './types';

describe('parseRequestFields', () => {
  it('parses a 2026-format form row with contact and rush priority', () => {
    const fields = [
      '2026-07-01 15:10:00',
      'Jannatec Technologies',
      'Komatsu',
      'TRUCK',
      '2026-07-01',
      'RUSH',
      'Business',
      'Please hurry',
      'Drill Gear Assy',
      'Test Contact One',
      '555-0199',
      '16:00',
    ];

    const parsed = parseRequestFields(fields);
    expect(parsed).not.toBeNull();
    expect(parsed?.pickupLocationName).toBe('Jannetec');
    expect(parsed?.dropoffDestinationName).toBe('Komatsu (260)');
    expect(parsed?.priority).toBe('RUSH');
    expect(parsed?.vehicleType).toBe('TRUCK');
    expect(parsed?.requiresManualPricing).toBe(false);
    expect(parsed?.contactName).toBe('Test Contact One');
    expect(parsed?.contactPhone).toBe('555-0199');
    expect(parsed?.additionalComments).toBe('Please hurry');
    expect(parsed?.parcelDescription).toBe('Drill Gear Assy');
  });

  it('treats Eco form selection as rush', () => {
    const fields = [
      '2026-07-02 10:00:00',
      'Brankor',
      'Epiroc',
      'Car',
      '',
      'Eco',
      '',
      '',
      'Parts',
      '',
      '',
    ];

    const parsed = parseRequestFields(fields);
    expect(parsed?.priority).toBe('RUSH');
  });

  it('marks skid required for 3/4 tonne cargo van selections', () => {
    expect(isSkidRequiredFromVehicle('3/4 tonne Cargo Van')).toBe(true);

    const parsed = parseRequestFields([
      '2026-07-02 10:00:00',
      'Brankor',
      'Epiroc',
      '3/4 tonne Cargo Van',
      '',
      'Regular',
      '',
      '',
      'Pallet freight',
      '',
      '',
    ]);
    expect(parsed?.skidRequired).toBe(true);
    expect(parsed?.vehicleType).toBe('CARGO_VAN');
  });

  it('keeps raw pickup and dropoff text when locations are not confidently mapped', () => {
    const fields = [
      '6/25/2026 12:57:32',
      'bus depot on elm street',
      'unknown dropoff corner',
      'Car',
      'Regular',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ];

    const parsed = parseRequestFields(fields);
    expect(parsed).not.toBeNull();
    expect(parsed?.pickupLocationName).toBe('bus depot on elm street');
    expect(parsed?.dropoffDestinationName).toBe('unknown dropoff corner');
    expect(parsed?.requiresManualPricing).toBe(true);
    expect(parsed?.calculatedPrice).toBe(0);
    expect(parsed?.priceCategory).toContain('dispatch approval');
  });

  it('returns null when pickup or dropoff is missing', () => {
    expect(parseRequestFields(['2026-07-01', '', 'Komatsu'])).toBeNull();
    expect(parseRequestFields(['2026-07-01', 'Jannetec', ''])).toBeNull();
  });
});

describe('mapFormPriority', () => {
  it('maps rush and eco to RUSH', () => {
    expect(mapFormPriority('RUSH')).toBe('RUSH');
    expect(mapFormPriority('Eco')).toBe('RUSH');
    expect(mapFormPriority('Regular')).toBe('REGULAR');
  });
});

describe('parseExplicitWeightLbs', () => {
  it('accepts numeric values over 75 lbs', () => {
    expect(parseExplicitWeightLbs('150')).toBe(150);
    expect(parseExplicitWeightLbs('150 lbs')).toBe(150);
    expect(parseExplicitWeightLbs('76')).toBe(76);
  });

  it('ignores blank or under-75 values', () => {
    expect(parseExplicitWeightLbs('')).toBeNull();
    expect(parseExplicitWeightLbs('75')).toBeNull();
    expect(parseExplicitWeightLbs('50')).toBeNull();
  });
});

describe('parseRequestFields with weight column', () => {
  const headers = [
    'Timestamp',
    'Pick Up Location',
    'Destination',
    'Vehicle Type',
    'Date of Delivery',
    'Priority',
    'Business or Residential?',
    'Additional Comments',
    'Description of Parcel',
    'Weight (lbs if over 75)',
    'Name',
    'Phone Number',
    'Requested Time of Pick-Up',
  ];

  it('uses the dedicated weight field for pricing surcharges', () => {
    const parsed = parseRequestFields(
      [
        '2026-07-02 10:00:00',
        'Brankor',
        'Epiroc',
        'Car',
        '',
        'Regular',
        '',
        '',
        'Heavy gearbox',
        '150',
        '',
        '',
        '',
      ],
      headers
    );

    expect(parsed?.parcelWeightLbs).toBe(150);
    expect(parsed?.parcelWeightClass).toBe('150 lbs');
    expect(parsed?.calculatedPrice).toBeGreaterThan(50);
  });
});

describe('resolveRequestPrice', () => {
  it('returns zero when dispatch must approve pricing', () => {
    const row = parseRequestFields([
      '2026-07-01',
      'Unknown Place XYZ',
      'Another Unknown ABC',
      'Car',
      '',
      'Regular',
      '',
      '',
      'Package',
      '',
      '',
    ]);
    expect(row).not.toBeNull();
    if (!row) return;

    expect(resolveRequestPrice(row)).toBe(0);
  });

  it('uses fallback when mapped route pricing returns zero', () => {
    const row = parseRequestFields([
      '2026-07-01',
      'Brankor',
      'Epiroc',
      'Car',
      '',
      'Regular',
      '',
      '',
      'Package',
      '',
      '',
    ]);
    expect(row).not.toBeNull();
    if (!row) return;

    row.calculatedPrice = 0;
    expect(resolveRequestPrice(row)).toBe(REQUEST_PRICE_FALLBACK);
  });
});
