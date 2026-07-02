# End-to-End Testing Infrastructure Specification (TEST_INFRA.md)

This document defines the E2E testing framework, test cases, and execution strategy for the **IAW Courier Delivery Capture SaaS** platform. It provides a structured verification methodology across four tiers of testing severity, ensuring cryptographic signature integrity, offline synchronization reliability, and role-based access control (RBAC).

---

## 🏗️ Core Features & Capabilities Under Test

- **F1: Driver Pin Authentication**: Secure driver access via 4-digit PIN, returning a role-scoped JWT token with a `driverId` claim.
- **F2: Dispatcher Credentials Authentication**: Operations management access via email/password credentials, returning a JWT token with a `DISPATCHER` role claim.
- **F3: API RBAC Gatekeeping**: Authorization gates blocking unauthorized waybill actions, rejecting mismatched `driverId` operations, and granting global administrative permissions for dispatchers.
- **F4: Offline Local IndexedDB Queueing**: Client-side buffer management using browser/hybrid storage, segregating text events from media blobs, and providing dashboard counters for pending uploads.
- **F5: Event-Sourced Operations and Replay**: Append-only log of `waybill_events` that materializes waybills' lifecycle state through deterministic projection replay.
- **F6: Dual-Sync Endpoints Coordination**: Order-preserving synchronization endpoints (`/api/sync/events` and `/api/sync/blobs`) for flushing offline-buffered events and attachments.

---

## 🎯 Test Tier Definitions

- **Tier 1 (Unit & Functional)**: Isolated tests verifying boundary values, input validation rules, and correct happy-path responses.
- **Tier 2 (Integration & Security)**: Verification of role-based authorization limits, error handling, session/token lifecycles, and database constraints.
- **Tier 3 (Combinations & Cross-Feature)**: Matrix interactions validating authentication, RBAC, event sourcing, and local storage simultaneously.
- **Tier 4 (Application E2E Scenarios)**: Real-world user journeys representing network failures, concurrent modifications, dispatcher overrides, and device restorations.

---

## 🧪 Detailed Test Cases Specification

### F1: Driver Pin Authentication

#### Tier 1: Unit & Functional (5 Cases)
*   **F1-T1-01: Valid Driver PIN Authentication**
    *   *Setup*: Submit a valid 4-digit PIN payload to `/api/auth/driver/login`.
    *   *Expected Behavior*: Server returns `200 OK` with a JWT token. Token payload contains `role: "DRIVER"`, `driverId` matching the driver record, and a valid expiration date.
*   **F1-T1-02: Invalid PIN Pattern Rejection**
    *   *Setup*: Submit a malformed PIN (e.g. `"12a"`, `"12345"`, `""`) to the login endpoint.
    *   *Expected Behavior*: Server returns `400 Bad Request` containing clear validation errors.
*   **F1-T1-03: Unregistered PIN Rejection**
    *   *Setup*: Submit a 4-digit PIN that is not registered in the database (e.g. `"9999"`).
    *   *Expected Behavior*: Server returns `401 Unauthorized` with an error message.
*   **F1-T1-04: JWT Expiration Verification**
    *   *Setup*: Authenticate with a valid PIN. Parse the returned JWT.
    *   *Expected Behavior*: The `exp` claim must be set to the configured session duration (e.g., 12 hours) and be in the future.
*   **F1-T1-05: Case-Insensitive / Non-Numeric PIN Filtering**
    *   *Setup*: Post a PIN consisting of special characters/alphabetic characters (e.g., `"$#%@"`).
    *   *Expected Behavior*: Server rejects with `400 Bad Request` without querying the database (early validation).

#### Tier 2: Integration & Security (5 Cases)
*   **F1-T2-01: Unauthorized Endpoint Access**
    *   *Setup*: Request a protected driver endpoint (e.g. `/api/deliveries/assigned`) with no authorization header.
    *   *Expected Behavior*: Server returns `401 Unauthorized`.
*   **F1-T2-02: Malformed JWT Signature Rejection**
    *   *Setup*: Request a protected driver endpoint with a JWT that has a tampered signature.
    *   *Expected Behavior*: Server returns `403 Forbidden` or `401 Unauthorized`.
