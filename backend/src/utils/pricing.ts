// Types mapping price categories
export function getPriceCategory(locationName: string): string | null {
  if (!locationName) return null;
  const name = locationName.trim().toLowerCase();
  
  if (name.includes('onaping') || name.includes('odp') || name.includes('craig mine')) {
    return 'CATEGORY_3'; // Redpath ODP
  }
  if (name.includes('victoria mine') || name.includes('victoria mining')) {
    return 'CATEGORY_4'; // Victoria Mining
  }

  if (isBusOn(name)) return 'BUS_ON';
  if (isAirport(name)) return 'AIRPORT';
  
  // Category 1: Chelmsford / Hanmer
  const cat1List = ['total equip', 'bnd manufacturing', 'b&d manufacturing', 'belanger construction', 'bélanger construction', 'brancore', 'brankor'];
  if (cat1List.some(item => name.includes(item)) || name.includes('chelmsford') || name.includes('hanmer')) {
    return 'CATEGORY_1';
  }
  
  // Category 2: Val Caron / Azilda
  const cat2List = ['tracks & wheels', 'tracks and wheels', 'mobile parts', 'dmc mining', 'metal air', 'metal-air', 'consbec', 'mcdowell', 'tme'];
  if (cat2List.some(item => name.includes(item)) || name.includes('val caron') || name.includes('azilda') || name.includes('val therese') || name.includes('val thérèse')) {
    return 'CATEGORY_2';
  }

  // Category 5 Nodes mapping
  if (isSouthEnd(name)) return 'SOUTH_END';
  if (isNewSudbury(name)) return 'NEW_SUDBURY';
  if (isDowntown(name)) return 'DOWNTOWN';
  if (isLively(name)) return 'LIVELY';

  return null;
}

/** Ontario Northland bus terminal (Sudbury). */
function isBusOn(name: string): boolean {
  return (
    name.includes('bus (on)') ||
    name.includes('ontario northland') ||
    name.includes('northland bus') ||
    name === 'bus' ||
    name.includes('bus depot') ||
    name.includes('greyhound bus')
  );
}

/** Sudbury Airport. */
function isAirport(name: string): boolean {
  return name.includes('airport') || name.includes('sudbury airport');
}

function isSouthEnd(name: string): boolean {
  const list = ['sling choker', 'sling-choker', 'cisa', 'enterprise rad', 'enterprise radiator', 'regent st', 'algonquin'];
  return list.some(item => name.includes(item)) || name.includes('south end');
}

function isNewSudbury(name: string): boolean {
  const list = ['timberland', 'bdi', 'redpath (falconbridge', 'falconbridge rd', 'bull power', 'bull powertrain', 'nedco', 'frobisher', 'elisabella', 'als environmental', 'als', 'jannatec', 'jannetec', 'maley'];
  return list.some(item => name.includes(item)) || name.includes('new sudbury');
}

function isDowntown(name: string): boolean {
  const list = ['staples', 'notre dame', 'rastall', 'hemlock', 'mla law', 'mackenzie', 'gsu', 'viacore', 'martindale', 'flocor', 'cambrian heights', 'northfast', 'regent st s'];
  return list.some(item => name.includes(item)) || name.includes('downtown');
}

function isLively(name: string): boolean {
  const list = [
    'komatsu', 'skyline', 'mclean', 'maclean', 'rocktek', 'rock-tech', 'sandvik', 'crd', 'creighton', 
    'tormont', 'toromont', 'wajax', 'epiroc', 'epirock', 'anmar', 'strongco', 'equipment sales', 
    'dunrite', 'shop industrial', 'equipment north', 'fielding', 'magill', 'mumford', 'lively'
  ];
  return list.some(item => name.includes(item));
}

// Compute adjacent hop distances in Category 5 cycle
// South End (0) <-> New Sudbury (1) <-> Downtown (2) <-> Lively (3) <-> South End (0)
const NODE_INDEX: Record<string, number> = {
  'SOUTH_END': 0,
  'NEW_SUDBURY': 1,
  'DOWNTOWN': 2,
  'LIVELY': 3,
};

