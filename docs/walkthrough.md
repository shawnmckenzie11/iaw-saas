# PWA Walkthrough Recording Guide

Record a short (~20–30s) demo of the main driver pickup and dispatcher pending-price flows using Playwright. **Do not commit video files** — artifacts land in `test-results/` (gitignored).

## Prerequisites

```bash
npm install
cd backend && npx prisma db push && npx ts-node src/seed.ts && cd ..
```

Set seed credentials in `backend/.env` (see `backend/.env.example`).

## Record the walkthrough

```bash
npm run test:e2e:walkthrough
```

Videos are written to:

```
test-results/
  walkthrough-chromium/
    video.webm
```

## What the spec covers

1. **Driver login** → NEW PICKUP → complete pickup wizard (synthetic locations).
2. **Dispatcher login** → Pending Price tab → open row modal → enter quote.

The spec creates a unique test waybill (`WALK-*`) and voids it in teardown so no scratch data remains.

## Manual recording (alternative)

1. Run `npm run dev` from the project root.
2. Use QuickTime or OBS to capture `http://localhost:3000`.
3. Follow the steps in `tests/e2e/walkthrough.spec.ts` as a script.

## Screenshot placeholders

For static docs, capture these screens after `npm run dev`:

| Step | Screen |
|------|--------|
| 1 | Login page (Driver + Dispatcher tabs) |
| 2 | Driver dashboard with sync badges |
| 3 | Pickup wizard step 1 (location chips) |
| 4 | Dispatch dashboard — Active Jobs tab |
| 5 | Pending Price modal with quote field |
| 6 | Accounting → Payroll employee list |

Save screenshots locally; do not commit real customer or financial data.
