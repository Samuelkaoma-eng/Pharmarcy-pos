# Fully-Dressed Use Cases, Iteration 2 — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Unified Process, Elaboration iteration 2. Fully-dressed format after Larman,
*Applying UML and Patterns*, 3rd edition. Continues `UseCases-FullyDressed.md`,
which covers UC-01 to UC-05.

The five cases in iteration 1 were the architecturally significant ones: they
established the transaction boundary, tenant isolation, privilege separation and
the guard pattern. The six here are the ones that fill out the pharmacy's
working day. They are written after the software, against the software, so where
a step is not implemented as described the use case says so under **Open
Issues** rather than describing an intention as a fact.

Referenced tests live in `server/src/__tests__/`.

---

## UC-06 · Create Prescription

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Doctor, or Pharmacist recording a paper prescription |
| **Frequency** | Medium — several a day |

### Stakeholders and Interests

- **Doctor** — wants what they prescribed recorded exactly, including the dose instructions.
- **Patient** — wants to collect the right medicine at the right strength, and not to be turned away because a record is missing.
- **Pharmacist** — wants a prescription they can check against the person in front of them before dispensing.
- **Cashier** — wants a prescription-only sale to be possible when a valid prescription exists, and impossible when it does not.
- **ZAMRA** — requires prescription-only medicines dispensed against a lawful prescription, and the record retained.

### Preconditions

The author is signed in as a Doctor, Pharmacist or Admin. The patient exists in
this pharmacy's records. The products prescribed are in this pharmacy's
catalogue.

### Success Guarantee

A prescription exists in `PENDING` status, listing each medicine with its
quantity and dose instructions, attached to the patient and — where it arose
from one — to the visit.

### Main Success Scenario

1. The author opens the prescriptions screen and starts a new prescription.
2. The author identifies the patient.
3. The author names the prescriber, and the visit where the prescription arose from one.
4. The author adds a medicine, the quantity, and the dose instructions.
5. Steps 4 repeats for each medicine.
6. The author sets a validity date and any notes.
7. The author saves.
8. The system records the prescription and its items in one transaction, in `PENDING`.
9. The prescription appears in the pharmacist's queue for verification (UC-07).

### Extensions

**2a. Patient is not on record.**
&nbsp;&nbsp;1. The author registers the patient first, then returns.

**3a. The prescriber does not work at this pharmacy.**
&nbsp;&nbsp;1. The prescriber may be left unnamed. A `Prescriber` is modelled separately from `Staff` precisely because a prescription can arrive from a clinic with no account here.

**8a. A line fails to save.**
&nbsp;&nbsp;1. The whole prescription rolls back. A prescription missing one of its medicines is worse than no prescription, because the pharmacist would have no reason to suspect a line was lost.

**1a. A cashier attempts to write a prescription.**
&nbsp;&nbsp;1. The system refuses. Creation is restricted to `Admin`, `Pharmacist` and `Doctor`. *(`prescription.test.js`)*

**6a. No validity date is given.**
&nbsp;&nbsp;1. The prescription is recorded without one and does not expire. *This is a gap — see Open Issues.*

### Special Requirements

- The prescription and all its items are written in one transaction.
- A prescription is only ever created in `PENDING`. Nothing may create one already verified, because verification is a pharmacist's judgement and not a data entry step.

### Open Issues

- **`valid_until` is recorded but never enforced.** The schema has a status value of `EXPIRED` and nothing sets it, and checkout does not compare the date. A prescription written a year ago will still satisfy the checkout guard. This should be checked in `createSale` alongside the other guards.
- **`createPrescription` falls back to a mock response when PostgreSQL is unreachable** (LIM-003), returning `prescription_id: 'pr-new'` and reporting success. In this use case that fallback is worse than elsewhere: it tells a doctor a prescription was recorded when nothing was written.

---

## UC-07 · Verify Prescription

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Pharmacist |
| **Frequency** | Medium — once per prescription |

### Stakeholders and Interests

- **Pharmacist** — wants to record that they personally checked the prescription, and to be identifiable as the person who did.
- **Patient** — wants a professional to have looked at what they are being given.
- **Pharmacy owner** — wants an audit trail naming who verified what.
- **ZAMRA** — requires a pharmacist's involvement in dispensing prescription-only medicines.

