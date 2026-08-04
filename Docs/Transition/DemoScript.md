# Live Demo Script — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Target length: **12–15 minutes.** Every step below has been run on this build.

---

## Before you start

```bash
npm --prefix server run db:reset
```

Then start both, in separate terminals:

```bash
npm --prefix server start
```

```bash
npm --prefix client run dev
```

Open `http://localhost:3000`. Check the browser console is clean before you
begin.

**Reset the database immediately before demonstrating.** The expiry and stock
refusals depend on the seeded batches, and a rehearsal run will have consumed
stock.

### Logins — all passwords `password123`

| Username | Pharmacy | Role |
| :--- | :--- | :--- |
| `cashier` | Central Care | Cashier |
| `pharmacist` | Central Care | Pharmacist |
| `admin` | Central Care | Admin (choose the pharmacy — this username exists twice) |
| `superadmin` | Platform | ControlHub |
| `superadmin2` | Platform | ControlHub (the second approver) |

### The one sentence to open with

> "This is a multi-tenant pharmacy point-of-sale for Zambia. The theme running
> through it is that the system refuses to give a confident answer it cannot
> stand behind — and most of what we'll show you is it saying no."

---

## 1 · Sign in, and why the pharmacy picker exists (1 min)

Sign in as `cashier`, Central Care.

> "Usernames are unique within a pharmacy, not across the platform. Two
> pharmacies can both have an `admin`, so you name your pharmacy first. If you
> don't, and the username is ambiguous, sign-in is refused and asks which."

**Optional, if you have a moment:** try `admin` with no pharmacy selected to
show the refusal.

---

## 2 · Open the till (1 min)

Go to **Till Sessions**. Enter an opening float of **200** and open the till.

> "Until this week a sale belonged to a cashier but not to a shift — no float,
> no closing count, no variance. A drawer could be short and nothing in the
> system would say so. That was the largest gap between what our business case
> promised and what the software did."

---

## 3 · Process a sale (2 min)

Go to **POS Checkout**. Add **Paracetamol 500mg**, quantity 2. Pay cash.

Point at the VAT line, which reads **K0.00**:

> "That's correct, not a bug. Medicines are zero-rated under Group 6 of the
> Zambian VAT Zero-Rating Order. We used to charge 16% across the whole basket,
> which overcharged on every dispensed item — that was DEF-034."

Show the receipt.

> "The price came from the product record, not from the till. A client that
> posts its own price is ignored."

---

## 4 · The prescription guard refuses (2 min) — **the important one**

Add **Amoxicillin 250mg** to a new basket. Complete the sale with no
prescription.

Refusal: `PRESCRIPTION REQUIRED`.

> "Now the more interesting version."

Attach a prescription that does **not** list amoxicillin (or one still pending
verification) and try again.

Refusal: `NOT PRESCRIBED` — or `PRESCRIPTION NOT VERIFIED`.

> "Originally, supplying *any* prescription id was the whole check. The
> prescription was never loaded. So an unverified one, one written a year ago,
> or one listing completely different medicines all unlocked a controlled sale.
> Now it has to be this pharmacy's, verified by a pharmacist, still in date, and
> it has to actually list this drug in at least this quantity."

**Say this explicitly:**

> "Nothing was recorded. Every guard runs inside one transaction, so a refused
> sale leaves no sale row, no stock movement and no change to any quantity."

---

## 5 · The expiry guard refuses (1 min)

Add **Cough Syrup** and select the expired batch (seeded expired).

Refusal: `EXPIRED STOCK`, naming the batch and its expiry date.

> "If you don't name a batch we pick first-expired-first-out from what's still
> in date. If every batch has expired, we refuse rather than quietly selling the
> newest one."

---

## 6 · Close the till, short (2 min) — **the money moment**

Ring up one more sale, this time by **card**.

Return to **Till Sessions**:

> "Two sales. All takings K150 — but cash taken is only K50, and the drawer is
> only expected to hold the float plus that K50. A card settlement never puts a
> note in the till, so counting it would show a shortfall on a completely honest
> shift."

Select **Close and count down**. Enter **20 less** than the expected figure.

Show the variance: **K −20.00**.

> "And this is the part that matters: the expected figure is computed by the
> server from the payments it actually holds. The cashier cannot supply it. If
> they could, they would supply whatever they counted, and the variance would
> always be zero."

---

## 7 · Receive stock against an order (1.5 min)

Sign in as `pharmacist`. Go to **Procurement**.

Open a purchase order and receive against it, entering a **batch number and
expiry date per line**.

