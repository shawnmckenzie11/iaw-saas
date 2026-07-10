# IAW SaaS — Data Safety & Exposure Audit

**Audit date:** 2026-07-02  
**Last remediation update:** 2026-07-10  
**Scope:** Business PII, delivery/financial data, payroll records, credentials, and public-repo exposure  
**Application:** `iaw-saas` (React PWA + Express/Prisma on Fly.io Postgres)  
**Production URL:** `https://iaw.mckenzian.com`

---

## Executive summary

| Question | Answer |
|----------|--------|
| Is payroll data protected from unauthorized online access? | **Yes** — API requires dispatcher JWT; drivers receive 403 on `/api/admin/employees`. |
| Is all business/financial data fully safe from online exposure? | **Improved** — P1–P3 and key P5 items remediated; residual gaps remain (see §Remaining). |
| Are credentials safe in the public git repo? | **Improved** — seed credentials are env-only; historical archive CSV may still exist in git history (P4). |
| Is production database access restricted? | **Yes** — Postgres on Fly, `DATABASE_URL` via secrets, not in git. |

**Overall rating: HARDENED MVP** — sync RBAC, authenticated uploads, driver pricing stripping, signature image hashing, JWT fail-closed, CORS restriction, and dispatcher lockout are in place. Do not treat as fully compliant for regulated financial/HR data until remaining P4/P5 items below are addressed.

---

## What is protected today

### Production infrastructure

| Control | Status | Notes |
|---------|--------|-------|
| Database | **SECURE** | Fly Postgres; `DATABASE_URL` injected as Fly secret |
| JWT signing | **SECURE** | `JWT_SECRET` required in production (startup fails if unset); 12h expiry |
| HTTPS | **SECURE** | Fly-managed TLS on `iaw.mckenzian.com` |
| Secrets in git | **SECURE** | `backend/.env`, `.env.test`, `frontend/.env*` gitignored |
| Seed credentials in source | **SECURE** | `SEED_*` env vars via `backend/src/seedConfig.ts` |
| CORS | **SECURE** (when configured) | Restricted to `PUBLIC_APP_URL` when set |

### API access control

| Route | Auth | Role | Rating |
|-------|------|------|--------|
| `GET/POST /api/waybills/*` | JWT | Driver RBAC + dispatcher global | **SECURE** |
| `GET/POST/PUT/DELETE /api/admin/employees/*` | JWT | Dispatcher only | **SECURE** |
| `GET /api/admin/rates`, `POST /api/admin/intake/sync` | JWT | Dispatcher only | **SECURE** |
| `POST /api/auth/*/login` | Public | Driver + dispatcher lockout (5 fails / 60s) | **SECURE** |
| `POST /api/sync/events`, `POST /api/sync/blobs` | JWT + waybill RBAC | Drivers cannot mutate other drivers' waybills; pricing stripped | **SECURE** |
| `GET /uploads/:filename` | JWT (Bearer or session cookie) | Drivers scoped to accessible waybills | **SECURE** |

Payroll API enforcement: `backend/src/routes/payrollRoutes.ts` applies `requireAuth` + `requireRole('DISPATCHER')` on all routes.

### Signature tamper evidence

| Control | Status | Notes |
|---------|--------|-------|
| Image + metadata hash | **SECURE** | `signatureHash` = SHA-256(`imageBytes \| clientSideUuid \| deliveredAt \| signatureName \| driverId`) |
| Storage / retrieval | **UNCHANGED** | `signatureImageUrl` / `proofPhotoUrl` still stored on the delivery record and returned to authorized clients |
| Upload path | `POST /api/sync/blobs` | Writes file under `/uploads`, updates DB URL + hash for signatures |

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
| Customer names, addresses, signatures | Fly Postgres + `/uploads` (auth-gated) | Low–Medium — DB protected; uploads require session |
| Delivery pricing / invoices | Postgres | Low for drivers — omitted from DRIVER API serialization |
| Payroll (Employee: name, email, payRate) | Postgres | Low via API — dispatcher-only |
| Driver PINs | Postgres (`pinHash`) | Low — hashed; 4-digit entropy is weak |
| Dispatcher passwords | Postgres (`bcrypt`) | Low |
| JWT sessions | Client localStorage/cookie + IndexedDB | Medium — device/XSS risk (cookie still readable by JS) |
| Offline event queue | IndexedDB (`iaw_db`) | Medium — device-loss risk; expected for PWA |

---

## Remediation status (2026-07-10)

### P1 — Sync routes bypass waybill RBAC — **DONE**

- `canDriverMutateWaybill` helper in `middleware/auth.ts`
- `syncEventsBatch` strips driver pricing fields and rejects cross-driver mutations
- Blob uploads require an existing waybill and enforce driver ownership
- Covered by `backend/src/routes/syncRoutes.test.ts`

### P2 — Public `/uploads` static files — **DONE**