*   **F1-T2-03: Expired Driver JWT Rejection**
    *   *Setup*: Sign a mock driver JWT with an expiration timestamp in the past. Request a protected driver endpoint.
    *   *Expected Behavior*: Server returns `401 Unauthorized` indicating token expiration.
*   **F1-T2-04: Role Collision Block**
    *   *Setup*: Request a driver-only action using a dispatcher JWT.
    *   *Expected Behavior*: Server returns `403 Forbidden` if the role check strictly requires a driver role.
*   **F1-T2-05: Bruteforce PIN Lockout**
    *   *Setup*: Send 5 consecutive failed PIN attempts for a specific driver profile.
    *   *Expected Behavior*: The driver account transitions to a temporary locked state. Subsequent login attempts with the correct PIN return `423 Locked` until the cooldown expires.

---

### F2: Dispatcher Credentials Authentication

#### Tier 1: Unit & Functional (5 Cases)
*   **F2-T1-01: Valid Dispatcher Credentials Login**
    *   *Setup*: Submit a registered email and password to `/api/auth/dispatcher/login`.
    *   *Expected Behavior*: Server returns `200 OK` with a dispatcher JWT token. Token claims contain `role: "DISPATCHER"`.
*   **F2-T1-02: Invalid Password Rejection**
    *   *Setup*: Submit a registered email and an incorrect password.
    *   *Expected Behavior*: Server returns `401 Unauthorized` with a generic authentication error.
*   **F2-T1-03: Malformed Email Address Rejection**
    *   *Setup*: Submit an invalid email format (e.g. `"dispatcher_at_domain.com"`) and a password.
    *   *Expected Behavior*: Server returns `400 Bad Request`.
*   **F2-T1-04: Unregistered Email Rejection**
    *   *Setup*: Submit an email that is not in the dispatcher database.
    *   *Expected Behavior*: Server returns `401 Unauthorized` (preventing dispatcher user enumeration).
*   **F2-T1-05: Missing Payload Parameters**
    *   *Setup*: Submit a body missing the password field.
    *   *Expected Behavior*: Server returns `400 Bad Request`.

#### Tier 2: Integration & Security (5 Cases)
*   **F2-T2-01: Protected Dispatcher Dashboard Access**
    *   *Setup*: Request dispatcher admin statistics endpoints without an authorization header.
    *   *Expected Behavior*: Server returns `401 Unauthorized`.
*   **F2-T2-02: Driver Role Rejection on Dispatcher Routes**
    *   *Setup*: Request dispatcher operations endpoints (e.g. `/api/admin/rates`) using a driver JWT.
    *   *Expected Behavior*: Server returns `403 Forbidden`.
*   **F2-T2-03: Token Revocation / Logout Verification**
    *   *Setup*: Post to `/api/auth/logout` with a dispatcher token, then request a dashboard route with that same token.
    *   *Expected Behavior*: The server rejects the second request with `401 Unauthorized` (token added to blocklist or session terminated).
*   **F2-T2-04: Password Hashing Integrity Check**
    *   *Setup*: Attempt to read the dispatcher table directly.
    *   *Expected Behavior*: Password field must be hashed using a strong hashing algorithm (e.g., bcrypt/argon2). Plaintext passwords must never be stored.
*   **F2-T2-05: Session Expiration Enforcement**
    *   *Setup*: Test dispatcher dashboard interactions after the dispatcher token's expiration window.
    *   *Expected Behavior*: App automatically logouts the user and redirects them to the login screen.

---

### F3: API RBAC Gatekeeping

#### Tier 1: Functional RBAC Checks (5 Cases)
*   **F3-T1-01: Driver Read Access to Assigned Waybill**
    *   *Setup*: Log in as Driver 1. Query `GET /api/waybills/W-001` (assigned to Driver 1).
    *   *Expected Behavior*: Server returns the waybill details with `200 OK`.
*   **F3-T1-02: Driver Read Access to Unassigned Waybill**
    *   *Setup*: Log in as Driver 1. Query `GET /api/waybills/W-002` (status: `DRAFT` / unassigned).
    *   *Expected Behavior*: Server returns `200 OK` (drivers can view unassigned pool to claim jobs).
