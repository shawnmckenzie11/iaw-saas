# IAW Courier PWA — Driver Instructions

This guide covers the **React PWA** driver workflow (login → dashboard → pickup → delivery/sign-off → offline sync).

---

## 1. Sign In

1. Open the app in your mobile browser (or install the PWA to your home screen).
2. On the login screen, stay on the **Driver** tab.
3. Enter your **username** (driver id, e.g. `drv-01`) and **4-digit PIN**.
4. Tap **Sign In**. You land on the **Driver Portal** dashboard.

---

## 2. Dashboard Overview

The header shows:

| Element | Meaning |
|---------|---------|
| **🟢 Live / 🔴 Off** | Network toggle (for testing offline mode) |
| **S:** synced count | Events successfully uploaded |
| **C:** conflict count | Events rejected by the server (needs retry) |
| **Pending Sync** | Items still in the local upload queue |
| **Sign Out** | Ends your session |

Your active jobs appear in the main table. **Completed** deliveries are grouped in collapsible bars: **Today's**, **This week's**, and **This month's**.

**Pricing is hidden** on the driver dashboard — drivers never see dollar amounts.

---

## 3. Start or Continue a Pickup

### New pickup

1. Tap **➕ NEW PICKUP (WAYBILL)**.
2. **Step 1 — Pickup:** Choose a quick-select chip, **More…**, or **Other** for a custom location. Fill address and contact details.
3. **Step 2 — Dropoff:** Pick destination chips (options may depend on pickup). Use **Other** for custom delivery details or weight.
4. **Step 3 — Review:** Confirm cargo, vehicle, and priority (Regular / Rush).
5. Tap **Complete Pickup** to log the waybill as **Pending-Delivery** (or **Pending-Pickup** if still draft).

### Assigned pickup from dispatch

- Tap a row assigned to you, or tap **Pick Up** in the action column.
- If dropoff was left as **Pending Dropoff**, the wizard opens at step 2 so you can enter the real destination before delivery.

---

## 4. Complete a Delivery

For each **Pending-Delivery** row assigned to you:

| Situation | Action |
|-----------|--------|
| POD required | Tap **Deliver w/ POD** → sign-off screen (signature + optional photo) |
| No POD | Tap **Deliver** → confirm in the popup |

### Sign-off (POD) flow

1. Verify cargo with the recipient.
2. Enter **Printed Name**.
3. Optionally capture a **proof-of-delivery photo**.
4. Have the recipient sign on the canvas.
5. Tap **Complete Delivery & Sign Off**.

---

## 5. Offline Use

The app is **offline-first**:

- Pickups and deliveries save locally when cell service is unavailable.
- Watch **Pending Sync** — wait until it reaches **0** before signing out or clearing browser data.
- When back online, uploads run automatically.
- If **C:** (conflicts) appears, contact dispatch — do not force logout until resolved.

---

## 6. Edge Cases

- **Unassigned jobs** do not appear in your list — only rows with your driver id (or that you created).
- **Rush** jobs may appear with a rush badge and sort to the top of your queue.
- **LIVE FORM** badge indicates the job came from the Google Sheets intake feed (dispatcher-managed).
- Do not log out with pending sync items — local signatures and photos may be lost.
