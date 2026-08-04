# Fully-Dressed Use Cases — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Unified Process, Elaboration. Fully-dressed format after Larman, *Applying UML
and Patterns*, 3rd edition.

Each case below is implemented and covered by automated tests. Where a step
exists because a real defect was found, that is stated — the guards in UC-01
were not designed up front; they were written after the behaviour they prevent
was discovered in the running system.

Referenced tests live in `server/src/__tests__/`.

---

## UC-01 · Process Sale

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Cashier |
| **Frequency** | Very high — the most repeated action in the system |

### Stakeholders and Interests

- **Cashier** — wants to complete a sale quickly and accurately, with the system catching mistakes rather than relying on memory.
- **Patient** — wants correct medicine, a correct price, and a receipt.
- **Pharmacist** — wants prescription-only medicines never to leave the counter without a prescription, and expired stock never to be dispensed.
- **Pharmacy owner** — wants every sale recorded, stock reduced accurately, and takings reconcilable.
- **ZAMRA / regulator** — requires controlled medicines dispensed lawfully and expired stock withdrawn.
- **ZRA** — requires VAT charged correctly: medicines are zero-rated under Group 6 of the VAT (Zero-Rating) Order.
- **Insurance scheme** — wants to be billed only its agreed share.

### Preconditions

The cashier is signed in to an active pharmacy. The catalogue holds the products
being sold.

### Success Guarantee

A sale is recorded with its items, payment and stock movements. Stock on hand is
reduced. Tax is computed per product. Where cover applies, the bill is split
between scheme and patient. A receipt is available.

### Main Success Scenario

1. The cashier starts a new sale.
2. The cashier scans a barcode or selects a product.
3. The system adds the item and shows the running total.
4. Steps 2–3 repeat until the basket is complete.
5. The cashier optionally identifies the patient.
6. The system resolves any active insurance cover for that patient.
7. The cashier selects a payment method and completes the sale.
8. **The system validates the basket** — see the guards below, which run server-side inside one transaction.
9. The system prices the basket from catalogue prices, never from figures supplied by the client.
10. The system computes VAT per product: zero for medicines, standard rate for sundries.
11. The system splits the total between the scheme's share and the patient's balance.
12. The system records the sale, its items, the payment, and a stock movement per line.
13. The system reduces the quantity on hand of each batch drawn from.
14. The system marks any supplied prescription as dispensed.
15. The system issues a receipt number and presents the receipt.

### The guards at step 8

Each runs inside the transaction, so a rejection leaves no partial record.

| Guard | Rule |
| :--- | :--- |
| **Ownership** | The product must belong to the signed-in pharmacy. |
| **Prescription** | A product flagged `requires_prescription` needs a prescription on the sale. |
| **Expiry** | A named batch must be in date. With none named, the sale resolves first-expired-first-out across in-date stock and is refused when every tracked batch has lapsed. |
| **Stock** | The quantity requested must not exceed what is held. |

### Extensions

**2a. Barcode not recognised.**
&nbsp;&nbsp;1. The system reports the barcode is unknown.
&nbsp;&nbsp;2. The cashier searches by name instead, or abandons the line.

**8a. Product belongs to another pharmacy.**
&nbsp;&nbsp;1. The system rejects the sale with "Product not found".
&nbsp;&nbsp;2. Nothing is recorded. *(`tenantIsolation.test.js`)*

**8b. Prescription-only medicine with no prescription.**
&nbsp;&nbsp;1. The system rejects the sale naming the medicine.
&nbsp;&nbsp;2. The cashier requests the prescription, which a pharmacist verifies (UC-04), and retries. *(`sale.test.js`)*

**8c. Named batch has expired.**
&nbsp;&nbsp;1. The system rejects the sale, naming the batch and its expiry date.
&nbsp;&nbsp;2. The batch is withdrawn from sale. *(`expiryGuard.test.js`)*

**8d. All tracked batches expired.**
&nbsp;&nbsp;1. With no batch named, the system finds nothing in date and refuses.
&nbsp;&nbsp;2. No sale record is written. *(`expiryGuard.test.js`)*