*   **F3-T1-03: Driver Blocked from Other Driver's Waybill**
    *   *Setup*: Log in as Driver 1. Query `GET /api/waybills/W-003` (assigned to Driver 2).
    *   *Expected Behavior*: Server returns `403 Forbidden`.
*   **F3-T1-04: Driver Blocked from Admin Rate Table**
    *   *Setup*: Log in as Driver 1. Request `GET /api/admin/rates`.
    *   *Expected Behavior*: Server returns `403 Forbidden`.
*   **F3-T1-05: Dispatcher Global Access to All Waybills**
    *   *Setup*: Log in as Dispatcher. Request `GET /api/waybills/W-003` (assigned to Driver 2).
    *   *Expected Behavior*: Server returns `200 OK`.

#### Tier 2: Integration RBAC Validation (5 Cases)
*   **F3-T2-01: Driver Mismatched Waybill Mutation Block**
    *   *Setup*: Driver 1 attempts to update the status of `W-003` (assigned to Driver 2) to `DELIVERED`.
    *   *Expected Behavior*: Server blocks the mutation with `403 Forbidden`.
*   **F3-T2-02: Dispatcher Global Overrides**
    *   *Setup*: Dispatcher attempts to modify the status of `W-003` (assigned to Driver 2).
    *   *Expected Behavior*: Server allows the operation with `200 OK`.
*   **F3-T2-03: Preventing Status Hijacking**
    *   *Setup*: Driver 1 attempts to claim a waybill `W-004` that is already claimed/assigned to Driver 2.
    *   *Expected Behavior*: Server rejects the request with `409 Conflict` or `403 Forbidden`.
*   **F3-T2-04: SQL/NoSQL Mutation Injection Protection**
    *   *Setup*: Driver submits a waybill status update payload containing modified metadata fields (e.g. `calculatedPrice: 0.00`).
    *   *Expected Behavior*: The server filters out unauthorized fields or rejects the request, recalculating or preserving the database values.
*   **F3-T2-05: Dispatcher Administrative Lock Verification**
    *   *Setup*: An invoice has been generated for a waybill. Dispatcher attempts to change the route details of the locked waybill.
    *   *Expected Behavior*: Server rejects changes with `422 Unprocessable Entity` because the waybill is locked post-invoice.

---

### F4: Offline Local IndexedDB Queueing

#### Tier 1: Client Storage & Buffering (5 Cases)
*   **F4-T1-01: Offline Waybill Data Buffering**
    *   *Setup*: Toggle network status to offline. Create a new pickup waybill.
    *   *Expected Behavior*: The client stores the record in IndexedDB (`waybill_events` queue). The app dashboard shows `1 Pending Sync`.
*   **F4-T1-02: Separate Media Blob Buffering**
    *   *Setup*: Toggle network to offline. Capture a delivery signature and photo.
    *   *Expected Behavior*: The text metadata is saved to the text queue, and the signature/photo blobs are stored in a separate blob queue in IndexedDB.
*   **F4-T1-03: UI Sync Counter Increment**
    *   *Setup*: Create 3 offline waybill events.
    *   *Expected Behavior*: The UI counter dynamically updates to show `3 Pending Sync`.
*   **F4-T1-04: IndexedDB Persistence across Refresh**
    *   *Setup*: Buffer 2 offline events. Trigger a browser/page reload.
    *   *Expected Behavior*: Upon reload, the data is retrieved from IndexedDB, and the UI counter still shows `2 Pending Sync`.
*   **F4-T1-05: Empty Queue Verification**
    *   *Setup*: Open the app fresh with no offline actions.
    *   *Expected Behavior*: IndexedDB queues are empty, and the UI shows `0 Pending Sync` and `Synced`.

#### Tier 2: Integration & Recovery (5 Cases)
*   **F4-T2-01: Text vs Blob Priority Order**
    *   *Setup*: Queue a delivery status update event and a signature photo blob offline. Restore connection.
    *   *Expected Behavior*: The Sync Manager resolves the text update first to establish the event timeline on the server before transmitting the binary blob payload.
*   **F4-T2-02: Client-side Validation of Offline Queue**
    *   *Setup*: Attempt to save a malformed waybill offline (e.g., missing required destination).
    *   *Expected Behavior*: Client-side validation blocks the save operation before it reaches IndexedDB, notifying the user.
