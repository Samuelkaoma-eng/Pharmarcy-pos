# Beta Test Report — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Unified Process, Transition phase.
Report date: **4 August 2026**

---

## 1. Statement of what this report is

**No external beta testing has taken place.** No pharmacist, cashier, pharmacy
owner or other outside user has used this system. There have been no beta
sessions, no recruited participants, no questionnaires returned and no
satisfaction scores.

This is stated first, and plainly, because a beta test report is the easiest
document in a student project to fabricate and the easiest for a marker to
disprove. Inventing five testers and a table of five-point Likert scores would
have taken twenty minutes. It would also have been a lie, and the whole
engineering argument of this project — that the system refuses to invent a drug
interaction result, a fiscal reference or a queue of patients — would be
worthless if the report describing it invented its own users.

What this document therefore contains is:

| Section | Status |
| :--- | :--- |
| §2 Beta test plan | **A plan. Not yet executed.** Written to be run, not run. |
| §3 Automated verification | **Real.** 241 server tests and 8 client tests, executed 4 August 2026, output quoted. |
| §4 Developer walkthroughs | **Real.** Performed against a running system on the dates given. |
| §5 Defects found by testing | **Real.** Traced to `DEFECT_LOG.md` entries. |
| §6 Usability risks | **Assessed, not observed.** Reasoned from the interface, not from users. |
| §7 Threats to validity | The honest limits of everything above. |

Sections 2 and 6 are the ones a reader should discount. They are judgement, not
evidence.

---

## 2. Beta test plan (written, not executed)

Recorded so the work is ready to run, and so §6 has something to be measured
against.

### 2.1 Objectives

1. Can a cashier who has never seen the system complete a sale without help?
2. Are the safety refusals — prescription required, expired batch, insufficient stock — understood as *the system protecting the patient*, rather than as faults?
3. Can a pharmacist reconcile a till at the end of a shift and explain a variance?
4. Does the language fit Zambian pharmacy practice (TPIN, ZAMRA, NRC, kwacha, "dispense" vs "sell")?

### 2.2 Participants sought

| Role | Number | Why |
| :--- | :--- | :--- |
| Counter cashier | 3 | The highest-volume user; the till is where errors are expensive |
| Dispensing pharmacist | 2 | The only role that can judge whether the clinical guards are correct |
| Pharmacy owner or manager | 1 | Judges the till reconciliation and stock reports |
| Someone with no pharmacy experience | 1 | Separates "hard because pharmacy is hard" from "hard because the software is" |

### 2.3 Method

Moderated task-based sessions, roughly 45 minutes, one participant at a time,
on a seeded database, thinking aloud. The moderator does not help until the
participant has been stuck for 60 seconds, and records the time and the point
of confusion.

### 2.4 Tasks

| # | Task | Success measure |
| :--- | :--- | :--- |
| T1 | Sign in and process a two-item cash sale | Completed unaided in under 3 minutes |
| T2 | Sell a prescription-only medicine with no prescription | Participant explains *why* it was refused |
| T3 | Sell against a prescription that lists a different drug | Refusal understood as correct |
| T4 | Sell from a batch that expired last month | Refusal understood as correct |
| T5 | Open a till with a K200 float, take three sales, count down K20 short | Variance found and explained |
| T6 | Receive a delivery against a purchase order, with batch and expiry | Completed unaided |
| T7 | Register a walk-in, take vitals, move them through to the counter | Completed unaided |
| T8 | Find yesterday's receipt and reprint it | Completed in under 60 seconds |

### 2.5 Measures

Task completion rate; time on task; assists required; errors; a System
Usability Scale questionnaire; and free-text comments. **None of these has been
collected.**

---

## 3. Automated verification — real, and reproducible

This is the evidence that does exist. It was produced by running:

```bash
npm --prefix server test
```

Result on 4 August 2026:

```
Test Suites: 20 passed, 20 total
Tests:       241 passed, 241 total
Snapshots:   0 total
Time:        34.079 s
Ran all test suites.
```

### 3.1 Coverage by suite

