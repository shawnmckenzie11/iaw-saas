# Project Handoff: iaw-saas

This document describes the architectural state, development status, verification results, and remaining milestones for the **iaw-saas** project (target: **iaw-saas-1.0.0**).

---

## 1. Architectural Blueprint

### A. Backend Architecture & Database Setup
- **Framework**: Node.js, Express, TypeScript (strict compilation mode).
- **ORM**: Prisma ORM with PostgreSQL database provider.
- **Port**: `3002` (configurable via `PORT` in `backend/.env`).
- **Database Schema**: `customers`, `drivers`, `dispatchers`, `route_rates`, `delivery_records`, `waybill_events` (append-only event log with `sequenceNumber`).

### B. Frontend PWA (`frontend/`)
- **Framework**: React 18 + Vite 5 + vanilla CSS.
- **Port**: `3000` with `/api` and `/uploads` proxied to backend `3002`.
- **Offline Storage**: IndexedDB database `iaw_db` via Dexie.js with stores `waybill_events`, `media_blobs`, and `meta`.
- **PWA**: Service worker via `vite-plugin-pwa` for offline app-shell caching.
- **Auth UI**: Dual-login tabs — Driver (username + 4-digit PIN) and Dispatcher (email + password).

---

## 2. Development Status of Components

| Component | Directory / Endpoint | Status | Notes |
|---|---|---|---|
| Backend Boilerplate | `backend/src/` | **COMPLETE** | Express, TypeScript, Prisma. |
| Database Migrations | `backend/prisma/` | **COMPLETE** | All tables migrated; `sequenceNumber` on `waybill_events`. |
| Health Check API | `GET /health` | **COMPLETE** | DB connectivity verified. |
| Dual Auth | `POST /api/auth/driver/login`, `POST /api/auth/dispatcher/login` | **COMPLETE** | PIN (SHA-256) + bcrypt; JWT 12h. |
| RBAC Middleware | `backend/src/middleware/auth.ts` | **COMPLETE** | JWT role claims; driver/dispatcher gates. |
| Waybill API | `GET/POST /api/waybills`, `GET /api/waybills` list, events sub-routes | **COMPLETE** | Event sourcing with replay projection; list endpoint for dashboard. |
| Sync API | `POST /api/sync/events`, `POST /api/sync/blobs` | **COMPLETE** | Batch events + multipart blob upload. |
| Admin API | `GET /api/admin/rates`, `POST /api/admin/intake/sync`, `GET/POST/PUT/DELETE /api/admin/employees` | **COMPLETE** | Dispatcher-only route rates, intake sync, payroll CRUD. |
| Frontend PWA | `frontend/` | **COMPLETE** | Multi-step pickup, sign-off, dispatch dashboard, accounting (invoices + payroll), conflict sync. |
| IndexedDB Queues | `frontend/src/db/indexedDb.ts` | **COMPLETE** | Dual queues with PENDING/SYNCED/CONFLICT event states. |
| Driver Portal UI | `frontend/src/pages/PickupPage.tsx`, `SignOffPage.tsx` | **COMPLETE** | 3-step pickup wizard (More/Other chips, conditional dropoffs); pending-dropoff gating before delivery; sign-off on SignOffPage. |
| Dispatcher Portal UI | `frontend/src/pages/DashboardPage.tsx`, `AccountingPage.tsx` | **COMPLETE** | Tabs, driver assign chips, completed tab with capture icons + detail modal (print/email), payroll CRUD tab. |
| E2E Test Suite | `tests/e2e/` | **COMPLETE** | 34 Tier 1 tests passing (30 spec + sanity). |

---

## 3. Installation & Run Instructions

### Prerequisites
- Node.js v18+
- PostgreSQL v16

### Database Initialization
```bash
cp backend/.env.example backend/.env
# Set SEED_DISPATCHER_PASSWORD and SEED_DRIVER_PINS in backend/.env

psql -d postgres -c "CREATE ROLE postgres WITH LOGIN PASSWORD 'postgres' SUPERUSER;"
psql -d postgres -c "CREATE DATABASE iaw_courier OWNER postgres;"
```

### Full Stack Development
```bash
# From project root
npm install
cd backend && npx prisma db push && npx ts-node src/seed.ts && cd ..
npm run dev          # Starts backend :3002 + frontend :3000
```

Seed credentials and E2E vars live in `backend/.env` (gitignored) — see `backend/.env.example` and `.env.test.example`. No login credentials are committed to the repo.

### Seed Waybills
- **W-001**: Assigned to `drv-01`, status `PICKED_UP`
- **W-002**: Unassigned, status `DRAFT`
- **W-003**: Assigned to `drv-02`, status `DRAFT`
- **W-004**: Assigned to `drv-03`, status `DRAFT`
- **W-005**: Assigned to `drv-04`, status `PICKED_UP`
- **HIST-001..100**: Last 100 rows from archive CSV (~70% DELIVERED, ~20% PICKED_UP, ~10% DRAFT)
- **topPickups.json**: Regenerated at seed time — top 6 pickup locations from last 365 days of CSV

---