*   **F4-T2-03: Corrupt Queue Recovery**
    *   *Setup*: Force-insert an invalid JSON record into the local IndexedDB queue.
    *   *Expected Behavior*: The sync loop skips or isolates the corrupt entry, increments a failure/conflict log, and processes the rest of the queue without crash.
*   **F4-T2-04: Connection Restore Trigger**
    *   *Setup*: Buffer 1 event offline. Toggle network connection status back to online.
    *   *Expected Behavior*: The client detects the network transition and automatically kicks off the background sync process.
*   **F4-T2-05: Storage Cleared post-Sync**
    *   *Setup*: Perform multiple actions offline. Restore network and wait for successful sync.
    *   *Expected Behavior*: IndexedDB records that were successfully synchronized are purged from local storage, restoring disk space.

---

### F5: Event-Sourced Operations and Replay

#### Tier 1: Event Log Append & Processing (5 Cases)
*   **F5-T1-01: Event Logging on Waybill Creation**
    *   *Setup*: Submit a new waybill pickup.
    *   *Expected Behavior*: An event of type `WAYBILL_CREATED` is appended to the `waybill_events` table containing the initial payload.
*   **F5-T1-02: Status Progression Validation**
    *   *Setup*: Append a `DELIVERED` event directly after a `WAYBILL_CREATED` event without a `PICKED_UP` event.
    *   *Expected Behavior*: Database or state projection engine rejects the state transition as invalid.
*   **F5-T1-03: Sequential Event Replay Projection**
    *   *Setup*: Create a waybill, update it to `PICKED_UP`, and then update it to `DELIVERED`. Replay these events through the projector.
    *   *Expected Behavior*: The projector materializes the final state of the waybill as status `DELIVERED`.
*   **F5-T1-04: Uniqueness of Sequence Numbers**
    *   *Setup*: Submit two events for the same waybill.
    *   *Expected Behavior*: The database constraints enforce incremental sequence numbers (e.g. `seq = 1`, `seq = 2`) to ensure chronological order.
*   **F5-T1-05: Immutable Event History**
    *   *Setup*: Attempt to update or delete a row in the `waybill_events` table.
    *   *Expected Behavior*: Operation is rejected by database rules/triggers (events are append-only).

#### Tier 2: DB Integration & Validation (5 Cases)
*   **F5-T2-01: Materialized State Sync**
    *   *Setup*: Append a valid `WAYBILL_ASSIGNED` event for a driver.
    *   *Expected Behavior*: The main `waybills` projection table immediately reflects the updated `driverId` and status.
*   **F5-T2-02: Optimistic Concurrency Conflict**
    *   *Setup*: Submit an event with sequence number `2` when the server already has a sequence number `2` event.
    *   *Expected Behavior*: The transaction fails, returning a concurrency error (indicating a synchronization collision).
*   **F5-T2-03: Invalid Event Payload Rejection**
    *   *Setup*: Append an event with missing metadata (e.g., missing timestamp or operator ID).
    *   *Expected Behavior*: Schema validation rejects the append action.
*   **F5-T2-04: Timeline Replay Consistency**
    *   *Setup*: Reconstruct a waybill from the database by replaying its events. Compare it with the materialized `waybills` record.
    *   *Expected Behavior*: The states must match exactly (source-of-truth parity).
*   **F5-T2-05: Projector Fail-Safe Rollback**
    *   *Setup*: Introduce a runtime failure in the projection code during event handling.
    *   *Expected Behavior*: The transaction wrapping both the event append and projection updates is rolled back completely.

---

### F6: Dual-Sync Endpoints Coordination

#### Tier 1: Sync Flow & Execution (5 Cases)
*   **F6-T1-01: Bulk Events Sync Endpoint**
    *   *Setup*: Post a batch of 3 events to `/api/sync/events`.
    *   *Expected Behavior*: Server saves the events, updates projections, and returns `200 OK` with a list of synced event IDs.
*   **F6-T1-02: Media Blob Sync Endpoint**
    *   *Setup*: Post a multipart/form-data payload with a signature signature image to `/api/sync/blobs`.
    *   *Expected Behavior*: Server saves the file, returns `201 Created` along with the file URI.