### Preconditions

The pharmacist is signed in. A prescription exists in this pharmacy in `PENDING`.

### Success Guarantee

The prescription is `VERIFIED` and carries the identity of the pharmacist who
verified it.

### Main Success Scenario

1. The pharmacist opens the prescription queue.
2. The system lists prescriptions with patient, status and date.
3. The pharmacist opens one and reads its items, quantities and dose instructions.
4. The pharmacist verifies it.
5. The system sets the status to `VERIFIED` and records the verifying pharmacist.
6. The prescription can now be dispensed against at the till.

### Extensions

**4a. The prescription belongs to another pharmacy, or does not exist.**
&nbsp;&nbsp;1. The system returns "prescription not found" and changes nothing. *(`prescription.test.js`)*
&nbsp;&nbsp;*This extension exists because of DEF-008: the scoped `UPDATE` matched no row and the handler returned `200 OK` with an empty body, reporting a verification that had never happened. A pharmacist reading that screen would have believed a prescription belonging to a different pharmacy had been checked.*

**4b. The pharmacist judges the prescription unsafe or unclear.**
&nbsp;&nbsp;1. They contact the prescriber and leave it `PENDING`.
&nbsp;&nbsp;*There is no `REJECTED` status for a prescription — see Open Issues.*

### Special Requirements

- Verification is restricted to `Admin` and `Pharmacist`. A cashier may dispense against a verified prescription but may not verify one.
- A refusal must be reported as a refusal. Returning success on a no-op update is the failure mode this use case is most exposed to.

### Open Issues

- **Verification is not required before dispensing.** The checkout guard in UC-01 requires that a `prescriptionId` be supplied; it does not require the prescription to be `VERIFIED`. A `PENDING` prescription satisfies the guard. Requiring `VERIFIED` at checkout is a one-line change to the guard and is the natural companion to LIM-001.
- **A pharmacist cannot record a refusal.** The status set permits `PENDING`, `VERIFIED`, `DISPENSED` and `EXPIRED`. A prescription the pharmacist declines to fill simply stays pending and is indistinguishable from one nobody has looked at yet.

---

## UC-08 · Manage Staff and Roles

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Pharmacy Administrator |
| **Frequency** | Low — on hiring, on leaving, on a change of duties |

### Stakeholders and Interests

- **Administrator** — wants to add and remove staff without going through the platform operator.
- **Pharmacy owner** — wants a departing employee's access to end the day they leave.
- **Staff member** — wants only the access their job needs, so a mistaken action is not available to them in the first place.
- **Platform operator** — wants a pharmacy administrator to have authority inside their own pharmacy and nowhere else.

### Preconditions

The actor is signed in as `Admin` of an active pharmacy.

### Success Guarantee

A staff account exists with a role, a bcrypt-hashed password and an active flag,
belonging to this pharmacy and no other.

### Main Success Scenario

1. The administrator opens the staff screen.
2. The system lists the pharmacy's staff with name, username, role and whether the account is active.
3. The administrator adds a member: full name, username, password, role.
4. The system checks the role is one an administrator may assign.
5. The system checks the password is at least eight characters.
6. The system hashes the password and creates the account.
7. The new member can sign in and reaches only what their role allows.

### Extensions

**3a. Username already exists in this pharmacy.**
&nbsp;&nbsp;1. The system reports the clash. Usernames are unique per pharmacy, so the same username in another pharmacy is not a clash. *(`usersAndDocuments.test.js`)*

**4a. The administrator attempts to assign `SuperAdmin`.**
&nbsp;&nbsp;1. The system refuses. The assignable set is `Admin`, `Pharmacist`, `Doctor`, `Cashier`. *(`usersAndDocuments.test.js`)*
&nbsp;&nbsp;*Platform authority is never granted from inside a pharmacy. This is the same rule as UC-02 extension 4a approached from the other direction: there is no path from tenant to platform, neither by sign-in nor by role assignment.*

**\*a. The administrator deactivates or demotes themselves.**
&nbsp;&nbsp;1. The system refuses, because a pharmacy left with no administrator has nobody able to appoint one. *(`usersAndDocuments.test.js`)*

**\*b. The target is a member of another pharmacy.**
&nbsp;&nbsp;1. The system returns "staff member not found", and a staff list never contains anyone from another pharmacy. *(`usersAndDocuments.test.js`)*