function calculateBasePrice(pickup: string, dropoff: string): { price: number; isManual: boolean; category: string } {
  const catP = getPriceCategory(pickup);
  const catD = getPriceCategory(dropoff);

  // Rule: Bus (ON) dropoff ($15)
  if (catD === 'BUS_ON') {
    return { price: 15, isManual: false, category: 'Bus (ON)' };
  }

  // Rule: Airport dropoff ($75)
  if (catD === 'AIRPORT') {
    return { price: 75, isManual: false, category: 'Airport' };
  }

  // Rule 3: Redpath ODP ($125)
  if (catP === 'CATEGORY_3' || catD === 'CATEGORY_3') {
    return { price: 125, isManual: false, category: 'Category 3 (Redpath ODP)' };
  }

  // Rule 4: Victoria Mining ($120)
  if (catP === 'CATEGORY_4' || catD === 'CATEGORY_4') {
    return { price: 120, isManual: false, category: 'Category 4 (Victoria Mining)' };
  }

  // Check Category 5 nodes
  const nodeP = catP ? NODE_INDEX[catP] : null;
  const nodeD = catD ? NODE_INDEX[catD] : null;

  const isCat5P = nodeP !== undefined && nodeP !== null;
  const isCat5D = nodeD !== undefined && nodeD !== null;

  // Category 1 & 2: Sudbury to Chelmsford/Hanmer or Val Caron/Azilda
  // "Sudbury" is defined as any Category 5 location
  const isSudburyP = isCat5P;
  const isSudburyD = isCat5D;

  const isCat1P = catP === 'CATEGORY_1';
  const isCat1D = catD === 'CATEGORY_1';

  const isCat2P = catP === 'CATEGORY_2';
  const isCat2D = catD === 'CATEGORY_2';

  // Category 1: Sudbury <-> Chelmsford/Hanmer ($50)
  if ((isSudburyP && isCat1D) || (isCat1P && isSudburyD)) {
    return { price: 50, isManual: false, category: 'Category 1 (Sudbury ↔ Chelmsford/Hanmer)' };
  }

  // Category 2: Sudbury <-> Val Caron/Azilda ($40)
  if ((isSudburyP && isCat2D) || (isCat2P && isSudburyD)) {
    return { price: 40, isManual: false, category: 'Category 2 (Sudbury ↔ Val Caron/Azilda)' };
  }

  // Category 5: 4-node Cycle ($30 within/adjacent, $35 opposite)
  if (isCat5P && isCat5D) {
    const pIdx = nodeP!;
    const dIdx = nodeD!;

    if (pIdx === dIdx) {
      return { price: 30, isManual: false, category: 'Category 5 (Within Node)' };
    }

    const diff = Math.abs(pIdx - dIdx);
    const distance = diff === 3 ? 1 : diff; // Wrap around for cycle: 0 <-> 3 is distance 1

    if (distance === 1) {
      return { price: 30, isManual: false, category: 'Category 5 (Adjacent Nodes)' };
    } else {
      return { price: 35, isManual: false, category: 'Category 5 (Opposite Nodes)' };
    }
  }

  // Fallback: Pending Dispatcher Quote
  return { price: 0, isManual: true, category: 'Pending Dispatcher Quote' };
}

