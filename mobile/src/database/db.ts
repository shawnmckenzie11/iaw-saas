import { Platform } from 'react-native';

export type DeliveryStatus = 'DRAFT' | 'PICKED_UP' | 'DELIVERED' | 'INVOICED' | 'VOIDED';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT';
export type QboSyncStatus = 'NOT_SYNCED' | 'SYNCED' | 'FAILED';

export interface DeliveryRecord {
  id: string;
  clientSideUuid: string;
  waybillNumber: string;
  status: DeliveryStatus;
  syncStatus: SyncStatus;
  syncError?: string;
  customerId?: string;
  qboCustomerId?: string;
  driverId?: string | null;
  vehicleType: string;
  parcelDescription: string;
  parcelQuantity: number;
  parcelWeightLbs?: number;
  parcelWeightClass?: string;
  parcelDimensions?: string;
  pickupLocationName: string;
  pickupAddress: string;
  pickupContactName?: string;
  pickupContactPhone?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  dropoffDestinationName: string;
  dropoffAddress: string;
  dropoffContactName?: string;
  dropoffContactPhone?: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  priority: 'REGULAR' | 'RUSH';
  businessOrResidential?: string;
  additionalComments?: string;
  requestedPickupTime?: string;
  createdAt: string;
  capturedAt: string;
  signedAt?: string;
  deliveredAt?: string;
  syncedAt?: string;
  updatedAt: string;
  signatureName?: string;
  signatureImageUrl?: string;
  signatureHash?: string;
  signatureConsentText?: string;
  signatureIpAddress?: string;
  signatureGpsLatitude?: number;
  signatureGpsLongitude?: number;
  proofPhotoUrl?: string;
  skidRequired?: boolean;
  calculatedPrice?: number;
  priceCategory?: string;
  podRequired?: boolean;
  optionalNotes?: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerName: string;
  billingMonth: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: 'DRAFT' | 'SENT' | 'PAID' | 'VOIDED';
  createdAt: string;
  updatedAt: string;
  waybillNumbers: string[];
}

const API_URL = 'http://localhost:3001/api/deliveries';
const INVOICES_API_URL = 'http://localhost:3001/api/invoices';

async function fetchWithTimeout(url: string, options?: RequestInit, timeout = 1200): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// Memory/LocalStorage database for Web compatibility / Mock preview
class WebStorageDatabase {
  private STORAGE_KEY = 'iaw_delivery_records';

  private getRecords(): DeliveryRecord[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  }

