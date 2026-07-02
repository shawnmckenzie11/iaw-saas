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
- **Auth UI**: Username/passcode login (`driver1/1111`, `driver2/2222`, `dispatch/0000`) backed by JWT API calls.

---

## 2. Development Status of Components

| Component | Directory / Endpoint | Status | Notes |
|---|---|---|---|
| Backend Boilerplate | `backend/src/` | **COMPLETE** | Express, TypeScript, Prisma. |
| Database Migrations | `backend/prisma/` | **COMPLETE** | All tables migrated; `sequenceNumber` on `waybill_events`. |
| Health Check API | `GET /health` | **COMPLETE** | DB connectivity verified. |
| Dual Auth | `POST /api/auth/driver/login`, `POST /api/auth/dispatcher/login` | **COMPLETE** | PIN (SHA-256) + bcrypt; JWT 12h. |
| RBAC Middleware | `backend/src/middleware/auth.ts` | **COMPLETE** | JWT role claims; driver/dispatcher gates. |
| Waybill API | `GET/POST /api/waybills`, events sub-routes | **COMPLETE** | Event sourcing with replay projection. |
| Sync API | `POST /api/sync/events`, `POST /api/sync/blobs` | **COMPLETE** | Batch events + multipart blob upload. |
| Admin API | `GET /api/admin/rates` | **COMPLETE** | Dispatcher-only route rates. |
| Frontend PWA | `frontend/` | **COMPLETE** | Login, dashboard, pickup, sign-off, sync counters. |
| IndexedDB Queues | `frontend/src/db/indexedDb.ts` | **COMPLETE** | Dual queues for events and blobs. |
| Driver Portal UI | `frontend/src/pages/` | **COMPLETE** | Pickup, sign-off, offline toggle, pending sync badge. |
| Dispatcher Portal UI | `frontend/src/pages/DashboardPage.tsx` | **COMPLETE** | Dispatch header, accounting button, global waybill view. |
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
| Dispatcher | `dispatch` / `0000` | `dispatcher@example.com` / `password123` |

### Seed Waybills
- **W-001**: Assigned to `drv-01`, status `PICKED_UP`
- **W-002**: Unassigned, status `DRAFT`
- **W-003**: Assigned to `drv-02`, status `DRAFT`

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
Playwright auto-starts backend (`:3002`) and frontend preview (`:3000`) via `webServer` config.

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
npm test    # backend + e2e
```

---

## 5. Remaining Milestones (Post v1.0.0)

1. **M8: Tier 2–4 E2E Scenarios** — Integration, cross-feature matrix, and full driver shift scenarios per `TEST_INFRA.md`.
2. **M9: Adversarial Hardening (Tier 5)** — Bruteforce PIN lockout, token revocation, concurrency conflict handling, large media optimization.
3. **QuickBooks Online Integration** — OAuth2, invoice/journal entry sync.
4. **Production Deployment** — Fly.io PostgreSQL, environment secrets, CI pipeline.

---

## 6. Verification Status (2026-07-02)

| Test Category | Status | Command |
|---|---|---|
| Backend compile | **PASS** | `npm run build --prefix backend` |
| Frontend compile | **PASS** | `npm run build --prefix frontend` |
| Backend integration tests | **PASS** (2/2) | `npm run test:backend` |
| E2E Tier 1 tests | **PASS** (34/34) | `npm run test:e2e` |
| Database seed | **PASS** | `npx ts-node backend/src/seed.ts` |