**8e. Insufficient stock.**
&nbsp;&nbsp;1. The system reports how many remain against how many were requested.
&nbsp;&nbsp;2. Quantity on hand is unchanged. *(`expiryGuard.test.js`)*
&nbsp;&nbsp;*This extension exists because stock previously went negative: the dashboard showed Amoxicillin at "-2 remaining".*

**6a. Patient has no active cover.**
&nbsp;&nbsp;1. The scheme share is zero and the patient pays the full amount. *(`complianceAndTrade.test.js`)*

**6b. Membership has expired.**
&nbsp;&nbsp;1. Treated as no cover. Expiry is checked against the current date.

**10a. Basket mixes medicines and sundries.**
&nbsp;&nbsp;1. VAT is charged only on the standard-rated lines. *(`complianceAndTrade.test.js`)*

**15a. A fiscal reference is supplied.**
&nbsp;&nbsp;1. The system records it against the sale and prints it (UC-05).

### Special Requirements

- Pricing and all guards are enforced server-side. A client-supplied price is never trusted.
- The whole operation is one database transaction; any rejection rolls back.
- A rejected sale must leave no sale row, no stock movement and no change to quantity on hand.
- Receipt numbers are unique per pharmacy.

### Technology and Data Variations

- Products may be added by barcode scan or on-screen selection.
- Payment may be cash, card, mobile money or insurance.
- A batch may be named explicitly or resolved first-expired-first-out.

### Open Issues

- Checkout confirms a prescription was supplied but not that it lists the drug being sold (LIM-002).
- Sales are not grouped into a till session, so there is no float, closing count or cash variance (LIM-004).

---

## UC-02 · Sign In

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Any staff member |
| **Frequency** | High — at least once per shift |

### Stakeholders and Interests

- **Staff member** — wants access to their own pharmacy's workspace.
- **Pharmacy owner** — wants only their own staff able to reach their data.
- **Platform operator** — wants a pharmacy that has not been approved unable to trade.

### Preconditions

The staff member has an account in a pharmacy on the platform.

### Success Guarantee

The staff member holds a signed token naming their user, role and pharmacy.
Every later request is scoped by it.

### Main Success Scenario

1. The staff member opens the sign-in screen.
2. The system lists the pharmacies available to sign in to.
3. The staff member selects their pharmacy and enters username and password.
4. The system finds the account within that pharmacy.
5. The system verifies the password against the stored hash.
6. The system confirms the pharmacy is `ACTIVE`.
7. The system issues a token carrying user, role and pharmacy.
8. The workspace opens, branded in the pharmacy's own colour and name.

### Extensions

**3a. No pharmacy named and the username is unique platform-wide.**
&nbsp;&nbsp;1. The system proceeds with the single match.

**3b. No pharmacy named and the username exists in several pharmacies.**
&nbsp;&nbsp;1. The system refuses and asks for the pharmacy. *(`auth.test.js`)*
&nbsp;&nbsp;*Usernames are unique only within a pharmacy. Resolving this by picking the first match was a real defect (DEF-007): two pharmacies each have an `admin`.*

**5a. Password does not match.**
&nbsp;&nbsp;1. The system reports invalid credentials without revealing which part was wrong.

**6a. Pharmacy is not yet approved.**
&nbsp;&nbsp;1. The system refuses, explaining sign-in opens once the application is approved. *(`onboarding.test.js`)*

**4a. Platform operator signing in at ControlHub.**
&nbsp;&nbsp;1. Only an account already holding `SuperAdmin` may authenticate there.
&nbsp;&nbsp;*A pharmacy `Admin` must never be promoted at this step. Doing so was a privilege escalation (DEF-006) giving one pharmacy's administrator authority over every tenant. (`auth.test.js`)*

### Special Requirements

- Passwords stored as bcrypt hashes, never reversibly.
- Sign-in is rate limited.
- The token is the only source of tenant identity; a client-supplied tenant header is not trusted.

---

## UC-03 · Review Onboarding Application

