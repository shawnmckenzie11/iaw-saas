/**
 * Approximate coordinates for verified business locations (no street addresses).
 * Used when regenerating frontend location suggestions from archive CSV at seed time.
 */
export const LOCATION_COORDS: Record<string, { lat: number; lon: number }> = {
  'ALS Environmental': { lat: 46.529, lon: -80.931 },
  Airport: { lat: 46.625, lon: -80.799 },
  Anmar: { lat: 46.489, lon: -80.991 },
  'B&D Manufacturing': { lat: 46.522, lon: -80.945 },
  'BDI Canada Inc.': { lat: 46.518, lon: -80.952 },
  'Bélanger Construction': { lat: 46.491, lon: -80.989 },
  'Brankor Trophies': { lat: 46.487, lon: -80.995 },
  'Bus (ON)': { lat: 46.491, lon: -80.994 },
  'Bull Power': { lat: 46.485, lon: -81.001 },
  Consbec: { lat: 46.478, lon: -81.012 },
  'CRD (Creighton Rock Drill)': { lat: 46.476, lon: -81.015 },
  'DMC Mining Services': { lat: 46.474, lon: -81.018 },
  'Dr. Jordi Cisa': { lat: 46.492, lon: -80.987 },
  Dunrite: { lat: 46.481, lon: -81.008 },
  'Enterprise Radiators': { lat: 46.483, lon: -81.005 },
  'Fed Ex Depot (new sudbury)': { lat: 46.512, lon: -80.918 },
  'Epiroc Lively': { lat: 46.431, lon: -81.078 },
  'Equipment North': { lat: 46.479, lon: -81.01 },
  'Equipment Sales': { lat: 46.477, lon: -81.013 },
  Jannetec: { lat: 46.432, lon: -81.076 },
  'Komatsu (145 McGill)': { lat: 46.428, lon: -81.084 },
  'Komatsu (260)': { lat: 46.4305, lon: -81.082 },
  'MacLean Engineering': { lat: 46.433, lon: -81.075 },
  'Metal-Air Mechanical': { lat: 46.48, lon: -81.007 },
  'Mobile Parts Inc.': { lat: 46.486, lon: -81.0 },
  Nedco: { lat: 46.49, lon: -80.993 },
  Northfast: { lat: 46.475, lon: -81.016 },
  'Onaping Depth Project (ODP)': { lat: 46.465, lon: -81.025 },
  'Puro Depot (Lively/Kelly Lake)': { lat: 46.418, lon: -81.088 },
  Rastall: { lat: 46.484, lon: -81.004 },
  'Redpath (Falconbridge Rd)': { lat: 46.472, lon: -81.02 },
  'Redpath (North)': { lat: 46.468, lon: -81.028 },
  'Rock-Tech': { lat: 46.434, lon: -81.074 },
  'Sandvik Mining': { lat: 46.435, lon: -81.073 },
  'Shop Industrial': { lat: 46.488, lon: -80.996 },
  'Skyline Helicopter Technologies': { lat: 46.471, lon: -81.021 },
  'Sling-Choker Manufacturing': { lat: 46.473, lon: -81.019 },
  Staples: { lat: 46.493, lon: -80.985 },
  Strongco: { lat: 46.436, lon: -81.072 },
  'Tim McDowell Equipment (TME)': { lat: 46.437, lon: -81.071 },
  'Timberland Equipment Limited': { lat: 46.438, lon: -81.07 },
  Toromont: { lat: 46.439, lon: -81.069 },
  'Total Equipment Services': { lat: 46.44, lon: -81.068 },
  'Tracks & Wheels': { lat: 46.441, lon: -81.067 },
  'Victoria Mine': { lat: 46.442, lon: -81.066 },
  Wajax: { lat: 46.443, lon: -81.065 },
};

/**
 * Canonical street addresses for verified businesses without archive frequency data.
 */
export const LOCATION_ADDRESSES: Record<string, string> = {
  'Fed Ex Depot (new sudbury)':
    '1399 Marcus Dr Unit A001 Suite, Greater Sudbury, ON P3B 4K6',
  'Puro Depot (Lively/Kelly Lake)':
    '1300 Kelly Lake Rd, Greater Sudbury, ON P3E 5P4',
};