*   **F6-T1-03: Empty Sync Request Handling**
    *   *Setup*: Client sync triggers with empty queues.
    *   *Expected Behavior*: Server returns `200 OK` with no changes.
*   **F6-T1-04: Invalid Event Sync Structure Rejection**
    *   *Setup*: Submit malformed JSON data to `/api/sync/events`.
    *   *Expected Behavior*: Server returns `400 Bad Request`.
*   **F6-T1-05: Missing Binary Blob Parameter**
    *   *Setup*: Call `/api/sync/blobs` without attaching a binary payload.
    *   *Expected Behavior*: Server returns `400 Bad Request`.

#### Tier 2: Coordination & Error Handling (5 Cases)
*   **F6-T2-01: Partial Sync Success recovery**
    *   *Setup*: Flush a queue of 3 events where the 2nd event has a validation conflict.
    *   *Expected Behavior*: The server processes the 1st event, marks the 2nd as `CONFLICT`, processes the 3rd, and notifies the client of the specific conflict index.
*   **F6-T2-02: Blob Upload Failure Retry**
    *   *Setup*: Simulating a network drop during signature image upload, but text metadata is synced.
    *   *Expected Behavior*: The client retains the image blob in IndexedDB and schedules a retry for the blob endpoint only, preventing duplicate event logging.
*   **F6-T2-03: JWT Authentication Enforcement on Sync**
    *   *Setup*: Request `/api/sync/events` or `/api/sync/blobs` with no authorization token.
    *   *Expected Behavior*: Server returns `401 Unauthorized`.
*   **F6-T2-04: Large Media Payload Optimization**
    *   *Setup*: Sync a high-resolution photo blob exceeding 5MB.
    *   *Expected Behavior*: Server either compresses the image, segments the transfer, or rejects with standard size limitation errors gracefully.
*   **F6-T2-05: Queue Flushing Conflict Flagging**
    *   *Setup*: Sync an event that was modified on the server in the interim (colliding version).
    *   *Expected Behavior*: The sync response flags the conflict, and the client marks the local waybill status as `CONFLICT`.

---

## 🔗 Tier 3: Combinations & Integration Matrix (6 Tests)

*   **F3-T3-01: Authenticated Driver Event Submission (F1 + F3 + F5)**
    *   *Setup*: Driver 1 logs in via PIN, acquires token, and submits a status update event (`WAYBILL_PICKED_UP`) for a waybill assigned to them.
    *   *Expected Behavior*: The server authorizes the request via JWT role/driver claim checks, appends the event to the log, and projects the new status onto the waybill record.
*   **F3-T3-02: Authenticated Driver Unauthorized Event Attempt (F1 + F3 + F5)**
    *   *Setup*: Driver 1 logs in via PIN. Driver 1 attempts to append a status event (`WAYBILL_PICKED_UP`) to a waybill assigned to Driver 2.
    *   *Expected Behavior*: Server RBAC gate rejects the request with `403 Forbidden` and no event is logged or projected.
*   **F3-T3-03: Dispatcher Administrative State Override (F2 + F3 + F5)**
    *   *Setup*: Dispatcher logs in via credentials, retrieves token, and posts a manual status correction event (`DISPATCHER_OVERRIDE`) for Driver 2's waybill.
    *   *Expected Behavior*: Server authorizes the dispatcher, logs the administrative override event, and projects the corrected state onto the waybill.
*   **F3-T3-04: Offline Queue Accumulation & Bulk Upload (F4 + F6 + F1)**
    *   *Setup*: Driver logs in, then shifts offline. Driver performs multiple waybill status transitions (pickup, signoff with signature). When online, client flushes both the events queue and blob queue using the active driver JWT.
    *   *Expected Behavior*: Server receives events first, validates driver permissions, inserts to event-store, projects states, then accepts and maps the signature blob payload to the waybill.
*   **F3-T3-05: Sequential Execution Order during Sync (F4 + F5 + F6)**
    *   *Setup*: Driver operates offline and performs sequential actions on a waybill: (1) `PICKED_UP`, (2) `STATUS_DELAYED`, (3) `DELIVERED`. The client queues them. When online, the client flushes.
    *   *Expected Behavior*: Server receives and processes the event batch in the exact chronological sequence (1 -> 2 -> 3). Projections execute sequentially; the final state matches `DELIVERED`.
