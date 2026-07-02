# IAW Courier PWA — Dispatcher Instructions

This guide covers dispatcher operations in the **React PWA**: dispatch dashboard, driver preview, pricing, accounting/payroll, and sync conflict handling.

---

## 1. Sign In

1. Open the app and select the **Dispatcher** tab on the login screen.
2. Enter your **email** and **password**.
3. Tap **Sign In** to open the **Dispatch** dashboard.

---

## 2. Dispatch Dashboard Tabs

| Tab | Contents |
|-----|----------|
| **Active Jobs** | DRAFT and PICKED_UP waybills — assign drivers, void/delete |
| **Pending Price (n)** | DELIVERED jobs missing a price quote |
| **Completed (n)** | DELIVERED jobs with a stored or auto-rated price |

The dashboard polls for updates every ~12 seconds while online.

### Header controls

- **➕ NEW PICKUP (WAYBILL)** — create a dispatch-initiated pickup.
- **👤 Driver View** — read-only preview of a selected driver's queue.
- **📊 ACCOUNTING & INVOICES** — monthly invoices and payroll employees.
- **Sync counters** — same S/C/Pending Sync badges as the driver portal.

---

## 3. Assigning Drivers

On **Active Jobs**, each row has **driver assignment chips** (first initial of each active driver). Names come from the live **Payroll** roster — not hardcoded labels.

1. Tap a driver chip to open the assignment modal.
2. Choose **Regular** or **Rush** priority and queue position (top, after a job, or bottom).
3. Tap **Confirm Assignment**.
4. Tap **X** beside the chips to unassign.

Driver names update automatically after payroll edits (Accounting → Payroll tab).

---

## 4. Pending Price Workflow

Deliveries that could not be auto-rated appear under **Pending Price**, grouped into **Today's** and **Unassigned** sections.

1. Click a row to open the detail modal.
2. Enter a **quote price** and tap **Confirm Price**, or tap **Edit** to fix pickup/dropoff/cargo first.
3. Priced jobs move to the **Completed** tab.

---

## 5. Completed Deliveries

The **Completed** tab supports search and date filters. Click a row to open the detail modal:

- **Print** / **Email** — generate a receipt (email uses configured business address).
- **Edit** — correct pickup, dropoff, cargo, or price via dispatcher correction events.
- **Delete** — void the waybill (removed from all dispatch lists).

Capture icons (✍️ / 📷) indicate signature and proof photo availability.

---

## 6. Void / Delete Active Jobs

On **Active Jobs**, use the **🗑** icon in the far-right column for DRAFT or PICKED_UP rows. Confirm in the dialog — this emits a `WAYBILL_VOIDED` event.

---

## 7. Accounting & Payroll

Open **📊 ACCOUNTING & INVOICES**:

### Invoices tab

- Pick a billing month, select customers, generate monthly statements.
- Print/view PDF via browser print.
- Update invoice status (Draft → Sent → Paid / Void).

### Payroll tab

- **Add / Edit / Delete** employees via `/api/admin/employees`.
- Link employees to driver ids (`drv-01`, etc.) for roster sync.
- Name changes propagate to dispatch assignment chips and **Driver View** automatically.

---

## 8. Sync Conflicts

When a red **CONFLICT** badge appears:

1. Read the banner message on the dashboard.
2. Verify with the driver whether the entry is a duplicate.
3. Tap **Retry** to force resubmit, or void the duplicate from dispatch.

---

## 9. Driver Preview

1. Tap **👤 Driver View** and pick a driver.
2. Review their filtered queue (read-only).
3. Tap **← Back to Dispatch** to return.

Use this to verify assignments and queue order without signing in as the driver.

---

## 10. Edge Cases

- **INVOICED** waybills are locked — corrections and voids return HTTP 422.
- **Google Sheets intake** rows show a **LIVE FORM** badge; they arrive as unassigned DRAFT jobs.
- Drivers cannot see prices, void jobs, or submit dispatcher-only events (RBAC enforced server-side).