## 4. Automated Test Suite

### Backend (Jest + Supertest)
```bash
npm run test
```
| Test | Status |
|---|---|
| Health check (`GET /health`) | **PASS** |
| Database downtime graceful degradation | **PASS** |
| Dual Auth & RBAC Boundaries Integration (`src/routes/auth.test.ts`) | **PASS** |

### End-to-End (Playwright — Tier 1)
```bash
npm run test:e2e
```

| Feature | Spec File | Cases | Status |
|---|---|---|---|
| F1 Driver PIN Auth | `tier1-auth.spec.ts` | 6 | **PASS** |
| F2 Dispatcher Auth | `tier1-auth.spec.ts` | 6 | **PASS** |
| F3 RBAC Gatekeeping | `tier1-rbac.spec.ts` | 6 | **PASS** |
| F4 Offline IndexedDB | `tier1-sync.spec.ts` | 5 | **PASS** |
| F5 Event Sourcing | `tier1-eventsourcing.spec.ts` | 5 | **PASS** |
| F6 Dual Sync Endpoints | `tier1-sync.spec.ts` | 5 | **PASS** |
| Sanity | `sanity.spec.ts` | 1 | **PASS** |
| **Total** | | **34** | **PASS** |

### Full Suite
```bash
npm test
```
Runs backend Jest (`test:backend`) then Playwright Tier 1 (`test:e2e`).

---

## 5. PWA Business UI (2026-07-02)

The legacy Expo `mobile/` prototype was removed; the React PWA is the sole client.

### Driver pickup / delivery
- **Pickup wizard** (`PickupPage.tsx` + `LocationQuickSelect.tsx`): 3-step flow (Pickup → Dropoff → Sign stepper label); CSV-derived top-6 quick-select chips with **More...** / **Other** progressive disclosure; `selectedPickupKey` conditional dropoffs; auto-fill from `suggestions.json`; saves at step 2.
- **Pending dropoff gating** (`pendingDropoff.ts`, `DashboardPage.tsx`, `SignOffPage.tsx`): PICKED_UP waybills with placeholder dropoff (`Pending Dropoff` / `Pending Address`) open pickup wizard step 2 before sign-off or quick delivery confirm.
- **Pricing** (`pricing.ts`): Category-based rules in code + DB route rates; mirrored in backend + CSV location mapper.
- **CSV seed pipeline** (`backend/src/utils/archiveCsvImporter.ts`, `csvLocationMapper.ts`): Adapted from `server.js` + `analyze_csv.py`; seeds HIST-* records and writes `frontend/src/data/topPickups.json`.
- **Waybill list API** (`GET /api/waybills`): RBAC-filtered list; dashboard loads seeded HIST-* + W-001..003.
- **Sign-off** (`SignOffPage.tsx`): Signature canvas, printed name, POD photo upload to blob queue.
- **Dispatch dashboard** (`DashboardPage.tsx`): Active/Pending Price/Completed tabs, interactive driver assignment via `WAYBILL_ASSIGNED` events, pending price modal (`DISPATCHER_OVERRIDE` + `pricingTotalCost`), completed search/date filters, rush badges, price column, conflict badges + retry UI.
- **Accounting** (`AccountingPage.tsx`): Monthly invoice generator + archive list; **Print/View PDF** via browser print; **Payroll** tab with employee CRUD via `/api/admin/employees`.
- **Completed waybill actions** (`CompletedWaybillModal.tsx`, `waybillPrint.ts`, `waybillEmail.ts`): Capture icons (✍️/📷) on Completed tab; row click opens detail modal with Print + mailto email via `VITE_BUSINESS_EMAIL`.
- **Driver pending pickup**: Dashboard **Pick Up** / row click opens `PickupPage` with `editWaybill` hydration; save emits `WAYBILL_PICKED_UP` (not duplicate `WAYBILL_CREATED`).
- **Driver action column fix**: Driver list scoped to assigned jobs only (`driverId === session.driverId`); Pick Up button shown for assigned DRAFT/PICKED_UP rows.
- **Pickup UX**: Delivery "Other" clears to empty with dispatch note placeholder; weight "Enter weight" validates integer &gt; 75 lbs.
- **SyncManager**: Real S/C counters from IndexedDB; conflict simulation when cargo description contains `"conflict"` or `"fail"`; `resolveConflictForce()` retry.
- **Backend projector**: Driver unassign (`driverId: null`), manual price on `DISPATCHER_OVERRIDE`, `calculatedPrice` in API serialize.