*   **F3-T3-06: Conflicted Sync Validation & Lockout (F4 + F6 + F3)**
    *   *Setup*: Driver tries to flush an offline event changing the status of a waybill that has already been administrative-locked/billed on the server.
    *   *Expected Behavior*: Server RBAC/Business Logic rejects the event with `409 Conflict`. The client marks the local sync status as `CONFLICT` and halts auto-syncing for this record.

---

## 🗺️ Tier 4: Application E2E Scenarios (5 Tests)

### F4-T4-01: Happy Path Driver E2E Shift
1.  **Authentication**: Driver logs in via 4-digit PIN, gets dashboard view.
2.  **Job Claim**: Driver views unassigned waybills, taps "Claim", transitions waybill state to `ASSIGNED`.
3.  **Offline Log**: Driver goes into a dead zone (offline switch toggled). Driver clicks "Pickup", enters details, saves. App increments pending queue.
4.  **Dropoff & Sign-off**: Driver arrives, inputs recipient printed name, captures signature drawing. App buffers signature blob.
5.  **Reconnection**: Driver enters service (online switch toggled). Sync Manager initiates.
6.  **Flushing & Projection**: Text events sync to `/api/sync/events` -> signature blob syncs to `/api/sync/blobs` -> server projects final `DELIVERED` status -> database records updated.
7.  **Verification**: Dispatcher logs in, views waybill history showing complete timeline and verified signature image.

### F4-T4-02: Mid-Sync Connection Interruption Recovery
1.  **Background**: Client is online with a large queued backlog (5 events, 5 blobs).
2.  **Initiation**: Client starts flushing the queue. First 3 events sync successfully.
3.  **Dropout**: Network drops out completely mid-transit.
4.  **Client Response**: Sync Manager handles the connection error, pauses the flushing cycle, retains remaining 2 events and 5 blobs in IndexedDB, and updates UI to show the remainder pending.
5.  **Restoration**: Network reconnects. Sync manager resumes.
6.  **Resolution**: Sync Manager sends the remaining events, then flushes all blobs. Server consolidates the projections. No duplicate events are created.

### F4-T4-03: Concurrency and Race Conflict Management
1.  **Background**: Waybill `M-1002` is unassigned.
2.  **Race Setup**: Driver A and Driver B both download the unassigned list, then both go offline.
3.  **Conflict Action**: Offline, Driver A claims the job. Driver B also claims the job.
4.  **Sync Sequence**:
    *   Driver A goes online and syncs. Server processes Driver A's event first -> Waybill projected to `ASSIGNED` to Driver A.
    *   Driver B goes online and syncs. Server receives Driver B's claim event.
5.  **Rejection**: Server rejects Driver B's update because the waybill is already assigned.
6.  **Feedback**: Driver B's client receives a conflict code, updates the waybill card status to `CONFLICT` with a red badge, and leaves the event in the queue for manual dispatcher/driver resolution.

### F4-T4-04: Dispatcher Dispute Resolution Override
1.  **Background**: A waybill has synced with a conflict status due to a wrong address input by the driver.
2.  **Action**: Dispatcher contacts the driver, verifies the correct customer location details.
3.  **Correction**: Dispatcher logs into the web dashboard, inputs correct details, and submits.
4.  **Event Store**: The backend appends a `DISPATCHER_CORRECTION` event with the corrected metadata and dispatcher ID credentials.
5.  **Projection**: State projector replays and materializes the corrected address.
6.  **Audit Trail**: The timeline displays the driver's original offline entry, the conflict occurrence, and the dispatcher's corrective event (preserving full history for invoicing).

### F4-T4-05: High-Density Media Queue Handling
1.  **Setup**: Driver must capture 6 separate proof-of-delivery photos and a signature for a complex bulk machinery delivery while offline.
2.  **Buffering**: Client saves all 7 binary items in IndexedDB without memory leakage or UI crashes.
3.  **Sync Start**: Driver goes online. Client schedules uploads.
4.  **Execution**: Client uploads text status events first. Once successful, client uploads the 7 blobs sequentially (managing connection streams).
5.  **Completion**: Server maps all 7 media files to the waybill event. Client clears local binary stores. UI shows `0 Pending Sync`.
