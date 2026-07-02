# IAW Courier: Admin & Dispatcher Operations Guide

This guide explains how dispatchers and system administrators manage the backend operations, synchronization conflicts, and route rate adjustments.

---

## 🗺️ 1. Managing Route Rates (Tier 1 Pricing)

Flat-rate billing for common corporate routes (Jannatec, Redpath, Wajax, Sandvik, etc.) is managed via the `route_rates` table. This allows rates to be adjusted dynamically without code deployments.

### How Tier 1 Rates Work
* When a driver logs a pickup, the system checks the `route_rates` table for a record matching the pickup `origin` and dropoff `destination`.
* If a match is found, the system applies the rate with the most recent `effective_date`.
* To adjust a flat rate, you insert a new record into the `route_rates` table:
  ```sql
  INSERT INTO route_rates (origin, destination, flat_rate, effective_date)
  VALUES ('KOMATSU', 'WAJAX', 55.00, '2026-07-01 00:00:00-04');
  ```
* All deliveries scheduled after that `effective_date` will automatically receive the new rate of $55.00, while historical deliveries retain their original rates for auditing.

---

## 💰 2. Manual Adjustments & Custom Tiers

Some deliveries do not match pre-configured Tier 1 flat routes. These are handled as follows:

* **TIER 2 (Standard In-Town - Non-Flat)**: Placed at a default rate of $60.00. Dispatchers can inspect these in the dashboard and adjust the `pricing_total_cost` base rate as needed.
* **TIER 3 (Out-of-Town)**: Calculated manually. The driver captures the route details, and the dispatcher inputs the custom cost parameters into the billing records.
* **Tracking Overrides**: If you manually adjust a delivery's cost, ensure the system flags `pricing_is_manually_adjusted = TRUE` and documents the change in `pricing_override_reason` (e.g. "Heavy weather delay surcharge").

---

## ⚡ 3. Handling Synchronization Conflicts

If a driver's mobile device attempts to sync a delivery that collisions with database records (e.g., duplicate waybill number or server key mismatch):

1. The record's `sync_status` shifts to `CONFLICT` and a red conflict warning badge surfaces on the app's dashboard logs.
2. **Reviewing the Collision**:
   * Inspect the conflict description under the driver's log list.
   * Coordinate with the driver to verify if the details were entered twice or if they are matching an existing logged waybill.
3. **Resolving the Conflict**:
   * If the record was a duplicate click, the dispatcher can safely archive/void the record.
   * If the record contains unique delivery data but has a wrong waybill number, adjust the waybill number in the dispatcher UI or ask the driver to hit **RETRY FORCE** to trigger a re-transmission.

---

## 💼 4. QuickBooks Online Integration Audit

Deliveries marked `DELIVERED` are matched to client files and prepared for sync to QuickBooks.

* **Audit Mappings**:
  * Every customer record must have a valid `qbo_customer_id` matching your QuickBooks Online client list.
  * Invoices synced successfully will lock the transaction record with `qbo_sync_status = SYNCED` and save the QuickBooks Invoice reference key in `qbo_invoice_id`.
* **QBO Sync Failures**:
  * Mismatches or OAuth connection dropouts will result in `qbo_sync_status = FAILED` and write the API error details into `qbo_sync_error`.
  * Resolve customer name typos or mapping IDs in the database, then select "Re-Sync Invoice" on the Admin Dashboard to retry the sync.
