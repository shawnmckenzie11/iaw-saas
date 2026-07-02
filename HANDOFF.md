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
- **Auth UI**: Dual-login tabs — Driver (username + 4-digit PIN) and Dispatcher (email + password); legacy `dispatch`/`0000` shortcut preserved on driver tab.

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
| Admin API | `GET /api/admin/rates` | **COMPLETE** | Dispatcher-only route rates. |
| Frontend PWA | `frontend/` | **COMPLETE** | Multi-step pickup, sign-off, dispatch dashboard, accounting, conflict sync. |
| IndexedDB Queues | `frontend/src/db/indexedDb.ts` | **COMPLETE** | Dual queues with PENDING/SYNCED/CONFLICT event states. |
| Driver Portal UI | `frontend/src/pages/PickupPage.tsx`, `SignOffPage.tsx` | **COMPLETE** | 3-step pickup wizard ported from `mobile/` (More/Other chips, conditional dropoffs); sign-off on SignOffPage. |
| Dispatcher Portal UI | `frontend/src/pages/DashboardPage.tsx`, `AccountingPage.tsx` | **COMPLETE** | Tabs, driver assign chips (always visible + reassign for driver-created jobs), price modal, completed filters. |
| E2E Test Suite | `tests/e2e/` | **COMPLETE** | 34 Tier 1 tests passing (30 spec + sanity). |

---

## 3. Installation & Run Instructions

### Prerequisites
- Node.js v18+
- PostgreSQL v16

### Database Initialization
```bash
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

### Test Credentials (seed data)
| Role | Login | API Credentials |
|---|---|---|
| Driver 1 | `driver1` / `1111` | PIN `1111` → `drv-01` |
| Driver 2 | `driver2` / `2222` | PIN `2222` → `drv-02` |
| Driver 3 | `driver3` / `3333` | PIN `3333` → `drv-03` |
| Driver 4 | `driver4` / `4444` | PIN `4444` → `drv-04` |
| Dispatcher | **Driver tab:** `dispatch` / `0000` — **or Dispatcher tab:** `dispatcher@example.com` / `password123` |

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
npm run test:backend
```
| Test | Status |
|---|---|
| Health check (`GET /health`) | **PASS** |
| Database downtime graceful degradation | **PASS** |

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

## 5. Mobile Prototype Port (2026-07-02)

**Strategy:** Diff/port from `main` branch `mobile/` screens — not greenfield. Authoritative UX lives in `mobile/src/screens/PickupScreen.tsx` (~1887 lines).

### Ported from `mobile/` → `frontend/`
- **Pickup wizard** (`PickupPage.tsx` + `LocationQuickSelect.tsx`): 3-step flow (Pickup → Dropoff → Sign stepper label); CSV-derived top-6 quick-select chips with **More...** / **Other** progressive disclosure; `selectedPickupKey` conditional dropoffs; auto-fill from `suggestions.json`; saves at step 2 (mobile parity).
- **CSV seed pipeline** (`backend/src/utils/archiveCsvImporter.ts`, `csvLocationMapper.ts`): Adapted from `server.js` + `analyze_csv.py`; seeds HIST-* records and writes `frontend/src/data/topPickups.json`.
- **Waybill list API** (`GET /api/waybills`): RBAC-filtered list; dashboard loads seeded HIST-* + W-001..003.
- **Sign-off** (`SignOffPage.tsx`): Signature canvas, printed name, POD photo upload to blob queue.
- **Dispatch dashboard** (`DashboardPage.tsx`): Active/Pending Price/Completed tabs, interactive driver assignment via `WAYBILL_ASSIGNED` events, pending price modal (`DISPATCHER_OVERRIDE` + `pricingTotalCost`), completed search/date filters, rush badges, price column, conflict badges + retry UI.
- **Accounting** (`AccountingPage.tsx`): Monthly invoice generator + archive list; **Print/View PDF** via browser print (2-page template: statement + itemized waybills, ported from mobile).
- **Driver pending pickup**: Dashboard **Pick Up** / row click opens `PickupPage` with `editWaybill` hydration; save emits `WAYBILL_PICKED_UP` (not duplicate `WAYBILL_CREATED`).
- **Driver action column fix**: Driver list scoped to assigned jobs only (`driverId === session.driverId`); Pick Up button shown for assigned DRAFT/PICKED_UP rows.
- **Pickup UX**: Delivery "Other" clears to empty with dispatch note placeholder; weight "Enter weight" validates integer &gt; 75 lbs.
- **SyncManager**: Real S/C counters from IndexedDB; conflict simulation when cargo description contains `"conflict"` or `"fail"`; `resolveConflictForce()` retry.
- **Backend projector**: Driver unassign (`driverId: null`), manual price on `DISPATCHER_OVERRIDE`, `calculatedPrice` in API serialize.

### Still deferred (post v1.0.0)
- QuickBooks Online OAuth + invoice/journal sync
- Full driver roster impersonation toggle (dispatch ↔ driver view switch)
- Server-side partial sync conflict indices (F6-T2-01)
- Tier 2–5 E2E scenarios per `TEST_INFRA.md`

---

## 6. Verification Status (2026-07-02 — MVP fixes)

| Test Category | Status | Command |
|---|---|---|
| Backend compile | **PASS** | `npm run build --prefix backend` |
| Frontend compile | **PASS** | `npm run build --prefix frontend` |
| Backend integration tests | **PASS** (2/2) | `npm run test:backend` |
| E2E Tier 1 tests | **PASS** (34/34) | `npm run test:e2e` |
| Full suite | **PASS** (36/36) | `npm test` |
| Database seed | **PASS** | `npx ts-node backend/src/seed.ts` |

**MVP fixes shipped:** invoice PDF print, pending-pickup hydration, driver action button, pickup UX, dual-login tabs/docs, drivers 3–4 in seed + auth.

---

## 7. Remaining Milestones (Post v1.0.0)

1. **M8: Tier 2–4 E2E Scenarios** — Integration, cross-feature matrix, and full driver shift scenarios per `TEST_INFRA.md`.
2. **M9: Adversarial Hardening (Tier 5)** — Bruteforce PIN lockout, token revocation, concurrency conflict handling, large media optimization.
3. **QuickBooks Online Integration** — OAuth2, invoice/journal entry sync.
4. **Production Deployment** — Fly.io PostgreSQL, environment secrets, CI pipeline.