### Dispatch / driver UX (2026-07-02)
- **Login**: Removed credential hints and test placeholders from `LoginPage.tsx` (auth unchanged).
- **Dispatch driver preview**: Read-only "Driver View" toggle in action row; pick a driver to see their filtered queue; "Back to Dispatch" exits preview.
- **Delete active delivery**: Active Jobs tab — dispatcher can void DRAFT/PICKED_UP via `WAYBILL_VOIDED` event + confirmation modal; RBAC dispatcher-only; voided rows excluded from list API.
- **Accounting button**: Moved to top action row beside NEW PICKUP and Driver View controls.
- **Driver completed history**: DELIVERED rows collapsed by default; expandable horizontal section bars for **Today's** / **This week's** / **This month's** completed (each bucket toggles independently).
- **Dashboard table columns**: Route split into compact Pickup + Dropoff columns; Cargo abbreviated; price in narrow `$` column; dispatch delete icon in dedicated far-right column.
- **Pickup "Other" fields**: Delivery details and weight range use inline editable "Other" inputs in the picker row (no separate popup field).
- **Payroll seed**: `seed.ts` upserts `Employee` rows dynamically from all active `Driver` records (names stay in sync with driver roster).

### Dispatch / driver UX fixes (2026-07-02)
- **Pending Price tab**: Today's + Unassigned collapsible section bars (mirrors driver completed history); auto-rated or stored prices move to Completed tab via `effectiveWaybillPrice`.
- **Driver pickup assignment**: `driverId` persisted on `WAYBILL_PICKED_UP` projection + driver event API fallback; queued waybill merge preserves creator assignment after sync.
- **Driver action column**: Sticky right action column + larger touch targets on mobile driver tables.

### Driver roster sync + waybill modals (2026-07-02)
- **Live driver roster**: `GET /api/admin/drivers` merges active `Driver` rows with linked `Employee` names; dispatch dashboard fetches on load and after payroll CRUD (`notifyDriverRosterChanged` event).
- **Payroll → driver sync**: Employee create/update syncs `firstName`/`lastName` to linked `Driver` record.
- **Waybill detail modal**: Pending Price + Completed row clicks open `WaybillDetailModal` with Edit (`DISPATCHER_CORRECTION`), Delete (`WAYBILL_VOIDED` including DELIVERED), print/email (completed).
- **Docs**: Rewrote `docs/driver_instructions.md` and `docs/dispatcher_instructions.md` for current PWA UI; added `docs/walkthrough.md` + `tests/e2e/walkthrough.spec.ts` for Playwright video recording.

### Still deferred (post v1.0.0)
- QuickBooks Online OAuth + invoice/journal sync
- Server-side partial sync conflict indices (F6-T2-01)
- Tier 2–5 E2E scenarios per `TEST_INFRA.md`

### Google Sheets live intake (2026-07-02)
- **Pluggable intake layer** (`backend/src/intake/`): `IntakeAdapter`, `parseRequestRow`, `intakeService`, `registerAdapters`, `IntakeSyncState` cursor.
- **Temporary adapter** (`backend/src/integrations/googleSheets/`): 60s poll when `INTAKE_GOOGLE_SHEETS_ENABLED=true`; new rows → unassigned `DRAFT` waybills (`REQ-{row}`).
- **Schema**: `external_source` / `external_row_id` on `delivery_records`; migration `20260702120000_intake_external_ids`.
- **Frontend**: Dispatch dashboard polls waybills every ~12s (drivers + dispatchers).
- **Docs**: Google Cloud setup, Fly secrets, kill switch, unplug checklist in `DEPLOY.md`.
- **Deploy**: Set Fly secrets + `fly deploy`; first run skips existing sheet rows via cursor init.

---

## 6. Verification Status (2026-07-02 — driver roster + waybill modals)

| Test Category | Status | Command |
|---|---|---|
| Backend compile | **PASS** | `npm run build --prefix backend` |
| Frontend compile | **PASS** | `npm run build --prefix frontend` |
| Backend integration tests (new) | **PASS** | `driverRoutes.test.ts`, `waybillCorrection.test.ts`, payroll name sync |
| Backend integration tests (full) | **PARTIAL** | `auth.test.ts` dispatcher login 401 — env/seed credential mismatch in local DB |
| E2E Tier 1 tests | **PARTIAL** | 15/34 pass; dispatcher credential + UI selector failures (pre-existing env) |
| New feature tests | **PASS** | Driver roster API, DISPATCHER_CORRECTION fields, void DELIVERED |

**Shipped:** pending-dropoff delivery gating; Bus (ON)/Airport pricing; removed legacy `mobile/` Expo prototype.

---

## 7. Remaining Milestones (Post v1.0.0)

1. **M8: Tier 2–4 E2E Scenarios** — Integration, cross-feature matrix, and full driver shift scenarios per `TEST_INFRA.md`.
2. **M9: Adversarial Hardening (Tier 5)** — Bruteforce PIN lockout, token revocation, concurrency conflict handling, large media optimization.
3. **QuickBooks Online Integration** — OAuth2, invoice/journal entry sync.
4. **Production Deployment** — Fly.io PostgreSQL, environment secrets, CI pipeline.

---

## 8. Sensitive Data Redaction (2026-07-02)

Operational credentials, real business archive CSV, pricing tables in docs, and hardcoded auth shortcuts were removed from the public repo. Seed/E2E credentials are env-only (`SEED_*` in `backend/.env`, `.env.test.example`). Synthetic fixtures: `docs/archive.example.csv`, `frontend/src/data/suggestions.json`. Real archive CSV is gitignored. Full exposure assessment: `docs/SAFETY_AUDIT.md`.
