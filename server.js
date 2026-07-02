const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const CSV_PATH = path.join(__dirname, 'docs', 'BACKUP of Requests - Archive.csv');
const DB_PATH = path.join(__dirname, 'db.json');

// Initialize local JSON database
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
}

const INVOICES_DB_PATH = path.join(__dirname, 'invoices.json');

// Initialize local Invoices JSON database
if (!fs.existsSync(INVOICES_DB_PATH)) {
  fs.writeFileSync(INVOICES_DB_PATH, JSON.stringify([], null, 2));
}

function getInvoices() {
  try {
    const data = fs.readFileSync(INVOICES_DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveInvoices(invoices) {
  fs.writeFileSync(INVOICES_DB_PATH, JSON.stringify(invoices, null, 2));
}

function getDeliveries() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

function saveDeliveries(deliveries) {
  fs.writeFileSync(DB_PATH, JSON.stringify(deliveries, null, 2));
}

// Simple robust CSV row parser (handles quoted fields containing commas)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/^"|"$/g, '').trim());
  return result;
}

// Global state to track how many lines of the CSV we've parsed
let csvLineCount = 0;

function getPriceCategory(locationName) {
  if (!locationName) return null;
  const name = locationName.trim().toLowerCase();
  
  if (name.includes('onaping') || name.includes('odp') || name.includes('craig mine')) {
    return 'CATEGORY_3'; // Redpath ODP
  }
  if (name.includes('victoria mine') || name.includes('victoria mining')) {
    return 'CATEGORY_4'; // Victoria Mining
  }
  
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

function isSouthEnd(name) {
  const list = ['sling choker', 'sling-choker', 'cisa', 'enterprise rad', 'enterprise radiator', 'regent st', 'algonquin'];
  return list.some(item => name.includes(item)) || name.includes('south end');
}

function isNewSudbury(name) {
  const list = ['timberland', 'bdi', 'redpath (falconbridge', 'falconbridge rd', 'bull power', 'bull powertrain', 'nedco', 'frobisher', 'elisabella'];
  return list.some(item => name.includes(item)) || name.includes('new sudbury');
}

function isDowntown(name) {
  const list = ['staples', 'notre dame', 'rastall', 'hemlock', 'mla law', 'mackenzie', 'gsu', 'viacore', 'martindale', 'flocor', 'cambrian heights'];
  return list.some(item => name.includes(item)) || name.includes('downtown');
}

function isLively(name) {
  const list = [
    'komatsu', 'skyline', 'mclean', 'maclean', 'rocktek', 'rock-tech', 'sandvik', 'crd', 'creighton', 
    'tormont', 'toromont', 'wajax', 'epiroc', 'epirock', 'anmar', 'strongco', 'equipment sales', 
    'dunrite', 'shop industrial', 'equipment north', 'fielding', 'magill', 'mumford', 'lively'
  ];
  return list.some(item => name.includes(item));
}

const NODE_INDEX = {
  'SOUTH_END': 0,
  'NEW_SUDBURY': 1,
  'DOWNTOWN': 2,
  'LIVELY': 3,
};

function calculateBasePrice(pickup, dropoff) {
  const catP = getPriceCategory(pickup);
  const catD = getPriceCategory(dropoff);

  // Category 3 (Redpath ODP)
  if (catP === 'CATEGORY_3' || catD === 'CATEGORY_3') {
    return { price: 125, category: 'Category 3 (Redpath ODP)' };
  }

  // Category 4 (Victoria Mining)
  if (catP === 'CATEGORY_4' || catD === 'CATEGORY_4') {
    return { price: 120, category: 'Category 4 (Victoria Mining)' };
  }

  const nodeP = catP ? NODE_INDEX[catP] : null;
  const nodeD = catD ? NODE_INDEX[catD] : null;

  const isCat5P = nodeP !== undefined && nodeP !== null;
  const isCat5D = nodeD !== undefined && nodeD !== null;

  const isSudburyP = isCat5P;
  const isSudburyD = isCat5D;

  const isCat1P = catP === 'CATEGORY_1';
  const isCat1D = catD === 'CATEGORY_1';

  const isCat2P = catP === 'CATEGORY_2';
  const isCat2D = catD === 'CATEGORY_2';

  // Category 1
  if ((isSudburyP && isCat1D) || (isCat1P && isSudburyD)) {
    return { price: 50, category: 'Category 1 (Sudbury ↔ Chelmsford/Hanmer)' };
  }

  // Category 2
  if ((isSudburyP && isCat2D) || (isCat2P && isSudburyD)) {
    return { price: 40, category: 'Category 2 (Sudbury ↔ Val Caron/Azilda)' };
  }

  // Category 5
  if (isCat5P && isCat5D) {
    const pIdx = nodeP;
    const dIdx = nodeD;

    if (pIdx === dIdx) {
      return { price: 30, category: 'Category 5 (Within Node)' };
    }

    const diff = Math.abs(pIdx - dIdx);
    const distance = diff === 3 ? 1 : diff;

    if (distance === 1) {
      return { price: 30, category: 'Category 5 (Adjacent Nodes)' };
    } else {
      return { price: 35, category: 'Category 5 (Opposite Nodes)' };
    }
  }

  return { price: 0, category: 'Pending Dispatcher Quote' };
}

function calculatePrice(pickup, dropoff, weightClass, skidRequired, priority) {
  const result = calculateBasePrice(pickup, dropoff);
  let finalPrice = result.price;
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

  return { price: finalPrice, category };
}

function getNextWaybillNumber(existingWaybills) {
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

function scanCSV() {
  if (!fs.existsSync(CSV_PATH)) {
    console.warn(`CSV file not found at: ${CSV_PATH}`);
    return;
  }

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);

  if (csvLineCount === 0) {
    // On first boot, mark all existing lines as parsed so we don't dump 7600 historical entries
    csvLineCount = lines.length;
    console.log(`CSV Watcher Initialized: Tracked ${csvLineCount} initial rows. Waiting for new additions...`);
    return;
  }

  if (lines.length > csvLineCount) {
    const newLines = lines.slice(csvLineCount);
    console.log(`Detected ${newLines.length} new delivery request(s) appended to CSV! Ingesting...`);

    const deliveries = getDeliveries();
    
    // Header mappings from the first row of CSV:
    // Timestamp, Pick Up Location, Destination, Vehicle Type, Date of Delivery, Priority, Business or Residential?, Additional Comments, Description of Parcel, Name, Phone Number, Requested Time of Pick-Up
    newLines.forEach((line) => {
      const fields = parseCSVLine(line);
      if (fields.length < 3) return; // invalid row

      const timestamp = fields[0] || new Date().toISOString();
      const pickupLocation = fields[1] || 'Unknown Pickup';
      const dropoffLocation = fields[2] || 'Unknown Dropoff';
      const vehicleType = fields[3] || 'CAR';
      const dateOfDelivery = fields[4] || new Date().toISOString().split('T')[0];
      const priority = (fields[5] || 'Regular').toUpperCase() === 'RUSH' ? 'RUSH' : 'REGULAR';
      const businessOrResidential = fields[6] || 'Business';
      const additionalComments = fields[7] || '';
      const description = fields[8] || 'Parcel';
      const contactName = fields[9] || '';
      const contactPhone = fields[10] || '';
      const requestedPickup = fields[11] || '';

      const clientUuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      const skidRequired = additionalComments.toLowerCase().includes('skid') || description.toLowerCase().includes('skid') || description.toLowerCase().includes('pallet');
      let weightClass = 'Weight: Under 75';
      const weightMatch = (additionalComments + ' ' + description).match(/(\d+)\s*(lbs|lb|pounds|kg)/i);
      if (weightMatch) {
        const val = parseFloat(weightMatch[1]);
        if (val > 75) {
          weightClass = `${val} lbs`;
        }
      }

      const pricing = calculatePrice(pickupLocation, dropoffLocation, weightClass, skidRequired, priority);
      const existingWaybills = deliveries.map(r => r.waybillNumber);
      const waybillNum = getNextWaybillNumber(existingWaybills);

      const newDelivery = {
        id: clientUuid,
        clientSideUuid: clientUuid,
        waybillNumber: waybillNum,
        status: 'DRAFT', // Pending Pickup
        syncStatus: 'SYNCED',
        driverId: null, // Unassigned
        vehicleType,
        parcelDescription: description,
        parcelQuantity: 1,
        parcelWeightClass: weightClass,
        skidRequired,
        pickupLocationName: pickupLocation,
        pickupAddress: pickupLocation + ', Sudbury, ON', // Fallback address format
        pickupContactName: contactName || undefined,
        pickupContactPhone: contactPhone || undefined,
        dropoffDestinationName: dropoffLocation,
        dropoffAddress: dropoffLocation + ', Sudbury, ON',
        priority,
        businessOrResidential,
        additionalComments: additionalComments || undefined,
        requestedPickupTime: requestedPickup || undefined,
        createdAt: timestamp,
        capturedAt: timestamp,
        updatedAt: timestamp,
        calculatedPrice: pricing.price,
        priceCategory: pricing.category
      };

      deliveries.push(newDelivery);
    });

    saveDeliveries(deliveries);
    csvLineCount = lines.length;
  }
}

// Watch CSV file modifications
fs.watchFile(CSV_PATH, { interval: 1000 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    scanCSV();
  }
});

// Run initial scan to set line count index
scanCSV();

// REST API Endpoints
app.get('/api/deliveries', (req, res) => {
  res.json(getDeliveries());
});

app.post('/api/deliveries', (req, res) => {
  const record = req.body;
  if (!record || !record.clientSideUuid) {
    return res.status(400).json({ error: 'Invalid delivery record payload' });
  }

  const deliveries = getDeliveries();
  const index = deliveries.findIndex(d => d.clientSideUuid === record.clientSideUuid);

  if (index >= 0) {
    deliveries[index] = { ...deliveries[index], ...record, updatedAt: new Date().toISOString() };
  } else {
    deliveries.push(record);
  }

  saveDeliveries(deliveries);
  res.json({ success: true, record });
});

// Manual trigger for CSV scanning
app.post('/api/sync-csv', (req, res) => {
  scanCSV();
  res.json({ success: true, deliveries: getDeliveries() });
});

// Invoices REST API Endpoints
app.get('/api/invoices', (req, res) => {
  res.json(getInvoices());
});

app.post('/api/invoices', (req, res) => {
  const invoice = req.body;
  if (!invoice || !invoice.id) {
    return res.status(400).json({ error: 'Invalid invoice payload' });
  }

  const invoices = getInvoices();
  const index = invoices.findIndex(i => i.id === invoice.id);

  if (index >= 0) {
    invoices[index] = { ...invoices[index], ...invoice, updatedAt: new Date().toISOString() };
  } else {
    invoices.push(invoice);
  }

  saveInvoices(invoices);
  res.json({ success: true, invoice });
});

app.delete('/api/invoices/:id', (req, res) => {
  const { id } = req.params;
  const invoices = getInvoices();
  const filtered = invoices.filter(i => i.id !== id);
  saveInvoices(filtered);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`IAW Courier Ingestion Server listening on http://localhost:${PORT}`);
});