### Special Requirements

- Passwords are stored as bcrypt hashes at cost 10 and never returned. Every query selecting users uses an explicit column list that omits `password_hash`.
- Any signed-in member may list staff, so the app can show who recorded what. Creating and changing accounts is `Admin` only.
- A member may change their own profile picture without being an administrator.

### Open Issues

- **Deactivating an account does not invalidate a token already issued.** Tokens are self-contained and valid for an hour, so a dismissed employee retains access for up to sixty minutes. This is an accepted consequence of AD-5 in the architecture document, recorded rather than hidden. For a pharmacy dismissing someone for cause it is not acceptable, and the mitigation is a revocation list.

---

## UC-09 · Manage Product Catalogue

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Pharmacist or Administrator |
| **Frequency** | Medium — when a new line is stocked, and when prices change |

### Stakeholders and Interests

- **Pharmacist** — wants a catalogue entry that carries the clinical facts: strength, unit, whether it is prescription-only.
- **Cashier** — wants to find a product by barcode or name without asking anyone.
- **Pharmacy owner** — wants the selling price to be the price actually charged.
- **ZRA** — wants each product taxed according to its own treatment.
- **ZAMRA** — requires prescription-only medicines flagged as such.

### Preconditions

The actor is signed in as `Admin` or `Pharmacist`.

### Success Guarantee

A product exists in this pharmacy's catalogue with a price, a unit, a
prescription flag and a VAT treatment, and is immediately sellable.

### Main Success Scenario

1. The actor opens the inventory screen.
2. The system lists products with stock on hand, price and category.
3. The actor adds a product: name, barcode, dosage, category, cost and selling price, unit of measure, and whether it requires a prescription.
4. The system creates it.
5. The product is available at the till and to the expiry and low-stock reports.

### Extensions

**3a. The actor wants reference data from a drug directory.**
&nbsp;&nbsp;1. The system can search the openFDA NDC directory by name and return generic name, manufacturer and NDC code.
&nbsp;&nbsp;2. *The endpoint exists and is tested; no screen calls it, so this extension is not reachable by a user today.*
&nbsp;&nbsp;3. openFDA describes products registered in the United States, so anything returned still needs a pharmacist's check against the ZAMRA register (LIM-007).

**3b. The product is a sundry rather than a medicine.**
&nbsp;&nbsp;1. It must be marked `STANDARD` for VAT, so 16% is charged.
&nbsp;&nbsp;2. *Not reachable — see Open Issues.*

**\*a. A price changes.**
&nbsp;&nbsp;1. Updating the catalogue price does not alter any recorded sale. `SaleItem.unitPrice` holds what was charged at the time, which is why it is stored rather than derived.

**\*b. A line is withdrawn.**
&nbsp;&nbsp;1. The product is set `DISCONTINUED` rather than deleted, so historical sales keep pointing at a real product.

### Special Requirements

- Products are scoped to the pharmacy. A product of another pharmacy is invisible and unsellable, enforced at checkout by the ownership guard *(`tenantIsolation.test.js`)*.
- `requires_prescription` is the flag the checkout prescription guard reads. Getting it wrong on a controlled medicine defeats the guard entirely, so it is set at creation and is not derived from category.

### Open Issues

- **`vat_treatment` cannot be set through the API.** `createProduct` does not accept the field, so every product created through the running system takes the `ZERO_RATED` default. A sundry added by a pharmacy is therefore sold tax-free, and the only standard-rated products in existence are the seeded ones. This undercuts DEF-029: the per-product VAT machinery is correct and the means of using it is missing. Recorded as an open defect.
- **`updateProduct` overwrites rather than merges.** It sets `name`, `selling_price` and `state` unconditionally, so a request supplying only a price will attempt to null the name. `COALESCE` is used correctly in `updateUser` and should be used here. Recorded as an open defect.
- **Stock on hand is computed from the movement ledger**, summing `stock_movements.quantity` per product, while the expiry and checkout paths read `product_batches.quantity_on_hand`. The two agree only while every movement is matched by a batch update. They are two answers to the same question and should have one source.

---

## UC-10 · Apply Insurance Cover to a Sale

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | Subfunction of UC-01, dressed separately because the enrolment half is a user goal of its own |
| **Primary Actor** | Cashier at the till; Administrator when enrolling |
| **Frequency** | Medium |

