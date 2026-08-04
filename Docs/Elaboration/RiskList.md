# Risk List — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Unified Process. Updated at the end of Elaboration, revised again during
Construction. Supersedes the four-row risk table in `Docs/Inception/Group 16 Inception.docx`.

In the Unified Process the risk list is a living artefact, re-ranked at every
iteration boundary. The point of Elaboration is to attack the highest-exposure
risks first and force them down; the point of updating the list is to show what
that attack actually cost and what it uncovered.

**Exposure** = probability × impact, each scored 1–5. A risk is **retired** when
evidence exists that it can no longer occur — for technical risks, an automated
test that fails without the mitigation.

---

## 1. Inception risks, re-scored

The Inception list named four risks. All four were real. Two were understated,
one was retired quickly, and one turned out to be the wrong shape.

| ID | Risk as stated at Inception | Type | Then | Now | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R-01** | Incorrect architecture choice | Technical | 3×4 = 12 | 1×4 = 4 | **Retired** |
| **R-02** | Database design flaws | Technical | 3×4 = 12 | 2×5 = 10 | **Reduced, not retired** |
| **R-03** | Time mismanagement | Schedule | 4×3 = 12 | 3×3 = 9 | **Active** |
| **R-04** | Data inconsistency | Technical | 3×5 = 15 | 1×5 = 5 | **Retired** |

### R-01 · Incorrect architecture choice — retired

*Inception mitigation: "validate layered architecture early."*

That is what happened. The layered structure was stood up in Elaboration and has
not needed to change shape since; the decisions and their rejected alternatives
are recorded in `ArchitectureProofOfConcept.md`. What did change was the
*scope* of the architecture: the system became multi-tenant with a separate
platform administration surface, which the Inception architecture had no concept
of. The layering absorbed that without restructuring, which is the evidence the
choice was sound.

Residual impact stays at 4 because an architecture is expensive to be wrong
about at any point; probability is now 1.

### R-02 · Database design flaws — reduced, not retired

*Inception mitigation: "refine domain model in elaboration."*

This was the most productive risk on the list, and it is the one still open.
Refining the domain model found four real design faults, each of which would
have been expensive later:

- `prescription_items` referenced `products` where it should have referenced `prescriptions` (DEF-001).
- Expiry sat on the product rather than the batch, which makes first-expired-first-out inexpressible — see `DomainModel.md`.
- Stock was a single count with no ledger, so a recall could not be traced.
- `payment_type` accepted `'insurance'` with no scheme, membership or split behind it (DEF-032).

All four are fixed. The risk is not retired because impact is 5 and one
structural weakness stands: **tenant isolation is enforced by every query being
written with a `tenant_id` scope, not by the database.** Nothing stops a new
query omitting it. The fix is PostgreSQL row-level security. Until then this
risk stays open at exposure 10, and it is the highest remaining technical
exposure in the project.

### R-03 · Time mismanagement — active

*Inception mitigation: "follow iteration plan strictly."*

The plan set Elaboration for weeks 3–8 and Construction for 9–12. In practice a
large part of the Elaboration documentation was written after the software it
describes, during Construction. That is an honest deviation and it had a real
cost: the domain model faults in R-02 were found by writing documents against
running code, months after the code that embodied them was written. Finding them
in Elaboration, as the plan intended, would have been cheaper.

Probability drops to 3 because the remaining work is documentation with a known
scope rather than software with an unknown one. Impact stays at 3.

### R-04 · Data inconsistency — retired

*Inception mitigation: "implement SQL transactions and layered architecture early in elaboration."*

Delivered exactly as stated. Every multi-write operation runs in one
transaction: `createSale`, `receiveAgainstOrder`, `decide`, and tenant
registration. `expiryGuard.test.js` demonstrates the property that matters — a
sale refused by a guard leaves no sale row, no stock movement and no change to
stock on hand. Contended decisions additionally take a `FOR UPDATE` row lock.

Probability 1, impact 5, retired.

---

## 2. Risks Elaboration and Construction discovered

The Inception list contained no security risk, no regulatory risk and no patient
safety risk. Those turned out to be the three highest-exposure categories in the
project. This is itself worth recording: a four-row risk list written before
the domain was understood will name the risks a student team expects, not the
risks the domain has.

