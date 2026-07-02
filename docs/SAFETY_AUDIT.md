# IAW SaaS — Data Safety & Exposure Audit

**Audit date:** 2026-07-02  
**Scope:** Business PII, delivery/financial data, payroll records, credentials, and public-repo exposure  
**Application:** `iaw-saas` (React PWA + Express/Prisma on Fly.io Postgres)  
**Production URL:** `https://iaw.mckenzian.com`

---

## Executive summary

| Question | Answer |
|----------|--------|
| Is payroll data protected from unauthorized online access? | **Mostly yes** — API requires dispatcher JWT; drivers receive 403 on `/api/admin/employees`. |
| Is all business/financial data fully safe from online exposure? | **No** — several gaps remain (see §Critical gaps). |
| Are credentials safe in the public git repo? | **Improved** — seed credentials are env-only; historical archive CSV may still exist in git history. |
| Is production database access restricted? | **Yes** — Postgres on Fly, `DATABASE_URL` via secrets, not in git. |

**Overall rating: PARTIAL** — appropriate for a controlled MVP deployment with known hardening backlog. Do not treat as fully compliant for regulated financial/HR data until P1–P4 items below are addressed.

---

## What is protected today

### Production infrastructure

| Control | Status | Notes |
|---------|--------|-------|
| Database | **SECURE** | Fly Postgres; `DATABASE_URL` injected as Fly secret |
| JWT signing | **SECURE** (when configured) | `JWT_SECRET` set via `fly secrets`; 12h token expiry |
| HTTPS | **SECURE** | Fly-managed TLS on `iaw.mckenzian.com` |
| Secrets in git | **SECURE** | `backend/.env`, `.env.test`, `frontend/.env*` gitignored |
| Seed credentials in source | **SECURE** | `SEED_*` env vars via `backend/src/seedConfig.ts` |

### API access control

| Route | Auth | Role | Rating |
|-------|------|------|--------|
| `GET/POST /api/waybills/*` | JWT | Driver RBAC + dispatcher global | **SECURE** |
| `GET/POST/PUT/DELETE /api/admin/employees/*` | JWT | Dispatcher only | **SECURE** |
| `GET /api/admin/rates`, `POST /api/admin/intake/sync` | JWT | Dispatcher only | **SECURE** |
| `POST /api/auth/*/login` | Public | Expected | **SECURE** (with caveats — no dispatcher lockout) |
| `POST /api/sync/events`, `POST /api/sync/blobs` | JWT only | **No waybill RBAC** | **GAP** |

Payroll API enforcement: `backend/src/routes/payrollRoutes.ts` applies `requireAuth` + `requireRole('DISPATCHER')` on all routes. Integration tests confirm driver → 403.

### Repository hygiene (2026-07-02 redaction)

| Item | Status |
|------|--------|
| Test account tables in README/HANDOFF/DEPLOY | Removed |
| Hardcoded dispatch shortcut (`dispatch`/`0000`) | Removed |
| Real archive CSV in working tree | Removed + gitignored |
| Synthetic fixtures | `docs/archive.example.csv`, minimal `suggestions.json` |
| Business email in code | Env-driven via `VITE_BUSINESS_EMAIL` |
| Operational pricing in docs | Removed from user-facing docs |

---

## Data classification & storage

| Data type | Where stored | Online exposure risk |
|-----------|--------------|----------------------|
| Customer names, addresses, signatures | Fly Postgres + `/uploads` volume | Medium — DB protected; uploads are public static files |
| Delivery pricing / invoices | Postgres + client sessionStorage | Medium — drivers can receive pricing in API JSON |
| Payroll (Employee: name, email, payRate) | Postgres | Low via API — dispatcher-only |
| Driver PINs | Postgres (`pinHash`) | Low — hashed; 4-digit entropy is weak |
| Dispatcher passwords | Postgres (`bcrypt`) | Low |
| JWT sessions | Client localStorage/cookie + IndexedDB | Medium — device/XSS risk |
| Offline event queue | IndexedDB (`iaw_db`) | Medium — device-loss risk; expected for PWA |

---

## Critical gaps (must fix for “fully safe” claim)

### P1 — Sync routes bypass waybill RBAC

**Risk:** Any authenticated driver could submit sync events for another driver’s waybill.  
**Files:** `backend/src/routes/syncRoutes.ts`, `backend/src/services/waybillService.ts`  
**Fix:** Pass `req.auth` into sync handlers; enforce `checkWaybillAccess` / `canDriverMutateWaybill` per event.