- Replaced open `express.static('/uploads')` with authenticated `GET /uploads/:filename`
- Accepts Bearer JWT or `iaw_auth_session` cookie (same-origin `<img src>` continues to work)
- Drivers may only fetch files for waybills they can access

### P3 — Financial fields in driver API responses — **DONE**

- `serializeWaybill(record, { role })` omits `calculatedPrice` / `pricingTotalCost` for `DRIVER`
- Applied on waybill list and detail routes
- Sync ingest also strips pricing from driver event payloads

### P4 — Historical PII in git history — **OPEN (ops)**

**Risk:** `docs/BACKUP of Requests - Archive.csv` was previously committed; real customer/route data may be recoverable via `git log` / clone history.  
**Fix:** Run `git filter-repo` or BFG purge on a coordinated maintenance window, or treat historical clones as exposed. **Do not run destructive history rewrite without explicit approval.**

### P5 — Production auth hardening — **PARTIAL**

| Issue | Status | Notes |
|-------|--------|-------|
| JWT fail-closed in production | **DONE** | `middleware/auth.ts` throws if `JWT_SECRET` unset when `NODE_ENV=production` |
| CORS restricted to `PUBLIC_APP_URL` | **DONE** | When env is set |
| Dispatcher login lockout | **DONE** | Same 5-fail / 60s pattern as drivers |
| Secure cookie flag on HTTPS | **DONE** | Frontend sets `Secure` when served over HTTPS |
| HttpOnly session cookie | **OPEN** | Still set from JS (readable by XSS); needs server-issued cookie refactor |
| Shared token revocation / lockout store | **OPEN** | In-memory only — insufficient for multi-instance Fly |
| PIN bcrypt/pepper | **OPEN** | Still SHA-256 of 4-digit PIN |

---

## Frontend role separation

| Surface | Driver | Dispatcher | Rating |
|---------|--------|------------|--------|
| Pricing columns on dashboard | Hidden | Visible | **SECURE** (API + UI) |
| Accounting / payroll tab | Hidden + App route guard | Visible | **SECURE** |
| Pickup price preview | Hidden | Visible | **SECURE** |
| Full pricing logic in JS bundle | Readable | Readable | **GAP** (operational IP in client) |

---

## Logging & error leakage

| Area | Rating | Notes |
|------|--------|-------|
| Request logging of PII | **PARTIAL** | No systematic redaction policy in code |
| Seed console output | **PARTIAL** | Logs dispatcher email and driver names |
| 500 error responses | **IMPROVED** | `/health` no longer returns raw DB error text |
| `/health` on DB failure | **SECURE** | Generic `DISCONNECTED` status |

Policy reference: root `AGENTS.md` — do not log PII or signature data.

---

## Client-side storage (PWA)

Offline-first design intentionally caches waybill data, signatures, and auth tokens in the browser. This is **expected** for field drivers but implies:

- Physical device access = data access
- XSS in any script = token exfiltration (JWT still in JS-readable storage)
- No encryption at rest for IndexedDB

Mitigations: device passcodes, short JWT expiry (12h), logout clears session stores, HTTPS `Secure` cookie flag.

---

## Production operations checklist

- [ ] `JWT_SECRET`, `DATABASE_URL`, `SEED_*` set via Fly secrets (never in git)
- [ ] `PUBLIC_APP_URL=https://iaw.mckenzian.com` set so CORS is restricted
- [ ] Run seed only via SSH after credential changes — `fly deploy` does not update logins
- [ ] Do **not** set `SEED_ARCHIVE_RESEED=true` on production unless intentional wipe
- [ ] Real archive CSV mounted via `ARCHIVE_CSV_PATH` or Fly volume — not committed
- [ ] `VITE_BUSINESS_EMAIL` set at frontend build for production remittance/contact display
- [ ] Review this audit after major RBAC or payroll changes
- [ ] Schedule P4 git-history purge if the repo was ever public with archive CSV

---

## Verification performed

### 2026-07-02 (initial audit)
- Code review of auth middleware, payroll routes, waybill routes, sync routes, app static config
- Gitignore and tracked-file review for credentials and archive data
- Backend Jest suite passing (includes payroll RBAC test)
- Redaction pass: env-based seed, synthetic fixtures, docs credential removal

### 2026-07-10 (remediation)
- Sync RBAC + signature hash tests (`syncRoutes.test.ts`, `signatureHash.test.ts`)
- Role-aware `serializeWaybill` unit tests
- Authenticated uploads + driver pricing omission covered in sync integration tests

---

## Sign-off & next review

| Role | Status |
|------|--------|
| Automated/code audit | Complete — 2026-07-02 |
| P1–P3 + signature hash remediation | **Complete — 2026-07-10** |
| P4 git history purge | **Pending ops approval** |
| Remaining P5 (HttpOnly cookies, shared revocation, PIN pepper) | **Backlog** |
| Recommended re-audit | Before public repo promotion or multi-region Fly scale-out |

For questions or remediation tracking, see `HANDOFF.md` and open backlog items for P4 / residual P5 above.