### Stakeholders and Interests

- **Patient** — wants to pay only their own share and not to be asked for the full amount.
- **Insurance scheme** — wants to be billed its agreed percentage and no more, against a member number it can match.
- **Pharmacy owner** — wants the covered portion recorded so it can be claimed.
- **Cashier** — wants the split calculated rather than worked out at the counter.

### Preconditions

The pharmacy has recorded the scheme and its cover percentage. The patient is
enrolled with a member number.

### Success Guarantee

The sale records which scheme covered it, how much the scheme covers, and how
much the patient owes. The total is unchanged by the presence of cover; only its
apportionment changes.

### Main Success Scenario — enrolment

1. The administrator records a scheme: name, cover percent, contact.
2. The administrator enrols a patient on it with their member number and, where it applies, a validity date.
3. The system checks that both the scheme and the patient belong to this pharmacy before linking them.
4. The membership is recorded.

### Main Success Scenario — at the till

1. The cashier identifies the patient on a sale.
2. The system resolves the patient's active cover.
3. The system computes the total as usual, including VAT per product.
4. The system sets the scheme's share to the total × the cover percent, and the patient's balance to the remainder.
5. Both figures are recorded on the sale and shown on the receipt.

### Extensions

**2a. Patient has no membership.**
&nbsp;&nbsp;1. Scheme share is zero and the patient pays the whole amount. *(`complianceAndTrade.test.js`)*

**2b. Membership has lapsed, or the membership or the scheme is inactive.**
&nbsp;&nbsp;1. Treated as no cover. Expiry is compared against the current date, so a membership does not have to be deactivated by hand to stop applying.

**3a. The patient holds more than one membership.**
&nbsp;&nbsp;1. The system takes the first it finds. *This is arbitrary — see Open Issues.*

**\*a. Enrolling a patient already on that scheme.**
&nbsp;&nbsp;1. The existing membership is updated with the new member number and validity rather than duplicated, and reactivated if it had been deactivated.

**\*b. The scheme or the patient belongs to another pharmacy.**
&nbsp;&nbsp;1. The system refuses to link them, reporting neither was found.

### Special Requirements

- Cover percent is constrained to 0–100 by the database as well as the controller.
- The split is stored on the sale rather than recomputed from the scheme, because the sale must keep saying what was agreed at the time even after the scheme's cover percentage changes.

### Open Issues

- **No screen exists.** The whole use case — schemes, enrolment, and coverage lookup — is reachable only through the API. A cashier cannot see that a patient is covered, and an administrator cannot enrol anyone. The split does apply automatically at checkout whenever a membership exists, so the seeded memberships work; nothing new can be created from the app.
- **Multiple memberships resolve arbitrarily.** The coverage query takes `LIMIT 1` with no ordering, so a patient on two schemes gets whichever the database returns first. It should either take the best cover or require the cashier to choose.
- **No payment is split.** One `Payment` row is written for the full total. The scheme's share and the patient's share are recorded on the sale but the money is recorded as though the patient paid all of it, so a cash drawer reconciled against payments would be over by the covered amount. This is the same accountability gap as LIM-004 seen from a different angle.

---

## UC-11 · Triage a Patient Visit

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Pharmacist or clinic staff |
| **Frequency** | Medium — where the pharmacy runs a consultation counter |

### Stakeholders and Interests

- **Patient** — wants to be seen in turn and not to have to repeat their complaint at each step.
- **Pharmacist** — wants the vitals recorded before the consultation, not remembered.
- **Doctor** — wants the queue to show who is waiting and why.
- **Pharmacy owner** — wants the consultation service to be as recorded as the retail side.

### Preconditions

The actor is signed in. The patient is on record.

### Success Guarantee

A visit exists for today with a queue number, a reason, and a status that
reflects where the patient has reached. Vitals, where taken, are attached to the
visit and to the person who took them.

### Main Success Scenario