| Suite | Tests | What it holds the system to |
| :--- | ---: | :--- |
| `complianceAndTrade.test.js` | 28 | VAT treatment per product, insurance cover split, supplier and purchase-order trade |
| `triageWorkflow.test.js` | 20 | Visit state machine, role gating per station, no skipping or reopening |
| `catalogueAndGuards.test.js` | 19 | Prescription-item matching, over-quantity refusal, stock figures never negative |
| `tillSession.test.js` | **15** | Float, drawer reconciliation, cash-only rule, variance, shift binding |
| `usersAndDocuments.test.js` | 15 | Staff roles, document upload, review, onboarding readiness |
| `reporting.test.js` | 12 | VAT summary, trading summary, stock valuation, dispensing register |
| `onboarding.test.js` | 14 | Pharmacy registration and the status gate on sign-in |
| `refreshRotation.test.js` | 11 | Token rotation, replay detection, family revocation |
| `prescription.test.js` | 11 | Verification, lapse, dispense transitions |
| `auth.test.js` | 14 | Ambiguous usernames, bad credentials, inactive pharmacy |
| `patientRecall.test.js` | 10 | Recall list, simulated reminders, refusal with no phone number |
| `makerChecker.test.js` | 12 | Self-approval refused, row lock, no double-apply |
| `tenantSettings.test.js` | 10 | Platform-owned settings, pharmacy-owned branding |
| `auditTrail.test.js` | 9 | Before and after values on price, VAT, stock, prescription, till and role changes |
| `expiryGuard.test.js` | 8 | Expired batch, all-batches-expired, insufficient stock, full rollback |
| `fiscalSimulation.test.js` | 8 | SIMFIS marking, and that `smart_invoice_ref` stays null |
| `clinicalInsight.test.js` | 7 | Refusal to generalise under 5 records, fail-closed with no provider |
| `sale.test.js` | 7 | Pricing from the database, receipt, prescription requirement |
| `inventory.test.js` | 6 | Receive, dispense, adjust, movement records |
| `tenantIsolation.test.js` | 5 | One pharmacy cannot read or sell another's stock |
| **Total** | **241** | |

### 3.2 The discipline these were written under

A test that passes both with and without the fix proves nothing. Every
guard-related defect in this project was verified by removing the fix and
confirming the test fails.

Most recently, for till sessions: with the cash-only filter removed and the
`require_till_session` guard disabled, **8 of the 15 till tests failed**. They
were restored and all 15 pass. The same technique previously proved 16 of 18
cases for the Elaboration defect set.

### 3.3 What the automated suite cannot tell us

It is server-side and API-level. It proves the system **refuses** the right
things. It says nothing about whether a cashier under pressure at a counter
**understands** the refusal, finds the button, or trusts the number on the
screen. That gap is exactly what §2 was written to close, and it remains open.

---

## 4. Developer walkthroughs — real, and dated

These were performed by the development team against a running server, browser
open, console watched. They are *developer verification*, not user testing: the
person driving wrote the code and knew where everything was. Their value is in
proving the software runs, not in proving it is usable.

### 4.1 Till session walkthrough — 4 August 2026

Driven through the browser against the live server and PostgreSQL.

| Step | Observed |
| :--- | :--- |
| Sign in as `cashier` (Central Care) | Signed in, role Cashier |
| Open till with a K200 float | Session opened, drawer shows K200 |
| Cash sale, 2 × Paracetamol 500mg | K50.00, VAT K0.00 (zero-rated, correct), bound to the session |
| Card sale, 4 × Paracetamol 500mg | K100.00, bound to the session |
| Re-read the till | Sales 2 · Cash taken **K50** · All takings **K150** · Drawer should hold **K250** |
| Enter a count of K230 | Modal previewed "Short by K 20.00" before submitting |
| Close the till | Recorded expected **K250.00**, counted **K230.00**, variance **K −20.00**, status CLOSED |

The card sale raised total takings and left the cash figure untouched, which is
the property the control depends on. Browser console: no errors.

### 4.2 Sales history walkthrough — 4 August 2026

Performed because the page had just been repaired (DEF-043). The page rendered
65 real sales with real staff names and payment types, the empty state and the
error state both behave, and the console was clean.

### 4.3 Triage workflow walkthrough — 4 August 2026

Performed after the queue screen was rebuilt (DEF-045), signed in as
`pharmacist`, driven through the browser.

| Step | Observed |
| :--- | :--- |
| Register a walk-in against a registered patient | Created as queue #29, **WAITING** |
| Record vitals (BP 122/78, HR 70, 36.9°C, SpO₂ 98) | Saved, and the visit advanced to **TRIAGE** on its own |
| Re-read the queue | Card showed the real readings and "(2 readings)" — the old screen showed "Vitals Pending" here |
| Route to a clinician | Only Dr. Martin Phiri offered; the card noted *"Not listed: Dr. Sarah Banda — no account here"*. Visit moved to **IN_PROGRESS** |
| Write up the consultation, send to counter | Assessment stored, visit moved to **DISPENSING** ("At the counter") |

Every stage transition was made by the server as a consequence of the work, not
by setting a label. Browser console: no errors.

### 4.4 Earlier walkthroughs

