# Deploy iaw-saas to mckenzian.com (Fly.io + Cloudflare)

This guide puts the **courier PWA + API** live at **`https://iaw.mckenzian.com`**, while your marketing site stays at **`https://mckenzian.com`**.

## Architecture

| Piece | Where |
|-------|--------|
| PWA + API | One Fly.io app (`iaw-saas`) on port 8080 |
| PostgreSQL | Fly Postgres (`iaw-saas-db`) in `yyz` (Toronto) |
| DNS | Cloudflare — CNAME `iaw` → `iaw-saas.fly.dev` |
| TLS | Fly-managed certificate for `iaw.mckenzian.com` |

The production Docker image builds the Vite frontend and serves it from Express alongside `/api/*` (same origin — no CORS changes needed).

---

## Prerequisites

- [Fly CLI](https://fly.io/docs/flyctl/install/) installed and logged in (`fly auth login`)
- Cloudflare access to **mckenzian.com** DNS
- This repo on **`main`** (already pushed)

Estimated Fly cost: ~**$7–15/mo** (1 small VM + 1 GB Postgres).

---

## Option A — Automated first deploy

From the repo root:

```bash
chmod +x scripts/setup-fly.sh
npm run setup:fly
```

This script:

1. Creates the Fly app `iaw-saas` (if missing)
2. Creates Postgres `iaw-saas-db` (if missing) and attaches it
3. Sets `JWT_SECRET` and production env secrets
4. Runs `fly deploy`
5. Requests a TLS cert for `iaw.mckenzian.com`

Override defaults if needed:

```bash
APP_DOMAIN=courier.mckenzian.com FLY_APP=iaw-saas npm run setup:fly
```

---

## Option B — Manual step-by-step

### 1. Create the Fly app

```bash
fly apps create iaw-saas --org personal
```

### 2. Create and attach Postgres

```bash
fly postgres create \
  --name iaw-saas-db \
  --region yyz \
  --initial-cluster-size 1 \
  --vm-size shared-cpu-1x \
  --volume-size 1

fly postgres attach iaw-saas-db --app iaw-saas
```

Fly sets `DATABASE_URL` on the app automatically.

### 3. Set secrets

```bash
fly secrets set \
  JWT_SECRET="$(openssl rand -hex 32)" \
  NODE_ENV=production \
  SERVE_FRONTEND=true \
  FRONTEND_DIST=/app/frontend/dist \
  PUBLIC_APP_URL=https://iaw.mckenzian.com \
  --app iaw-saas
```

**Important:** Change dispatcher password after first login — seed uses `dispatcher@example.com` / `password123`.

### 4. Deploy

```bash
fly deploy --app iaw-saas
```

Migrations run automatically on container start (`prisma migrate deploy`).

### 5. Seed synthetic business data (once)

```bash
fly ssh console --app iaw-saas -C 'sh -c "cd /app/backend && node dist/seed.js"'
```

### 6. Custom domain + Cloudflare DNS

Request certificate:

```bash
fly certs add iaw.mckenzian.com --app iaw-saas
fly certs check iaw.mckenzian.com --app iaw-saas
```

In **Cloudflare → mckenzian.com → DNS**, add:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `iaw` | `iaw-saas.fly.dev` | **DNS only** (grey cloud) |

Grey cloud avoids double-proxy TLS issues between Cloudflare and Fly. If you prefer orange cloud, set SSL mode to **Full (strict)** and ensure Fly cert is valid.

Wait a few minutes, then open **https://iaw.mckenzian.com**.

---

## Verify production

```bash
curl -s https://iaw.mckenzian.com/health
# {"status":"OK","database":"CONNECTED"}

curl -sI https://iaw.mckenzian.com/ | head -5
# Should return HTML (Vite index), not JSON
```

Login:

- **Driver:** `driver1` / `1111`
- **Dispatcher tab:** `dispatcher@example.com` / `password123`

---

## Updates after code changes

```bash
git pull
fly deploy --app iaw-saas
```

No need to re-seed unless you reset the database.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `health` shows DB error | `fly postgres attach iaw-saas-db --app iaw-saas` |
| Cert stuck on "Awaiting configuration" | Confirm CNAME `iaw` → `iaw-saas.fly.dev`, DNS only |
| Blank page / JSON at `/` | Redeploy; ensure `SERVE_FRONTEND=true` secret is set |
| 401 on login after deploy | Users must re-login; check `JWT_SECRET` was set before deploy |
| Seed fails in SSH | Use `node dist/seed.js` (not ts-node) inside the container |

Logs:

```bash
fly logs --app iaw-saas
fly status --app iaw-saas
```

---

## Using a different subdomain

Replace `iaw` everywhere with your choice (`courier`, `app`, etc.):

1. Update `PUBLIC_APP_URL` secret
2. `fly certs add courier.mckenzian.com --app iaw-saas`
3. Add matching Cloudflare CNAME

Do **not** point the root `mckenzian.com` record at Fly unless you intend to replace the marketing site.

---

## Local production smoke test

Build and run the same layout Docker uses:

```bash
npm run build
cd backend
SERVE_FRONTEND=true FRONTEND_DIST=../frontend/dist PORT=8080 node dist/server.js
```

Open http://localhost:8080 — you should see the login UI with API on the same port.