| | |
| :--- | :--- |
| **Scope** | ControlHub |
| **Level** | User goal |
| **Primary Actor** | Platform Operator |
| **Frequency** | Low — once per applying pharmacy |

### Stakeholders and Interests

- **Platform operator** — wants to admit only pharmacies lawfully entitled to trade.
- **Prospective owner** — wants a decision, and to know what is outstanding.
- **ZAMRA** — requires a licensed pharmacist, approved premises and a passed inspection.
- **Patients** — depend on the platform admitting only legitimate pharmacies.

### Preconditions

The operator is signed in to ControlHub. An application exists awaiting review.

### Success Guarantee

Every submitted document is verified or rejected, with the reviewer and time
recorded. The pharmacy is activated only when the full required set is verified.

### Main Success Scenario

1. The operator opens the onboarding queue.
2. The system lists pharmacies awaiting review.
3. The operator opens an application and its documents.
4. **The operator opens a document and reads it.**
5. The operator marks it verified, optionally with notes.
6. The system records the decision against the reviewer and the time.
7. Steps 4–6 repeat for each document.
8. The system reports the pharmacy ready once every required document is verified.
9. The operator activates the pharmacy (UC-04 in the high-level index).
10. Sign-in opens for that pharmacy's staff.

### Required documents

The set ZAMRA requires to license a retail pharmacy in Zambia:

| Type | Document |
| :--- | :--- |
| `PACRA_CERTIFICATE` | Certificate of incorporation or business registration |
| `TPIN_CERTIFICATE` | ZRA taxpayer identification |
| `PHARMACIST_PRACTISING` | HPCZ practising certificate of the pharmacist in charge |
| `PHARMACIST_ID` | Identification of the pharmacist in charge |
| `PREMISES_PROOF` | Title deed or lease agreement |
| `PREMISES_FLOOR_PLAN` | Layout of dispensary and storage |
| `ZAMRA_INSPECTION` | Pre-licensing inspection report |

### Extensions

**4a. No file was uploaded for a document.**
&nbsp;&nbsp;1. The system disables opening it and says so.
&nbsp;&nbsp;*Documents were originally metadata only, so paperwork was approved that nobody could open (DEF-030). Being able to read the document is the review.*

**5a. Document is unacceptable.**
&nbsp;&nbsp;1. The operator rejects it with notes.
&nbsp;&nbsp;2. The pharmacy cannot be activated while any document is rejected.

**8a. Required documents still outstanding.**
&nbsp;&nbsp;1. The system reports how many of the required set remain and keeps activation disabled. *(`complianceAndTrade.test.js`)*

**9a. Activation is routed for a second opinion.**
&nbsp;&nbsp;1. The operator raises an approval request instead (UC-04 below).

### Special Requirements

- Only PDF, JPEG, PNG and WebP are accepted, to a 10 MB limit.
- Stored files sit outside the source tree and are never served as static content.
- A stored path is confined to the upload directory; it is not a licence to read elsewhere on disk.
- Documents are reachable only by platform staff, never by pharmacy staff. *(`complianceAndTrade.test.js`)*

---

## UC-04 · Decide Approval Request

| | |
| :--- | :--- |
| **Scope** | ControlHub |
| **Level** | User goal |
| **Primary Actor** | Platform Operator (the checker) |
| **Frequency** | Low |

### Stakeholders and Interests

- **Platform operator** — wants sensitive changes to require a second pair of eyes.
- **Pharmacy** — wants not to be suspended on one person's say-so or one compromised account.
- **Auditor** — wants who proposed, who decided, and why, all on record.

### Preconditions

A request exists in `PENDING`, raised by a different operator.

### Success Guarantee

The request is approved or rejected, the decider and time recorded, and the
change applied only on approval.

### Main Success Scenario

1. The checker opens the approvals queue.
2. The system lists requests with what is proposed, why, and who raised each.
3. The checker opens a pending request raised by someone else.
4. The checker approves it.
5. The system confirms the request is still pending and the checker is not the requester.
6. The system applies the proposed change.
7. The system records the decision, the decider and the time.

### Extensions

