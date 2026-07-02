/**
 * Canonical verified business names used for CSV normalization.
 */
export const VERIFIED_BUSINESSES = [
  'ALS Environmental',
  'Anmar',
  'B&D Manufacturing',
  'BDI Canada Inc.',
  'Bélanger Construction',
  'Brankor Trophies',
  'Bull Power',
  'Consbec',
  'CRD (Creighton Rock Drill)',
  'DMC Mining Services',
  'Dr. Jordi Cisa',
  'Dunrite',
  'Enterprise Radiators',
  'Epiroc Lively',
  'Equipment North',
  'Equipment Sales',
  'Jannetec',
  'Komatsu (145 McGill)',
  'Komatsu (260)',
  'MacLean Engineering',
  'Metal-Air Mechanical',
  'Mobile Parts Inc.',
  'Nedco',
  'Northfast',
  'Onaping Depth Project (ODP)',
  'Rastall',
  'Redpath (Falconbridge Rd)',
  'Rock-Tech',
  'Sandvik Mining',
  'Shop Industrial',
  'Skyline Helicopter Technologies',
  'Sling-Choker Manufacturing',
  'Staples',
  'Strongco',
  'Tim McDowell Equipment (TME)',
  'Timberland Equipment Limited',
  'Toromont',
  'Total Equipment Services',
  'Tracks & Wheels',
  'Victoria Mine',
  'Wajax',
];

/**
 * Maps a raw location string to a verified business using explicit keyword rules only.
 * Does not use fuzzy substring matching — use when intake must be confident.
 */
export function mapToVerifiedConfident(rawName: string | undefined | null): string | null {
  if (!rawName) return null;
  const name = rawName.trim().toLowerCase();

  if (name.includes('joy') || name.includes('komatsu')) {
    if (name.includes('145') || name.includes('magill') || name.includes('mcgill')) {
      return 'Komatsu (145 McGill)';
    }
    return 'Komatsu (260)';
  }

  if (
    name.includes('redpath') ||
    name.includes('red path') ||
    name.includes('north mine') ||
    name.includes('odp') ||
    name.includes('onaping') ||
    name.includes('craig mine')
  ) {
    if (name.includes('falconbridge')) return 'Redpath (Falconbridge Rd)';
    return 'Onaping Depth Project (ODP)';
  }

  if (name.includes('als')) return 'ALS Environmental';
  if (name.includes('anmar')) return 'Anmar';
  if (name.includes('b&d') || name.includes('b & d') || name.includes('b and d')) return 'B&D Manufacturing';
  if (name.includes('bdi')) return 'BDI Canada Inc.';
  if (name.includes('belanger') || name.includes('bélanger')) return 'Bélanger Construction';
  if (name.includes('brankor') || name.includes('brancore')) return 'Brankor Trophies';
  if (name.includes('bull power')) return 'Bull Power';
  if (name.includes('consbec')) return 'Consbec';
  if (name.includes('crd') || name.includes('creighton')) return 'CRD (Creighton Rock Drill)';
  if (name.includes('dmc')) return 'DMC Mining Services';
  if (name.includes('cisa')) return 'Dr. Jordi Cisa';
  if (name.includes('dunrite')) return 'Dunrite';
  if (name.includes('enterprise radiator')) return 'Enterprise Radiators';
  if (name.includes('epiroc') || name.includes('epirock')) return 'Epiroc Lively';
  if (name.includes('equipment north')) return 'Equipment North';
  if (name.includes('equipment sales')) return 'Equipment Sales';
  if (name.includes('jannatec') || name.includes('jannetec')) return 'Jannetec';
  if (name.includes('maclean') || name.includes('mclean')) return 'MacLean Engineering';
  if (name.includes('metal air') || name.includes('metal-air')) return 'Metal-Air Mechanical';
  if (name.includes('mobile parts')) return 'Mobile Parts Inc.';
  if (name.includes('nedco')) return 'Nedco';
  if (name.includes('northfast')) return 'Northfast';
  if (name.includes('rastall')) return 'Rastall';
  if (name.includes('rocktek') || name.includes('rock-tech') || name.includes('rock tech')) return 'Rock-Tech';
  if (name.includes('sandvik')) return 'Sandvik Mining';
  if (name.includes('shop industrial')) return 'Shop Industrial';
  if (name.includes('skyline')) return 'Skyline Helicopter Technologies';
  if (name.includes('sling') || name.includes('choker')) return 'Sling-Choker Manufacturing';
  if (name.includes('staples')) return 'Staples';
  if (name.includes('strongco')) return 'Strongco';
  if (name.includes('mcdowell') || name.includes('tme')) return 'Tim McDowell Equipment (TME)';
  if (name.includes('timberland')) return 'Timberland Equipment Limited';
  if (name.includes('toromont') || name.includes('tormont')) return 'Toromont';
  if (name.includes('total equip')) return 'Total Equipment Services';
  if (name.includes('tracks')) return 'Tracks & Wheels';
  if (name.includes('victoria')) return 'Victoria Mine';
  if (name.includes('wajax')) return 'Wajax';

  return null;
}

/**
 * Maps a raw CSV location string to a verified canonical business name.
 */
export function mapToVerified(rawName: string | undefined | null): string | null {
  const confident = mapToVerifiedConfident(rawName);
  if (confident) return confident;

  if (!rawName) return null;
  const name = rawName.trim().toLowerCase();

  for (const verified of VERIFIED_BUSINESSES) {
    const vLower = verified.toLowerCase();
    if (vLower.includes(name) || name.includes(vLower)) return verified;
  }

  return null;
}

/**
 * Parses a CSV weight description into a weight class string for pricing.
 */
export function parseWeightClass(description: string, additionalComments: string): string {
  let weightClass = 'Weight: Under 75';
  const combined = `${additionalComments} ${description}`;
  const match = combined.match(/(\d+)\s*(lbs|lb|pounds|kg)/i);
  if (match) {
    const val = parseFloat(match[1]);
    if (val > 75) weightClass = `${val} lbs`;
  } else if (combined.toLowerCase().includes('over 100')) {
    weightClass = '150 lbs';
  } else if (combined.toLowerCase().includes('51-100') || combined.toLowerCase().includes('51 - 100')) {
    weightClass = '100 lbs';
  } else if (combined.toLowerCase().includes('11-50') || combined.toLowerCase().includes('11 - 50')) {
    weightClass = '50 lbs';
  }
  return weightClass;
}

/**
 * Normalizes CSV vehicle type strings to Prisma VehicleType values.
 */
export function mapVehicleType(raw: string): 'CAR' | 'MINIVAN' | 'TRUCK' | 'CARGO_VAN' | 'OTHER' {
  const v = (raw || 'CAR').toUpperCase();
  if (v.includes('TRUCK')) return 'TRUCK';
  if (v.includes('MINIVAN') || v.includes('MINI')) return 'MINIVAN';
  if (v.includes('CARGO') || v.includes('VAN')) return 'CARGO_VAN';
  if (v.includes('CAR')) return 'CAR';
  return 'OTHER';
}

/**
 * Parses priority from CSV field.
 */
export function mapPriority(raw: string): 'REGULAR' | 'RUSH' {
  return (raw || '').trim().toUpperCase() === 'RUSH' ? 'RUSH' : 'REGULAR';
}