> "The expiry date you enter here is what the guard in step 5 will enforce at
> the till. Receiving is one transaction across every line — batch, stock
> movement and line total together, or nothing."

---

## 8 · Triage — the clinic workflow (2 min)

Go to **Triage Queue**. Point at the five stage counts across the top.

Register a walk-in, choosing a registered patient. It appears as **Waiting**.

Record vitals on that patient.

> "Notice it moved to Triaged on its own. Recording vitals *is* the triage step
> — the system advances the patient as the work is actually done, rather than
> asking someone to remember to set a label. And the card now shows the
> readings; it used to say 'Vitals Pending' no matter how many had been taken."

Select **Route** and open the clinician list.

> "Only Dr. Phiri is offered. Dr. Banda is a referring paediatrician with no
> account here — the screen names her underneath and says why she can't be
> routed to. Assignment is a hand-off to somebody who can actually pick the
> patient up, not a label."

Route the patient, then **Write up** the consultation and send them to the
counter.

> "That's the DISPENSING state — between the consulting room and the till.
> Without it, a consultation that produced no prescription left no trail at all.
> The visit stays open until the sale is rung up, and `sales.visit_id` closes
> the loop."

> "Each station is gated to the people who staff it — a cashier can't route a
> patient. And a state machine refuses to let a visit skip ahead or reopen once
> it's closed."

---

## 9 · ControlHub onboarding (1.5 min)

Sign out. Sign in at `/controlhub/login` as `superadmin`.

Go to **Onboarding**. Open the pharmacy awaiting review (`mediquick_admin`'s).
Show the uploaded compliance documents and review one.

> "A pharmacy applies, uploads its business registration, ZAMRA licence and
> TPIN, and an operator reviews each document. Staff can't sign in until the
> pharmacy is ACTIVE."

---

## 10 · Maker-checker (2 min) — **strong finish**

Still as `superadmin`, go to **Approvals**. Raise a request to suspend a
pharmacy, with a reason.

Now try to approve your own request.

Refusal: **403 — you raised this request, so it must be decided by a different
administrator.**

> "That's the whole point of the mechanism. One compromised or mistaken account
> cannot both propose and enact a change."

Show the target pharmacy is still ACTIVE — nothing was applied.

Sign out, sign in as `superadmin2`, approve it, and show the pharmacy's status
change.

> "The request is locked while it's decided, so two approvers can't both decide
> it and apply the action twice. And it can't be decided again."

---

## Closing (30 seconds)

> "Three things we deliberately don't do. We record ZRA Smart Invoice references
> but never generate one — we're not an approved provider, and issuing something
> that looks like a Smart Invoice would put an invalid tax document in a
> customer's hands. Our fiscal and SMS services are simulations and are marked
> as such everywhere they appear. And drug interaction screening has no data
> source since the NLM retired its free API in 2024 — so we report that a basket
> *could not be screened*, rather than reporting it clear. Telling a dispenser a
> basket is clear when nothing was checked is the most dangerous thing this
> system could do."

---

## If asked

| Question | Answer |
| :--- | :--- |
| "How many tests?" | 241 server tests across 20 suites, plus 8 client component tests. Every guard has been verified by removing the fix and confirming the test fails — 8 of the 15 till tests fail without theirs. |
| "Is it secure?" | Six-job CI: build and test, dependency audit, gitleaks over full history, CodeQL, SBOM, and project-specific invariants. The audit job found a real high-severity Vite advisory on its first run (DEF-042). |
| "Biggest weakness?" | Tenant isolation is enforced by convention — every query is scoped because it was written that way. PostgreSQL row-level security is the structural fix and it isn't done. |
| "Has anyone used it?" | No. It's verified, not validated. The beta test plan is written and unexecuted, and our beta report says so on its first page. |
| "Why no ORM?" | The checkout guards need an explicit transaction boundary and explicit row locks. Hiding those behind a mapper made the safety properties harder to prove, not easier. |
| "What's the design pattern?" | Strategy for the approval actions, Facade for the client API, Chain of Responsibility for the AI provider. We also removed a claim — the checkout guard sequence is not Template Method, because there's no hierarchy and no overridable hook. |

---

## What not to do

- **Do not demo on a database you have already run the demo against.** Stock and prescriptions will be consumed and the refusals will fire for the wrong reason.
- **Do not open Clinical Insight or Patient Recall.** They work on the server and have no screen.
- **Do not present the SIMFIS block as a fiscal receipt**, even in jest.
- **Do not claim the interaction checker screens baskets.** It does not, deliberately.
