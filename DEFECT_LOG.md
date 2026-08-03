# Defect Tracking Log - Pharmacy POS System
**Group 16 - Advanced Software Engineering (CSC4630)**

Severity is judged by patient-safety and data-confidentiality impact first, then
by disruption to the cashier workflow. A defect is only marked RESOLVED once an
automated test in `server/src/__tests__/` fails without the fix.

## Open and resolved defects

| Bug ID | Date Reported | Component | Description / Symptom | Severity | Status | Resolution / Fix Details |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEF-001** | 2026-05-01 | SQL Schema | Schema FK mismatch in `prescription_items` referencing `products` instead of `prescriptions`. | High | **RESOLVED** | Refactored FK in `schema_postgres.sql` to reference `prescriptions(prescription_id)`. |
| **DEF-002** | 2026-08-02 | Sales Engine | Expired medications could be sold: checkout performed no expiry validation at all. | Critical | **RESOLVED** | Added an expiry guard in `saleController.createSale`. A named batch must belong to the tenant and be in date; with no batch named the sale resolves first-expired-first-out among in-date stock and is refused when every tracked batch has lapsed. Covered by `expiryGuard.test.js`. |
| **DEF-003** | 2026-08-02 | Sales Engine | Prescription-only drugs (`requires_prescription=true`) missing validation check during cashier checkout. | High | **RESOLVED** | Enforced mandatory `prescriptionId` check for prescription drugs in `saleController.js`. Covered by `sale.test.js`. |
| **DEF-004** | 2026-08-02 | Auth Engine | Cross-tenant data leak risk when querying stock across branches. | High | **RESOLVED** | Every controller scopes its queries by `tenant_id`, taken from the signed token in `middleware/auth.js`. Covered by `tenantIsolation.test.js`. |
| **DEF-005** | 2026-08-02 | Receipt Engine | Printable receipt layout misaligned on 80mm thermal receipt printers. | Medium | **RESOLVED** | Styled fixed-width 300px monospace thermal preview template in `receiptController.js`. |
| **DEF-006** | 2026-08-03 | Auth Engine | Any tenant `Admin` could sign in at the ControlHub and be issued a token carrying `role: 'SuperAdmin'`, granting one pharmacy's administrator authority over every other tenant on the platform. | Critical | **RESOLVED** | Removed the Admin fallback from `authController.controlHubLogin`; only a stored `SuperAdmin` may authenticate. Added the `SuperAdmin` role to the schema CHECK and seeded a dedicated platform operator. Covered by `auth.test.js`. |
| **DEF-007** | 2026-08-03 | Auth Engine | Staff login matched on username alone while usernames are only unique per tenant (`UNIQUE(tenant_id, username)`), so a username held by two pharmacies resolved to an arbitrary one. | High | **RESOLVED** | `authController.login` now accepts a `tenantId` and refuses an ambiguous username outright. Added a public `GET /api/tenants/directory` and a pharmacy picker on the login screen. Covered by `auth.test.js`. |
| **DEF-008** | 2026-08-03 | Prescription Engine | Verifying or dispensing a prescription belonging to another pharmacy returned `200 OK` with an empty body, reporting a verification that never happened. | High | **RESOLVED** | `verifyPrescription` and `dispensePrescription` now return 404 when the scoped UPDATE matches no row. Covered by `prescription.test.js`. |
| **DEF-009** | 2026-08-03 | Inventory Engine | `receiveStock` accepted any `productId`, so one pharmacy could book stock against another pharmacy's product; the batch FK only proved the product existed. | High | **RESOLVED** | Added a tenant ownership check before the transaction opens. Covered by `tenantIsolation.test.js`. |
| **DEF-010** | 2026-08-03 | Backend (all) | 31 `catch` blocks discarded the caught error and returned a bare 500, leaving failures undiagnosable in a running system. | Medium | **RESOLVED** | Added contextual `console.error` logging across the controllers, and enabled ESLint so the pattern cannot silently return. |
| **DEF-011** | 2026-08-03 | Build / Tooling | `npm run lint` was declared but ESLint was neither installed nor configured, so the script always failed and CI never linted. | Low | **RESOLVED** | Added `eslint.config.js`, installed ESLint, and added a lint step to the CI pipeline. |
| **DEF-012** | 2026-08-03 | Repository | `server/Docs/Elaboration/` held a stale duplicate of the schema and seed files that nothing loaded, and whose seed used malformed UUIDs (`t1000000-...`, where `t` is not a hex digit). | Low | **RESOLVED** | Deleted the duplicate. `config/db.js` loads the single copy under the repository-root `Docs/Elaboration/`. |
| **DEF-013** | 2026-08-03 | Repository | `server/src/middleware/authTenant.js` duplicated `middleware/auth.js` and was imported nowhere. | Low | **RESOLVED** | Deleted the dead module. |
| **DEF-014** | 2026-08-03 | CI Pipeline | The test job started with an empty database and relied on an un-awaited `initDb()` firing on module import, making the suite racy on a cold database. | Medium | **RESOLVED** | Added `npm run db:reset` (`scripts/resetDb.js`) and an explicit schema/seed step before the tests run. |
| **DEF-015** | 2026-08-03 | Frontend | `api/client.js` sent a hardcoded `X-Tenant-ID` header naming one pharmacy; the server never read it and takes the tenant from the signed token. | Low | **RESOLVED** | Removed the misleading header. |
| **DEF-016** | 2026-08-03 | Onboarding | Tenant registration created the pharmacy but no administrator, so an approved pharmacy had nobody able to sign in. The handler carried a `// Create admin user too ideally` comment. | High | **RESOLVED** | Registration creates the pharmacy and its first Admin in one transaction, with the owner choosing the password. Covered by `onboarding.test.js`. |
| **DEF-017** | 2026-08-03 | Auth Engine | Staff of a pharmacy that had registered but not been approved could sign in, making the ControlHub review step decorative. | High | **RESOLVED** | Login now refuses any tenant whose status is not `ACTIVE`. Covered by `onboarding.test.js`. |
| **DEF-018** | 2026-08-03 | Frontend | Two auth systems ran in parallel: routing used React context while the app layout read a Zustand store initialised at import time, so the store was stale after sign-in and logout cleared only one. | High | **RESOLVED** | Removed the duplicate store; the context is the single source of session state. |
| **DEF-019** | 2026-08-03 | Frontend | Saving branding swallowed the error and always alerted success. The ControlHub status change did the same, and the tenant list invented two placeholder pharmacies when the request failed. | Medium | **RESOLVED** | Both report the real outcome, and the tenant list shows an empty state instead of fabricated rows. |
| **DEF-020** | 2026-08-03 | Frontend | `theme_color` was saved but never read, so tenant branding had no effect anywhere in the UI. | Medium | **RESOLVED** | The saved colour drives `--tenant-primary` and a derived soft variant at runtime. |
| **DEF-021** | 2026-08-03 | API / CORS | A disallowed origin threw inside the CORS callback, so the preflight returned `500` and read as a broken server rather than a refused origin. | Medium | **RESOLVED** | The origin check now withholds CORS headers instead of throwing. |
| **DEF-022** | 2026-08-03 | Frontend | The API client used an absolute `http://localhost:5000` base URL, bypassing the Vite proxy that was already configured and forcing cross-origin requests in development. | Low | **RESOLVED** | The base URL is relative by default, with `VITE_API_URL` as an override. |
| **DEF-023** | 2026-08-03 | Reporting | `getExpiryAlerts` hardcoded a ninety day window, so the per-pharmacy alert setting could not affect it. | Low | **RESOLVED** | The query reads `expiry_alert_days` from the tenant. Covered by `tenantSettings.test.js`. |

## Known limitations

These are recorded rather than fixed, so the position is explicit.

| ID | Component | Limitation | Planned handling |
| :--- | :--- | :--- | :--- |
| **LIM-001** | Sales Engine | Checkout does not verify that the prescription supplied actually lists the drug being sold, only that one was supplied. | Match `prescription_items.product_id` against the cart during Transition. |
| **LIM-002** | Inventory Engine | `dispenseStock` records a movement even when the scoped batch update matches nothing, so a bad `batchId` logs a phantom movement. | Apply the DEF-008 pattern to the inventory routes. |
| **LIM-003** | Sales Engine | Stock is not checked against `quantity_on_hand` at checkout, so a sale may drive a batch to zero via `GREATEST(0, ...)` without warning the cashier. | Add an insufficient-stock guard alongside the expiry guard. |
| **LIM-004** | Controllers | Several controllers fall back to mock responses when PostgreSQL is unreachable, which can mask an outage during a demo. | Restrict the fallback to an explicit demo flag. |