| ID | Risk | Type | Exposure when found | Now | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R-05** | Dispensing expired medication | Safety / regulatory | 4×5 = 20 | 1×5 = 5 | **Retired** |
| **R-06** | Privilege escalation across tenants | Security | 3×5 = 15 | 1×5 = 5 | **Retired** |
| **R-07** | Claiming a safety check that did not run | Safety | 5×5 = 25 | 1×5 = 5 | **Retired** |
| **R-08** | Charging tax the law does not levy | Regulatory / financial | 5×4 = 20 | 1×4 = 4 | **Retired** |
| **R-09** | Issuing an invalid tax document | Regulatory | 3×5 = 15 | 1×5 = 5 | **Retired by scope** |
| **R-10** | Cross-tenant data disclosure | Security | 3×5 = 15 | 2×5 = 10 | **Active** |
| **R-11** | Stock records that cannot be reconciled to cash | Business | 4×4 = 16 | 4×4 = 16 | **Active — highest open** |
| **R-12** | Untraceable stock in a recall | Regulatory | 4×4 = 16 | 1×4 = 4 | **Retired** |
| **R-13** | The system reporting success it did not have | Quality / trust | 4×3 = 12 | 2×3 = 6 | **Reduced** |
| **R-14** | A demo that appears to work while the database is down | Project / trust | 3×4 = 12 | 3×4 = 12 | **Active** |
| **R-15** | Defects recorded as fixed that were not | Process | 4×4 = 16 | 1×4 = 4 | **Retired** |
| **R-16** | Single-maintainer knowledge concentration | Resource | 3×3 = 9 | 3×3 = 9 | **Active** |

### R-05 · Dispensing expired medication — retired

Checkout performed no expiry validation whatsoever (DEF-002), and the defect log
had recorded it as resolved (see R-15). A pharmacy POS that will sell expired
medicine is not a partially working POS; it is a hazard, and probability was 4
because the software offered no obstacle at all.

Mitigated by the expiry guard in `saleController.createSale`: a named batch must
be in date, and with no batch named the sale resolves first-expired-first-out and
refuses when everything tracked has lapsed. `expiryGuard.test.js` fails without
it.

### R-06 · Privilege escalation across tenants — retired

Any pharmacy `Admin` presenting their ordinary credentials at the ControlHub
login was issued a token carrying `role: 'SuperAdmin'` (DEF-006), giving one
pharmacy's administrator authority over every other pharmacy on the platform —
their patients, their stock, their sales, and the power to suspend them.

Mitigated by removing the fallback: only a stored `SuperAdmin` may authenticate
there, and ControlHub sign-in is a structurally separate operation from staff
sign-in (see contract CO-04). `auth.test.js` fails without it.

### R-07 · Claiming a safety check that did not run — retired, and the most severe

Drug interaction screening called an NLM endpoint the NLM retired on 2 January
2024. The endpoint returns 404, and the code treated 404 as "no interactions
found" (DEF-033).

Probability 5 because it happened on every single check — the screen never once
ran. Impact 5 because the output was a green result handed to a dispenser about
a basket nobody had examined. A safety feature that is merely absent is a gap; a
safety feature that reports success without running is worse than not having
one, because it displaces the manual check a pharmacist would otherwise make.

Mitigated by failing closed: with no source configured the system reports the
basket **could not be screened**, and never that it is clear. A licensed source
can be supplied via `INTERACTION_API_URL`.

The general rule this produced — *an unavailable check degrades to unknown, never
to fine* — is recorded as AD-7 in the architecture document, because it is a
posture the whole system has to hold, not a fix to one function.

### R-08 · Charging tax the law does not levy — retired

Every sale was charged 16% VAT, medicines included (DEF-029). Medicines and drugs
are zero-rated under Group 6 of the Zambian VAT (Zero-Rating) Order. Every
receipt overcharged the patient on every dispensed item, and the pharmacy would
have been remitting or pocketing tax it had no authority to collect.

Probability 5 — every sale. Mitigated by deciding VAT per product through
`products.vat_treatment`, defaulting to `ZERO_RATED`.
`complianceAndTrade.test.js` asserts that a basket mixing medicines with sundries
is taxed only on the sundries.

### R-09 · Issuing an invalid tax document — retired by scope

