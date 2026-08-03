# UP Marking Guide Alignment Audit

Date: 2026-08-03
Project: Group 16 Pharmacy POS

## Direction Check

The project is moving in the right direction for the CSC4630 Unified Process marking guide. It already has visible Inception, Elaboration, Construction, and Transition evidence: use-case documents, domain/sequence models, PostgreSQL schema, a working React/Express POS, CI, automated backend tests, and a defect log.

The strongest alignment is currently Construction: prioritized POS workflows are implemented across checkout, inventory, prescriptions, patients, triage, receipts, tenant settings, ControlHub tenant management, and assistant-guided workflow support. The project also has CI and a defect log, which directly map to the 30-mark Construction section.

## Marking Guide Coverage

| UP area | Marking guide expectation | Current evidence | Status |
| --- | --- | --- | --- |
| Inception | Vision, high-level use cases, risks, iteration plan | Inception documents, high-level POS use cases, presentation slides | On track |
| Elaboration 1 | Detailed use cases, domain model, SSDs, architecture proof | Elaboration docs, domain model PDF, sequence diagram PDF, PostgreSQL schema, layered client/server structure | On track, but architecture proof should be documented more explicitly |
| Elaboration 2 | Remaining use cases, refined design classes, UI prototype, risk mitigation | Working UI prototype, schema, controllers, defect log | Needs a refined design class diagram and clearer risk update |
| Construction | Features, tests, CI, defect tracking | React frontend, Express backend, 50 Jest/Supertest cases across 7 suites, ESLint, GitHub Actions, `DEFECT_LOG.md` | Strong |
| Transition | Beta feedback, performance/security fixes, final docs, live demo | Health check, auth/rate limits, receipt print view, demo-ready workflows | Needs beta feedback and user manual |
| Demo/final | Live demo, final report, repo completeness | App routes and docs are present | Needs final UP reflection and demo script |

## Architectural Approach

The multi-tenant ControlHub structure, tenant-scoped authentication, onboarding
review flow, health endpoint, CORS allowlist, and branch activation workflow
together give the platform a clear separation between platform administration
and pharmacy operation.

The assistant follows a deliberately constrained contract: classify intent,
explain the proposed action, and require confirmation before any stock or sales
record can be changed. It never writes to the database directly.

## Construction Review, 3 August 2026

A review of the implementation against the defect log found that two entries did
not match the code. `DEF-002` was recorded as resolved but checkout performed no
expiry validation whatsoever, so expired medication could be sold. `DEF-004`
described a `authTenant.js` middleware that existed but was imported nowhere;
tenant scoping was in fact hand-written in each controller.

Reviewing those claims surfaced four further defects, the most serious being
that any pharmacy `Admin` could obtain a platform-wide `SuperAdmin` token from
the ControlHub login. All are now recorded in `DEFECT_LOG.md` with the automated
test that pins each fix, along with four known limitations left open and stated
rather than quietly carried.

The lesson recorded for the Transition phase: a defect is not closed until a
test fails without the fix.

## Highest-Value Next Work

1. Add a concise architecture proof document under `Docs/Elaboration/` showing the React client, Express API, PostgreSQL schema, tenant middleware, and CI boundary.
2. Add a refined design class diagram for `Sale`, `SaleItem`, `Payment`, `Product`, `ProductBatch`, `Prescription`, `Customer`, `Visit`, `Tenant`, and `User`.
3. Close the four limitations in `DEFECT_LOG.md`, starting with matching prescription items against the cart at checkout (LIM-001) and the insufficient-stock guard (LIM-003).
4. Create a beta testing report with scenarios, tester feedback, defects found, and fixes applied.
5. Add a final demo script that walks through login, process sale, prescription guard, stock receipt, expiry alert, patient triage, and ControlHub onboarding.

Item 3 of the previous revision, expanding backend tests into onboarding,
inventory, prescription verification, and tenant isolation, is complete: the
suite now stands at 50 cases across 7 files.