  private saveRecords(records: DeliveryRecord[]) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(records));
    }
  }

  async init(): Promise<void> {
    console.log('WebStorageDatabase initialized');
  }

  async getDeliveryRecords(): Promise<DeliveryRecord[]> {
    try {
      // 1. Try to sync local pending records to server first
      const localRecords = this.getRecords();
      const pendings = localRecords.filter(r => r.syncStatus === 'PENDING');
      for (const record of pendings) {
        await fetchWithTimeout(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...record, syncStatus: 'SYNCED' })
        });
      }

      // 2. Fetch latest list from API
      const serverRecords = await fetchWithTimeout(API_URL);
      
      // Cache server records locally
      this.saveRecords(serverRecords);
      return serverRecords.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.log('API offline, loading from localStorage fallback:', err);
      return this.getRecords().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  async saveDeliveryRecord(record: DeliveryRecord): Promise<void> {
    const records = this.getRecords();
    const index = records.findIndex(r => r.clientSideUuid === record.clientSideUuid);
    
    let targetRecord = { ...record };
    if (index >= 0) {
      records[index] = { ...record, updatedAt: new Date().toISOString() };
      targetRecord = records[index];
    } else {
      records.push(record);
    }
    
    // Save locally first
    this.saveRecords(records);

    // Try posting to API
    try {
      await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...targetRecord, syncStatus: 'SYNCED' })
      });
      // Update local to SYNCED
      await this.updateSyncStatus(record.clientSideUuid, 'SYNCED');
    } catch (e) {
      console.log('Save API offline, left as PENDING upload');
      await this.updateSyncStatus(record.clientSideUuid, 'PENDING');
    }
  }

  async updateSyncStatus(clientSideUuid: string, syncStatus: SyncStatus, syncError?: string): Promise<void> {
    const records = this.getRecords();
    const index = records.findIndex(r => r.clientSideUuid === clientSideUuid);
    if (index >= 0) {
      records[index].syncStatus = syncStatus;
      records[index].syncError = syncError;
      records[index].syncedAt = syncStatus === 'SYNCED' ? new Date().toISOString() : undefined;
      records[index].updatedAt = new Date().toISOString();
      this.saveRecords(records);
    }
  }

  private getInvoiceRecords(): InvoiceRecord[] {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    const data = localStorage.getItem('iaw_invoice_records');
    return data ? JSON.parse(data) : [];
  }

  private saveInvoiceRecords(invoices: InvoiceRecord[]) {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('iaw_invoice_records', JSON.stringify(invoices));
    }
  }

  async getInvoices(): Promise<InvoiceRecord[]> {
    try {
      const serverInvoices = await fetchWithTimeout(INVOICES_API_URL);
      this.saveInvoiceRecords(serverInvoices);
      return serverInvoices.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (err) {
      console.log('Invoices API offline, loading fallback local invoices:', err);
      return this.getInvoiceRecords().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }

  async saveInvoice(invoice: InvoiceRecord): Promise<void> {
    const invoices = this.getInvoiceRecords();
    const index = invoices.findIndex(i => i.id === invoice.id);
    if (index >= 0) {
      invoices[index] = { ...invoice, updatedAt: new Date().toISOString() };
    } else {
      invoices.push(invoice);
    }
    this.saveInvoiceRecords(invoices);

    try {
      await fetchWithTimeout(INVOICES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice)
      });
    } catch (e) {
      console.log('Save invoice API offline, stored locally');
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    const invoices = this.getInvoiceRecords();
    const filtered = invoices.filter(i => i.id !== id);
    this.saveInvoiceRecords(filtered);

    try {
      await fetchWithTimeout(`${INVOICES_API_URL}/${id}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.log('Delete invoice API offline, deleted locally');
    }
  }
}

// Native SQLite database using expo-sqlite
class SQLiteNativeDatabase {
  private db: any = null;

  async init(): Promise<void> {
    const ExpoSQLite = require('expo-sqlite');
    this.db = await ExpoSQLite.openDatabaseAsync('iaw_courier.db');
    
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS delivery_records (
        id TEXT PRIMARY KEY,
        client_side_uuid TEXT UNIQUE NOT NULL,
        waybill_number TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        sync_error TEXT,
        customer_id TEXT,
        qbo_customer_id TEXT,
        driver_id TEXT,
        vehicle_type TEXT NOT NULL,
        parcel_description TEXT NOT NULL,
        parcel_quantity INTEGER NOT NULL,
        parcel_weight_lbs REAL,
        parcel_weight_class TEXT,
        parcel_dimensions TEXT,
        pickup_location_name TEXT NOT NULL,
        pickup_address TEXT NOT NULL,
        pickup_contact_name TEXT,
        pickup_contact_phone TEXT,
        pickup_latitude REAL,
        pickup_longitude REAL,
        dropoff_destination_name TEXT NOT NULL,
        dropoff_address TEXT NOT NULL,
        dropoff_contact_name TEXT,
        dropoff_contact_phone TEXT,
        dropoff_latitude REAL,
        dropoff_longitude REAL,
        priority TEXT NOT NULL,
        business_or_residential TEXT,
        additional_comments TEXT,
        requested_pickup_time TEXT,
        created_at TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        signed_at TEXT,
        delivered_at TEXT,
        synced_at TEXT,
        updated_at TEXT NOT NULL,
        signature_name TEXT,
        signature_image_url TEXT,
        signature_hash TEXT,
        signature_consent_text TEXT,
        signature_ip_address TEXT,
        signature_gps_latitude REAL,
        signature_gps_longitude REAL,
        proof_photo_url TEXT
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS invoice_records (
        id TEXT PRIMARY KEY,
        invoice_number TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        billing_month TEXT NOT NULL,
        subtotal REAL NOT NULL,
        tax_amount REAL NOT NULL,
        total_amount REAL NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        waybill_numbers TEXT NOT NULL
      );
    `);
  }

  async getDeliveryRecords(): Promise<DeliveryRecord[]> {
    if (!this.db) await this.init();

    // 1. Sync pending local items if online
    try {
      const localRows = await this.db.getAllAsync('SELECT * FROM delivery_records WHERE sync_status = "PENDING"');
      for (const row of localRows) {
        const record = this.mapRowToRecord(row);
        await fetchWithTimeout(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...record, syncStatus: 'SYNCED' })
        });
        await this.db.runAsync('UPDATE delivery_records SET sync_status = "SYNCED" WHERE client_side_uuid = ?', [record.clientSideUuid]);
      }

      // 2. Fetch latest from API
      const serverRecords = await fetchWithTimeout(API_URL);
      
      // 3. Cache in local sqlite
      for (const r of serverRecords) {
        const existing = await this.db.getFirstAsync('SELECT id FROM delivery_records WHERE client_side_uuid = ?', [r.clientSideUuid]);
        if (existing) {
          await this.db.runAsync(
            `UPDATE delivery_records SET status = ?, sync_status = ?, driver_id = ?, parcel_description = ?, pickup_location_name = ?, dropoff_destination_name = ?, updated_at = ? WHERE client_side_uuid = ?`,
            [r.status, 'SYNCED', r.driverId || null, r.parcelDescription, r.pickupLocationName, r.dropoffDestinationName, r.updatedAt, r.clientSideUuid]
          );
        } else {
          await this.db.runAsync(
            `INSERT INTO delivery_records (id, client_side_uuid, waybill_number, status, sync_status, driver_id, vehicle_type, parcel_description, parcel_quantity, pickup_location_name, pickup_address, dropoff_destination_name, dropoff_address, priority, created_at, captured_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [r.id, r.clientSideUuid, r.waybillNumber, r.status, 'SYNCED', r.driverId || null, r.vehicleType, r.parcelDescription, r.parcelQuantity, r.pickupLocationName, r.pickupAddress, r.dropoffDestinationName, r.dropoffAddress, r.priority, r.createdAt, r.capturedAt, r.updatedAt]
          );
        }
      }
    } catch (e) {
      console.log('SQLite Sync API offline, using local copy:', e);
    }


    const rows = await this.db.getAllAsync('SELECT * FROM delivery_records ORDER BY created_at DESC');
    return rows.map((row: any) => this.mapRowToRecord(row));
  }

  async saveDeliveryRecord(record: DeliveryRecord): Promise<void> {
    if (!this.db) await this.init();
    
    const existing = await this.db.getFirstAsync(
      'SELECT id FROM delivery_records WHERE client_side_uuid = ?',
      [record.clientSideUuid]
    );

    // Save locally
    if (existing) {
      await this.db.runAsync(`
        UPDATE delivery_records SET
          status = ?, sync_status = ?, sync_error = ?,
          customer_id = ?, qbo_customer_id = ?, driver_id = ?, vehicle_type = ?,
          parcel_description = ?, parcel_quantity = ?, parcel_weight_lbs = ?, parcel_weight_class = ?, parcel_dimensions = ?,
          pickup_location_name = ?, pickup_address = ?, pickup_contact_name = ?, pickup_contact_phone = ?, pickup_latitude = ?, pickup_longitude = ?,
          dropoff_destination_name = ?, dropoff_address = ?, dropoff_contact_name = ?, dropoff_contact_phone = ?, dropoff_latitude = ?, dropoff_longitude = ?,
          priority = ?, business_or_residential = ?, additional_comments = ?, requested_pickup_time = ?,
          signed_at = ?, delivered_at = ?, synced_at = ?, updated_at = ?,
          signature_name = ?, signature_image_url = ?, signature_hash = ?, signature_consent_text = ?,
          signature_ip_address = ?, signature_gps_latitude = ?, signature_gps_longitude = ?, proof_photo_url = ?
        WHERE client_side_uuid = ?
      `, [
        record.status, record.syncStatus, record.syncError || null,
        record.customerId || null, record.qboCustomerId || null, record.driverId || null, record.vehicleType,
        record.parcelDescription, record.parcelQuantity, record.parcelWeightLbs || null, record.parcelWeightClass || null, record.parcelDimensions || null,
        record.pickupLocationName, record.pickupAddress, record.pickupContactName || null, record.pickupContactPhone || null, record.pickupLatitude || null, record.pickupLongitude || null,
        record.dropoffDestinationName, record.dropoffAddress, record.dropoffContactName || null, record.dropoffContactPhone || null, record.dropoffLatitude || null, record.dropoffLongitude || null,
        record.priority, record.businessOrResidential || null, record.additionalComments || null, record.requestedPickupTime || null,
        record.signedAt || null, record.deliveredAt || null, record.syncedAt || null, new Date().toISOString(),
        record.signatureName || null, record.signatureImageUrl || null, record.signatureHash || null, record.signatureConsentText || null,
        record.signatureIpAddress || null, record.signatureGpsLatitude || null, record.signatureGpsLongitude || null, record.proofPhotoUrl || null,
        record.clientSideUuid
      ]);
    } else {
      await this.db.runAsync(`
        INSERT INTO delivery_records (
          id, client_side_uuid, waybill_number, status, sync_status, sync_error,
          customer_id, qbo_customer_id, driver_id, vehicle_type,
          parcel_description, parcel_quantity, parcel_weight_lbs, parcel_weight_class, parcel_dimensions,
          pickup_location_name, pickup_address, pickup_contact_name, pickup_contact_phone, pickup_latitude, pickup_longitude,
          dropoff_destination_name, dropoff_address, dropoff_contact_name, dropoff_contact_phone, dropoff_latitude, dropoff_longitude,
          priority, business_or_residential, additional_comments, requested_pickup_time,
          created_at, captured_at, signed_at, delivered_at, synced_at, updated_at,
          signature_name, signature_image_url, signature_hash, signature_consent_text,
          signature_ip_address, signature_gps_latitude, signature_gps_longitude, proof_photo_url
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `, [
        record.id, record.clientSideUuid, record.waybillNumber, record.status, record.syncStatus, record.syncError || null,
        record.customerId || null, record.qboCustomerId || null, record.driverId || null, record.vehicleType,
        record.parcelDescription, record.parcelQuantity, record.parcelWeightLbs || null, record.parcelWeightClass || null, record.parcelDimensions || null,
        record.pickupLocationName, record.pickupAddress, record.pickupContactName || null, record.pickupContactPhone || null, record.pickupLatitude || null, record.pickupLongitude || null,
        record.dropoffDestinationName, record.dropoffAddress, record.dropoffContactName || null, record.dropoffContactPhone || null, record.dropoffLatitude || null, record.dropoffLongitude || null,
        record.priority, record.businessOrResidential || null, record.additionalComments || null, record.requestedPickupTime || null,
        record.createdAt, record.capturedAt, record.signedAt || null, record.deliveredAt || null, record.syncedAt || null, record.updatedAt,
        record.signatureName || null, record.signatureImageUrl || null, record.signatureHash || null, record.signatureConsentText || null,
        record.signatureIpAddress || null, record.signatureGpsLatitude || null, record.signatureGpsLongitude || null, record.proofPhotoUrl || null
      ]);
    }

    // Try posting online
    try {
      await fetchWithTimeout(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...record, syncStatus: 'SYNCED' })
      });
      await this.db.runAsync('UPDATE delivery_records SET sync_status = "SYNCED" WHERE client_side_uuid = ?', [record.clientSideUuid]);
    } catch (e) {
      console.log('SQLite API Post failed, marked PENDING local');
      await this.db.runAsync('UPDATE delivery_records SET sync_status = "PENDING" WHERE client_side_uuid = ?', [record.clientSideUuid]);
    }
  }

  async updateSyncStatus(clientSideUuid: string, syncStatus: SyncStatus, syncError?: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db.runAsync(
      `UPDATE delivery_records 
       SET sync_status = ?, sync_error = ?, synced_at = ?, updated_at = ? 
       WHERE client_side_uuid = ?`,
      [
        syncStatus, 
        syncError || null, 
        syncStatus === 'SYNCED' ? new Date().toISOString() : null, 
        new Date().toISOString(), 
        clientSideUuid
      ]
    );
  }

  private mapRowToRecord(row: any): DeliveryRecord {
    return {
      id: row.id,
      clientSideUuid: row.client_side_uuid,
      waybillNumber: row.waybill_number,
      status: row.status as DeliveryStatus,
      syncStatus: row.sync_status as SyncStatus,
      syncError: row.sync_error || undefined,
      customerId: row.customer_id || undefined,
      qboCustomerId: row.qbo_customer_id || undefined,
      driverId: row.driver_id || undefined,
      vehicleType: row.vehicle_type,
      parcelDescription: row.parcel_description,
      parcelQuantity: row.parcel_quantity,
      parcelWeightLbs: row.parcel_weight_lbs || undefined,
      parcelWeightClass: row.parcel_weight_class || undefined,
      parcelDimensions: row.parcel_dimensions || undefined,
      pickupLocationName: row.pickup_location_name,
      pickupAddress: row.pickup_address,
      pickupContactName: row.pickup_contact_name || undefined,
      pickupContactPhone: row.pickup_contact_phone || undefined,
      pickupLatitude: row.pickup_latitude || undefined,
      pickupLongitude: row.pickup_longitude || undefined,
      dropoffDestinationName: row.dropoff_destination_name,
      dropoffAddress: row.dropoff_address,
      dropoffContactName: row.dropoff_contact_name || undefined,
      dropoffContactPhone: row.dropoff_contact_phone || undefined,
      dropoffLatitude: row.dropoff_latitude || undefined,
      dropoffLongitude: row.dropoff_longitude || undefined,
      priority: row.priority as 'REGULAR' | 'RUSH',
      businessOrResidential: row.business_or_residential || undefined,
      additionalComments: row.additional_comments || undefined,
      requestedPickupTime: row.requested_pickup_time || undefined,
      createdAt: row.created_at,
      capturedAt: row.captured_at,
      signedAt: row.signed_at || undefined,
      deliveredAt: row.delivered_at || undefined,
      syncedAt: row.synced_at || undefined,
      updatedAt: row.updated_at,
      signatureName: row.signature_name || undefined,
      signatureImageUrl: row.signature_image_url || undefined,
      signatureHash: row.signature_hash || undefined,
      signatureConsentText: row.signature_consent_text || undefined,
      signatureIpAddress: row.signature_ip_address || undefined,
      signatureGpsLatitude: row.signature_gps_latitude || undefined,
      signatureGpsLongitude: row.signature_gps_longitude || undefined,
      proofPhotoUrl: row.proof_photo_url || undefined
    };
  }

  async getInvoices(): Promise<InvoiceRecord[]> {
    if (!this.db) await this.init();

    try {
      const serverInvoices = await fetchWithTimeout(INVOICES_API_URL);
      await this.db.runAsync('DELETE FROM invoice_records');
      for (const inv of serverInvoices) {
        await this.db.runAsync(
          `INSERT INTO invoice_records (id, invoice_number, customer_name, billing_month, subtotal, tax_amount, total_amount, status, created_at, updated_at, waybill_numbers)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [inv.id, inv.invoiceNumber, inv.customerName, inv.billingMonth, inv.subtotal, inv.taxAmount, inv.totalAmount, inv.status, inv.createdAt, inv.updatedAt, inv.waybillNumbers.join(',')]
        );
      }
    } catch (e) {
      console.log('SQLite fetch invoices API offline, using local copy:', e);
    }

    const rows = await this.db.getAllAsync('SELECT * FROM invoice_records ORDER BY created_at DESC');
    return rows.map((row: any) => ({
      id: row.id,
      invoiceNumber: row.invoice_number,
      customerName: row.customer_name,
      billingMonth: row.billing_month,
      subtotal: row.subtotal,
      taxAmount: row.tax_amount,
      totalAmount: row.total_amount,
      status: row.status as 'DRAFT' | 'SENT' | 'PAID' | 'VOIDED',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      waybillNumbers: row.waybill_numbers ? row.waybill_numbers.split(',') : []
    }));
  }

  async saveInvoice(invoice: InvoiceRecord): Promise<void> {
    if (!this.db) await this.init();

    const existing = await this.db.getFirstAsync('SELECT id FROM invoice_records WHERE id = ?', [invoice.id]);
    if (existing) {
      await this.db.runAsync(
        `UPDATE invoice_records SET status = ?, updated_at = ? WHERE id = ?`,
        [invoice.status, new Date().toISOString(), invoice.id]
      );
    } else {
      await this.db.runAsync(
        `INSERT INTO invoice_records (id, invoice_number, customer_name, billing_month, subtotal, tax_amount, total_amount, status, created_at, updated_at, waybill_numbers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoice.id, invoice.invoiceNumber, invoice.customerName, invoice.billingMonth, invoice.subtotal, invoice.taxAmount, invoice.totalAmount, invoice.status, invoice.createdAt, invoice.updatedAt, invoice.waybillNumbers.join(',')]
      );
    }

    try {
      await fetchWithTimeout(INVOICES_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice)
      });
    } catch (e) {
      console.log('SQLite Save invoice API offline, saved locally');
    }
  }

  async deleteInvoice(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db.runAsync('DELETE FROM invoice_records WHERE id = ?', [id]);

    try {
      await fetchWithTimeout(`${INVOICES_API_URL}/${id}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.log('SQLite Delete invoice API offline, deleted locally');
    }
  }
}

export const db = Platform.OS === 'web' ? new WebStorageDatabase() : new SQLiteNativeDatabase();