ZRA Smart Invoice has been mandatory for VAT-registered businesses since 1 July
2024, through a certified system. A POS that prints something *resembling* a
Smart Invoice puts an invalid tax document in a customer's hands.

This risk was retired by refusing the feature rather than building it. A
reference issued by an approved system elsewhere is recorded on
`sales.smart_invoice_ref` and printed when present; nothing is generated.

The teaching value of fiscalisation is preserved separately by SIMFIS, a
simulated fiscal device that is held safe by three deliberate constraints: a
name that is not ZRA-like, its own columns so a simulated value can never occupy
the genuine field, and every artefact visibly marked — including printing the
verification code as text rather than as a scannable square, because a code that
scans to nothing invites someone to treat it as real.

Recorded as LIM-005 rather than as a defect, because it is a scope decision and
not a fault.

### R-10 · Cross-tenant data disclosure — active

Distinct from R-06. R-06 was one path that granted the wrong role; R-10 is the
standing possibility that any single query forgets its `tenant_id` scope.

Two instances were found and fixed: `receiveStock` accepted any product ID, so
one pharmacy could book stock against another's product (DEF-009); and
prescription verification returned `200 OK` on another pharmacy's prescription,
reporting a verification that never happened (DEF-008).

`tenantIsolation.test.js` covers the paths it covers. It cannot cover the query
nobody has written yet. Probability 2, impact 5, and it stays open until row-level
security moves the guarantee from discipline to the database.

**Why it was deferred rather than done, and what doing it requires.** Row-level
security is the correct answer, but it is not a small change, and two properties
of this system would make a careless attempt worse than the present convention:

1. **The application connects as `postgres`, a superuser.** Superusers bypass RLS
   unconditionally — `FORCE ROW LEVEL SECURITY` does not apply to them. Enabling
   policies without first provisioning a non-superuser application role would
   produce a schema that looks protected, a suite that stays green, and no
   enforcement whatever. That is precisely the failure this project refuses
   elsewhere: a control that cannot run must not report itself as running.
2. **The pool would carry the tenant between requests.** `SET LOCAL` survives
   only inside a transaction, and the server issues roughly fifty one-shot
   `pool.query` calls against arbitrary pooled connections alongside fourteen
   `pool.connect` transactions. A connection returned to the pool holding a stale
   `app.tenant_id` is a silent cross-tenant read — invisible, where today's
   explicit `WHERE tenant_id = $1` is at least legible in the SQL.

The work is therefore: create an application role without `BYPASSRLS`; enable and
force RLS on the twenty tenant-scoped tables; set the tenant as a session variable
at connection checkout and clear it on release; and extend `tenantIsolation.test.js`
to assert that a query with the scope deliberately removed still returns nothing.
Scheduled after submission, on a branch, because it touches every read path in the
server and the present convention is tested and holding.

### R-11 · Stock records that cannot be reconciled to cash — active, highest open exposure

A sale belongs to a cashier but not to a shift. There is no till opened with a
float, no closing count, and therefore no way to discover that the drawer is
short. Every sale is individually auditable; the day as a whole is not.

This is the risk the Inception business case implicitly promised to address —
"reduce stock losses caused by manual errors and theft" — and it is the one the
system does not yet address. Theft at the till is exactly what a float and a
closing count exist to detect.

Probability 4 and impact 4, unchanged, because nothing has been built against
it. Mitigation is `TillSession`, described in `DomainModel.md` and recommended in
`UP_ALIGNMENT_AUDIT.md`. Recorded as LIM-004.

### R-12 · Untraceable stock in a recall — retired

Stock arrived with no record of its origin (DEF-031), so ZAMRA announcing a
recall on a batch would have left the pharmacy unable to say who supplied it.

Mitigated by suppliers, purchase orders and receiving against an order. Both the
batch and the stock movement carry `supplier_id`, asserted by
`complianceAndTrade.test.js`.

### R-13 · The system reporting success it did not have — reduced

Several screens alerted "saved successfully" regardless of outcome, the tenant
list invented two placeholder pharmacies when its request failed, and the
dashboard opened with fabricated figures that were never replaced (DEF-019,
DEF-025, DEF-027).

This is a trust risk rather than a correctness one, and it compounds: a user who
learns that one confirmation is unreliable stops believing all of them, including
the guards that are real.