Procurement (receive against order with batch and expiry), Insurance (scheme,
enrolment, cover lookup), ControlHub onboarding with document upload, and SIMFIS
fiscalisation from the receipt were each verified live when built, on 3 August
2026.

---

## 5. Defects found by testing

Testing on this project has found real defects, which is the strongest evidence
that it is doing something. A representative set, all traceable in
`DEFECT_LOG.md`:

| Found by | Defect | Severity |
| :--- | :--- | :--- |
| New automated test | **DEF-037** — prescription id accepted as proof in itself; unverified, lapsed and unrelated prescriptions all unlocked controlled sales | Critical |
| New automated test | **DEF-034** — `vat_treatment` unreachable from the API, so every product a pharmacy added was zero-rated whatever it was | High |
| New automated test | **DEF-036** — triage reported status changes that never happened | High |
| CI dependency audit, first run | **DEF-042** — Vite 5 path traversal and NTLMv2 hash disclosure on Windows | High |
| Developer walkthrough | **DEF-038** — Inventory page threw on `currency` and rendered blank; the build passed | Critical |
| Developer walkthrough | **DEF-043** — the same bug unfixed in Sales History; the build passed again | Critical |

**DEF-038 and DEF-043 are the finding that matters most for this report.** The
same class of defect — a crash invisible to the build, fatal in the browser —
occurred twice, in two different files, and both times only a human opening the
page caught it. Neither the automated suite nor a successful production build
detected either one.

That is a direct, evidenced argument for §2 rather than a hypothetical one. It
is also why the team's working rule is that a passing build is not a working
application until somebody has opened it.

---

## 6. Usability risks (assessed by inspection, not observed)

Reasoned from the interface. Each would be confirmed or dismissed by §2.

| # | Risk | Reasoning |
| :--- | :--- | :--- |
| U1 | Refusal messages read as system faults rather than as protections | They are phrased in capitals (`EXPIRED STOCK: …`) and appear where an error would. A cashier may report them as bugs. |
| U2 | The prescription field is easy to skip until checkout refuses | Nothing on the basket flags a prescription-only line before the refusal. |
| U3 | Till variance has no required explanation | A shortfall can be closed with an empty note, so the record may not say why. |
| U4 | The triage queue is one long list, not lanes per stage | Rebuilt and working, but a busy clinic with thirty visits scrolls. Stage counts are shown across the top; whether that is enough is exactly a §2 question. |
| U5 | Clinical insight and patient recall have no interface at all | Endpoints and tests exist; nothing calls them. A user cannot reach either. |
| U6 | SIMFIS marking may still be mistaken for a real fiscal receipt | Mitigated by the prefix, the notice, the hatched block and the QR content printed as text — but only observation of a real user would settle it. |
| U7 | ~~Insurance cover cannot be applied at the till~~ **Closed.** | The till now carries a patient selector, looks the cover up as soon as one is chosen, and shows the scheme, its rate and the split before payment is taken. A failed lookup says cover *could not be checked* rather than billing in full as though it had checked. Verified against a live deployment: a K50.00 basket for a patient on 80% cover records K40.00 to the scheme and K10.00 to the patient. |

U5 is recorded honestly as incomplete rather than presented as a design
decision.

---

## 7. Threats to validity

1. **No external users.** The central limitation. Everything about usability in this document is inference.
2. **The walkthroughs were run by the authors.** We knew where every control was and what every message meant. This is the weakest possible position from which to judge whether an interface is learnable.
3. **The interface is now tested, but only at component level.** `pagesRender.test.jsx` renders the real pages against a mocked API, and reintroducing DEF-038 makes it fail while the production build still passes — which is the gap it was written to close. There are still no end-to-end tests driving a real browser against a real server, so a defect in the wiring *between* the two would still not be caught.
4. **One database, one seed.** All testing used the same seeded dataset on one PostgreSQL instance on one Windows machine. No concurrency testing beyond the row locks asserted in `makerChecker.test.js` and `tillSession.test.js`; no load testing; no testing on the hardware or connectivity a Zambian pharmacy would actually have.
5. **The suite runs `--runInBand`.** Suites are serial, so genuine concurrent-use defects would not surface.
6. **Simulated subsystems are tested as simulations.** `fiscalSimulation.test.js` proves SIMFIS marks its output and never writes a real fiscal field. It proves nothing about a real ZRA integration, because there is not one.

---

## 8. Conclusion

The system is **verified but not validated**. There is strong, reproducible
evidence that it does what its developers intended — 241 automated tests, each
guard proven to fail without its fix, and defects found and closed with tests
that hold them closed. There is no evidence at all that it does what a
pharmacist needs, because no pharmacist has used it.

The single most valuable next activity on this project is not another feature.
It is §2, executed with one real cashier and one real pharmacist.