export function calculatePrice(
  pickup: string, 
  dropoff: string, 
  weightClass?: string, 
  skidRequired?: boolean,
  priority?: 'REGULAR' | 'RUSH'
): { price: number; isManual: boolean; category: string } {
  const result = calculateBasePrice(pickup, dropoff);
  let finalPrice = result.price;
  let isManual = result.isManual;
  let category = result.category;

  let surchargeText = '';
  
  // Weight surcharge: over 75 lbs, add $7.50 for every 100 lbs over
  if (weightClass && weightClass !== 'Weight: Under 75') {
    const numWeight = parseFloat(weightClass.replace(/[^0-9.]/g, ''));
    if (!isNaN(numWeight) && numWeight > 75) {
      const extraWeight = numWeight - 75;
      const extraCharge = Math.ceil(extraWeight / 100) * 7.50;
      if (finalPrice > 0) {
        finalPrice += extraCharge;
      }
      surchargeText += ` + Weight Surcharge ($${extraCharge.toFixed(2)})`;
    }
  }

  // Skid surcharge: add $20 charge
  if (skidRequired) {
    if (finalPrice > 0) {
      finalPrice += 20;
    }
    surchargeText += ` + Skid Surcharge ($20.00)`;
  }

  // Rush surcharge: add $15 charge
  if (priority === 'RUSH') {
    if (finalPrice > 0) {
      finalPrice += 15;
    }
    surchargeText += ` + Rush Surcharge ($15.00)`;
  }

  if (surchargeText) {
    category += ` (Base${surchargeText})`;
  }

  return { price: finalPrice, isManual, category };
}

export function getLocationShortName(name: string): string {
  if (!name) return '';
  switch (name.trim()) {
    case "ALS Environmental": return "ALS Env";
    case "Jannetec": return "Jannetec";
    case "Rastall": return "Rastall";
    case "Northfast": return "Northfast";
    case "Total Equipment Services": return "Total Equip";
    case "B&D Manufacturing": return "B&D Mfg";
    case "Bélanger Construction": return "Bélanger";
    case "Brankor Trophies": return "Brankor";
    case "Tracks & Wheels": return "Tracks & Wheels";
    case "Mobile Parts Inc.": return "Mobile Parts";
    case "DMC Mining Services": return "DMC Mining";
    case "Metal-Air Mechanical": return "Metal-Air";
    case "Consbec": return "Consbec";
    case "Tim McDowell Equipment (TME)": return "McDowell (TME)";
    case "Onaping Depth Project (ODP)": return "Redpath ODP";
    case "Victoria Mine": return "Victoria Mine";
    case "Komatsu (260)": return "Komatsu (260)";
    case "Komatsu (145 McGill)": return "Komatsu (McGill)";
    case "Skyline Helicopter Technologies": return "Skyline";
    case "MacLean Engineering": return "MacLean";
    case "Rock-Tech": return "Rock-Tech";
    case "Sandvik Mining": return "Sandvik";
    case "CRD (Creighton Rock Drill)": return "CRD (Creighton)";
    case "Toromont": return "Toromont";
    case "Wajax": return "Wajax";
    case "Epiroc Lively": return "Epiroc";
    case "Anmar": return "Anmar";
    case "Strongco": return "Strongco";
    case "Equipment Sales": return "Equip Sales";
    case "Dunrite": return "Dunrite";
    case "Shop Industrial": return "Shop Ind";
    case "Equipment North": return "Equip North";
    case "Timberland Equipment Limited": return "Timberland";
    case "BDI Canada Inc.": return "BDI";
    case "Redpath (Falconbridge Rd)": return "Redpath (Falcon)";
    case "Bull Power": return "Bull Power";
    case "Nedco": return "Nedco";
    case "Sling-Choker Manufacturing": return "Sling-Choker";
    case "Dr. Jordi Cisa": return "Dr. Cisa";
    case "Enterprise Radiators": return "Enterprise Rad";
    case "Staples": return "Staples";
    case "Bus (ON)": return "Bus (ON)";
    case "Airport": return "Airport";
    default:
      const parts = name.split(' ');
      if (parts.length > 1) {
        return `${parts[0]} ${parts[1]}`;
      }
      return parts[0];
  }
}

export function getNextWaybillNumber(existingWaybills: string[]): string {
  let maxNum = 0;
  const pattern = /^M(\d{5})$/;
  existingWaybills.forEach(num => {
    if (!num) return;
    const match = num.trim().match(pattern);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val > maxNum) {
        maxNum = val;
      }
    }
  });
  const nextVal = maxNum + 1;
  return `M${String(nextVal).padStart(5, '0')}`;
}