1. The patient arrives and the actor opens the triage queue.
2. The system shows today's visits in queue order with patient name and status.
3. The actor creates a visit for the patient with the reason for attending.
4. The system allocates the next queue number for today and records the visit as `WAITING`.
5. The actor records vitals against the visit: blood pressure, heart rate, temperature, oxygen saturation, weight.
6. The system stores them, stamped with the member of staff who took them.
7. The actor assigns a doctor, and the visit moves to `IN_PROGRESS`.
8. The consultation may produce a prescription (UC-06), which references the visit.
9. The actor closes the visit as `COMPLETED`.

### Extensions

**4a. Two visits are created at the same moment.**
&nbsp;&nbsp;1. Queue numbering runs inside a transaction that reads the current maximum and inserts in the same transaction, so two arrivals cannot take the same number.

**5a. Vitals are recorded against a visit of another pharmacy.**
&nbsp;&nbsp;1. The system returns "visit not found" and records nothing. The visit is looked up under the tenant scope before the insert, so the check is real rather than incidental.

**7a. No doctor is available.**
&nbsp;&nbsp;1. The visit stays `WAITING` and keeps its place in the queue.

**\*a. The patient leaves before being seen.**
&nbsp;&nbsp;1. The visit is set `CANCELLED`, which keeps the fact that they attended.

### Special Requirements

- The queue is today's visits only. Yesterday's numbering does not carry forward, so the queue number is meaningful at the counter.
- Vitals are stored as text rather than numbers, because a blood pressure is written "120/80" and a clinician's shorthand is not reliably parseable. Nothing computes on them.

### Open Issues

- **`updateStatus` and `assignDoctor` do not check whether the scoped update matched a row.** Both return `200 OK` with `result.rows[0]`, which is `undefined` when the visit belongs to another pharmacy. This is exactly DEF-008 in a different controller, unfixed. Recorded as an open defect.
- **Both fall back to mock responses when PostgreSQL is unreachable** (LIM-003), reporting a status change that did not occur.

---

## Traceability

| Use Case | Implementation | Tests | Screen |
| :--- | :--- | :--- | :--- |
| UC-06 Create Prescription | `prescriptionController.createPrescription` | `prescription` | `Prescriptions.jsx` |
| UC-07 Verify Prescription | `prescriptionController.verifyPrescription` | `prescription` | `Prescriptions.jsx` |
| UC-08 Manage Staff and Roles | `userController` | `usersAndDocuments` | `Staff.jsx` |
| UC-09 Manage Product Catalogue | `productController` | `inventory`, `tenantIsolation` | `Inventory.jsx` |
| UC-10 Apply Insurance Cover | `insuranceController`, `saleController` | `complianceAndTrade` | `Insurance.jsx` (enrolment only) |
| UC-11 Triage Patient Visit | `triageController` | `triageWorkflow` | `TriageQueue.jsx` |

When this document was first written, triage had no test suite of its own and
insurance had no interface at all. Both facts were stated here rather than left
to be discovered, because a use case document that reads identically whether or
not the feature is reachable is not telling the reader anything.

The first has since been closed: `triageWorkflow.test.js` now holds 20 tests
covering reception, vitals, assignment, the consultation hand-off, the refusal
to skip a stage, tenant isolation, and the sale that closes the loop.

The second is only half closed, and the table above says so. Scheme
administration and patient enrolment have a screen; **applying cover to a basket
at the till does not.** `POSCheckout.jsx` makes no reference to insurance, so
the split-billing path proven by `complianceAndTrade` is reachable through the
API and not through the interface. That remains the honest gap in this use case,
and it is carried as usability risk U7 in the beta test report.

## Defects this document surfaced

Writing these six against the code found four faults that were not previously
recorded. Each was entered as **OPEN** in `DEFECT_LOG.md` when this document was
written, and each has since been fixed and is now **RESOLVED** there, under the
rule that a defect is not closed until the suite fails without the fix.

| Ref | Fault | Use case |
| :--- | :--- | :--- |
| DEF-034 | `createProduct` ignores `vat_treatment`, so every product created through the app is zero-rated | UC-09 |
| DEF-035 | `updateProduct` overwrites unsupplied fields with null instead of coalescing | UC-09 |
| DEF-036 | `triageController.updateStatus` and `assignDoctor` report success on an update that matched no row | UC-11 |
| DEF-037 | `valid_until` on a prescription is recorded but never enforced anywhere | UC-06 |

That the exercise of writing use cases against running code produces defects is
the argument for writing them that way. A use case document composed from
intentions would have described all four features as working.