### P2 — Public `/uploads` static files

**Risk:** Signature and proof-of-delivery photos served without authentication.  
**File:** `backend/src/app.ts` — `app.use('/uploads', express.static(...))`  
**Fix:** Authenticated proxy or signed short-lived URLs.

### P3 — Financial fields in driver API responses

**Risk:** UI hides pricing from drivers, but `calculatedPrice` / `pricingTotalCost` are still in waybill JSON and sessionStorage.  
**Files:** `backend/src/services/eventProjector.ts`, `frontend/src/pages/DashboardPage.tsx`  
**Fix:** Role-aware serialization — omit pricing fields for `DRIVER` role.

### P4 — Historical PII in git history

**Risk:** `docs/BACKUP of Requests - Archive.csv` was previously committed; real customer/route data may be recoverable via `git log` / clone history even after deletion.  
**Fix:** Treat as sensitive if repo was ever public; run `git filter-repo` or BFG purge, or rotate assumption that archive data was exposed.

### P5 — Production auth hardening

| Issue | File | Recommendation |
|-------|------|----------------|
| JWT dev fallback | `middleware/auth.ts` | Fail startup if `JWT_SECRET` unset in production |
| Non-HttpOnly session cookie | `frontend/src/services/auth.ts` | HttpOnly + Secure cookies |
| In-memory token revocation | `middleware/auth.ts` | Shared store for multi-instance Fly |
| Open CORS | `app.ts` | Restrict to `PUBLIC_APP_URL` in production |
| 4-digit PIN entropy | `pinHash.ts` | Rate limiting + optional bcrypt/pepper |

---

## Frontend role separation

| Surface | Driver | Dispatcher | Rating |
|---------|--------|------------|--------|
| Pricing columns on dashboard | Hidden | Visible | **PARTIAL** (API still returns data) |
| Accounting / payroll tab button | Hidden | Visible | **PARTIAL** (no route guard in `App.tsx`) |
| Pickup price preview | Hidden | Visible | **SECURE** (UI) |
| Full pricing logic in JS bundle | Readable | Readable | **GAP** (operational IP in client) |

---

## Logging & error leakage

| Area | Rating | Notes |
|------|--------|-------|
| Request logging of PII | **PARTIAL** | No systematic redaction policy in code |
| Seed console output | **PARTIAL** | Logs dispatcher email and driver names |
| 500 error responses | **PARTIAL** | Some routes return `error.message` to clients |
| `/health` on DB failure | **PARTIAL** | May expose DB error text |

Policy reference: root `AGENTS.md` — do not log PII or signature data. Implementation is incomplete.

---

## Client-side storage (PWA)

Offline-first design intentionally caches waybill data, signatures, and auth tokens in the browser. This is **expected** for field drivers but implies:

- Physical device access = data access
- XSS in any script = token exfiltration (JWT in non-HttpOnly cookie + localStorage)
- No encryption at rest for IndexedDB

Mitigations: device passcodes, short JWT expiry (12h), logout clears session stores.

---

## Production operations checklist

- [ ] `JWT_SECRET`, `DATABASE_URL`, `SEED_*` set via Fly secrets (never in git)
- [ ] Run seed only via SSH after credential changes — `fly deploy` does not update logins
- [ ] Do **not** set `SEED_ARCHIVE_RESEED=true` on production unless intentional wipe
- [ ] Real archive CSV mounted via `ARCHIVE_CSV_PATH` or Fly volume — not committed
- [ ] `VITE_BUSINESS_EMAIL` set at frontend build for production remittance/contact display
- [ ] Review this audit after major RBAC or payroll changes

---

## Verification performed (2026-07-02)

- Code review of auth middleware, payroll routes, waybill routes, sync routes, app static config
- Gitignore and tracked-file review for credentials and archive data
- Backend Jest suite: 58/58 passing (includes payroll RBAC test)
- Redaction pass: env-based seed, synthetic fixtures, docs credential removal

---

## Sign-off & next review

| Role | Status |
|------|--------|
| Automated/code audit | Complete — 2026-07-02 |
| P1–P4 remediation | **Pending** |
| Recommended re-audit | After sync RBAC + uploads auth ship, or before public repo promotion |

For questions or remediation tracking, see `HANDOFF.md` §8 (redaction) and open issues for P1–P5 above.