**3a. The request was raised by the checker.**
&nbsp;&nbsp;1. The system shows "awaiting another administrator" instead of decision buttons.
&nbsp;&nbsp;2. An attempt made directly against the API is refused, and the change is not applied. *(`makerChecker.test.js`)*
&nbsp;&nbsp;*This is the entire purpose of the mechanism. It is enforced in the controller, by a database constraint, and asserted by a test that also checks the target was left untouched.*

**5a. The request was already decided.**
&nbsp;&nbsp;1. The system refuses, reporting the existing outcome, so an action cannot be applied twice.

**4a. The checker rejects instead.**
&nbsp;&nbsp;1. The request closes as rejected and no change is applied.

### Special Requirements

- The decision is taken under a row lock, so two checkers cannot both decide the same request and apply the change twice.
- Only actions the server knows how to carry out may be routed; anything else is refused when raised.
- A reason is mandatory, so the checker has grounds to judge.

---

## UC-05 · Receive Stock Against Purchase Order

| | |
| :--- | :--- |
| **Scope** | Pharmacy POS platform |
| **Level** | User goal |
| **Primary Actor** | Pharmacist |
| **Frequency** | Medium — per delivery |

### Stakeholders and Interests

- **Pharmacist** — wants stock booked in accurately with correct expiry dates.
- **Pharmacy owner** — wants deliveries reconcilable against what was ordered.
- **ZAMRA** — requires a recalled batch traceable to the supplier that provided it.

### Preconditions

A purchase order exists and is not cancelled. The delivery is present.

### Success Guarantee

Batches are created with expiry dates, stock movements record the receipt, both
carry the supplier, and the order's status reflects what remains outstanding.

### Main Success Scenario

1. The pharmacist opens the purchase order.
2. The system shows each line with quantity ordered and already received.
3. The pharmacist enters the quantity received, batch number and expiry date per line.
4. The system confirms the receipt does not exceed what is outstanding.
5. The system creates a batch per line, stamped with the supplier.
6. The system records a `RECEIVE` stock movement per line, stamped with the supplier and referencing the order.
7. The system increases quantity received on each line.
8. The system sets the order to `RECEIVED` when every line is satisfied, otherwise `PARTIALLY_RECEIVED`.

### Extensions

**4a. More received than outstanding.**
&nbsp;&nbsp;1. The system refuses, stating how many remain outstanding on that line. *(`complianceAndTrade.test.js`)*

**3a. Delivery is partial.**
&nbsp;&nbsp;1. The order becomes `PARTIALLY_RECEIVED` and the balance can be received later.

**1a. Order was cancelled.**
&nbsp;&nbsp;1. The system refuses to receive against it.

### Special Requirements

- The whole receipt is one transaction; a failure on any line rolls the delivery back.
- Both the batch and the movement carry `supplier_id`. *(`complianceAndTrade.test.js`)*
- A purchase order may only reference products belonging to the same pharmacy.

### Open Issues

- Landed costs (freight, duty) are not apportioned across received lines.

---

## Traceability

| Use Case | Implementation | Tests |
| :--- | :--- | :--- |
| UC-01 Process Sale | `saleController.createSale` | `sale`, `expiryGuard`, `complianceAndTrade` |
| UC-02 Sign In | `authController.login`, `controlHubLogin` | `auth`, `onboarding`, `tenantIsolation` |
| UC-03 Review Onboarding | `documentController`, `controlHubController` | `usersAndDocuments`, `complianceAndTrade` |
| UC-04 Decide Approval | `approvalController.decide` | `makerChecker` |
| UC-05 Receive Stock | `supplierController.receiveAgainstOrder` | `complianceAndTrade` |

**234 tests across 20 suites.** Every extension above marked with a test file is
asserted, not merely described.

---

## Continued in Iteration 2

The remaining six cases — Create Prescription, Verify Prescription, Manage Staff
and Roles, Manage Product Catalogue, Apply Insurance Cover, and Triage Patient
Visit — were written up in `UseCases-FullyDressed-Iteration2.md`, and the system
sequence diagrams for the five above in `SystemSequenceDiagrams.md`. Both are
complete.