Mitigated by a working rule now applied throughout: a figure renders as `—`
until the server answers, an empty list says it is empty, and every save reports
what actually happened. Reduced rather than retired because it is a discipline
across a growing UI, not a single mechanism, and there is no automated test that
can assert "this screen does not lie".

### R-14 · A demo that appears to work while the database is down — active

Several controllers fall back to mock responses when PostgreSQL is unreachable
(LIM-003). The intent was resilience during a demo. The effect is that an outage
presents as working software.

This is the same failure mode as R-07 in a different coat, and it contradicts
AD-7 in the architecture. It is unmitigated: exposure is unchanged at 12. The fix
is to put the fallback behind an explicit demo flag, off by default, so that an
outage looks like an outage. It should be closed before the final demo, since the
demo is precisely the occasion on which a hidden outage would matter most.

### R-15 · Defects recorded as fixed that were not — retired

`DEFECT_LOG.md` carried DEF-002 as RESOLVED while checkout performed no expiry
validation at all, and DEF-004 as RESOLVED describing a middleware that existed
but was imported nowhere.

This is a process risk and it is more dangerous than any single defect, because
it disables the instrument the team uses to know where it stands. Reviewing those
two false entries is what surfaced four further defects, including R-06.

Mitigated by a rule now stated at the top of the defect log and honoured
throughout: **a defect is not closed until an automated test fails without the
fix.** Every entry names its test.

### R-16 · Single-maintainer knowledge concentration — active

The security hardening, the guards, the platform surface and this documentation
set were produced by one contributor working on one branch. Five names are on the
Inception document. A project where one person holds the architecture is fragile
in exactly the way a pharmacy with one keyholder is.

Unmitigated at exposure 9. Partial mitigation is that the reasoning is written
down rather than held in someone's head — which is a large part of what this
documentation set is for — and that the test suite encodes the rules so a change
that breaks one is caught by someone who never knew why it was there. Neither
substitutes for a second person who has read the code.

---

## 3. Ranked list going into Transition

| Rank | ID | Risk | Exposure | Next action |
| :--- | :--- | :--- | :--- | :--- |
| 1 | R-11 | No till session, so cash cannot be reconciled | 16 | Build `TillSession`: float, attachment of every sale, closing count, recorded variance |
| 2 | R-14 | Mock fallbacks mask a database outage | 12 | Put the fallback behind an explicit demo flag, off by default |
| 3 | R-02 | Isolation enforced by convention, not the engine | 10 | PostgreSQL row-level security with tenant as a session variable |
| 3= | R-10 | Cross-tenant disclosure via an unscoped query | 10 | As R-02; extend `tenantIsolation.test.js` to each new route |
| 5 | R-03 | Documentation running behind the software | 9 | Remaining Transition deliverables are scoped and listed |
| 5= | R-16 | Knowledge concentrated in one contributor | 9 | Walkthrough of the guards and the platform surface with the group |
| 7 | R-13 | UI trust | 6 | Hold the rule on every new screen |

Two further items are carried as known limitations rather than risks, because
each is a stated gap with no uncertainty attached: checkout verifies that a
prescription was supplied but not that it lists the drug being sold (LIM-001),
and `dispenseStock` records a movement even when the scoped batch update matches
nothing (LIM-002).

---

## 4. What the risk list itself taught

Three observations worth carrying, since the Unified Process treats the risk
list as an instrument and not a formality.

**The risks that hurt were the ones the domain had, not the ones the team
expected.** Inception named architecture, database design, schedule and data
consistency — the risks of *building software*. The four highest-exposure risks
the project actually met were dispensing expired medicine, claiming a drug
screen that never ran, charging unlawful VAT, and escalating privilege across
tenants. None of them is a software-engineering risk. All of them are pharmacy
risks, and none could have been named without reading what Zambian pharmacy
regulation actually requires.

**Two of the worst risks were reporting risks, not functional ones.** R-07 and
R-13 are both the system claiming something it had not done. R-14 is the same
failure again. Software that does nothing is visibly broken and gets fixed;
software that falsely reports success is invisibly broken and gets trusted.

**A stale risk register is a risk.** R-15 is on this list because the defect log
lied, and the risk list would have lied in the same way had it not been rebuilt
against the code. This document is dated for that reason: it is accurate as of
3 August 2026 and against the commits on `construction/security-hardening-and-tests`,
and it should be re-scored again before the final demo.
