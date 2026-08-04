# User Manual — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
For version as at 4 August 2026

---

## How to read this manual

Every screen described here exists in the running application. Where a feature
exists on the server but has no screen, that is stated in §9 rather than
described as though you could use it.

Amounts are shown in the currency symbol your pharmacy has configured, written
here as **K** (Zambian kwacha).

### Who does what

| Role | Can do |
| :--- | :--- |
| **Cashier** | Sell, take payment, open and close their own till, register patients, view stock and sales |
| **Pharmacist** | Everything a cashier can, plus verify prescriptions, receive and adjust stock, run procurement, manage insurance, take vitals and write up consultations |
| **Doctor** | Clinical work: their own patient queue, vitals, consultations, writing prescriptions |
| **Admin** | Everything in the pharmacy, plus staff accounts, branding, and closing any cashier's till |
| **Platform operator (SuperAdmin)** | ControlHub only: approving pharmacies onto the platform. Cannot sell or dispense. |

---

## 1. Signing in

1. Open the application and choose **Sign in** (or go to `/login`).
2. **Choose your pharmacy** from the list.
3. Enter your username and password, and select **Sign in**.

**Why you must pick a pharmacy first.** Usernames are unique *within* a
pharmacy, not across the platform. Two pharmacies can both have an `admin`. If
your username exists in more than one and you do not name yours, sign-in is
refused and asks which one you mean.

Sign-in is also refused if your pharmacy has not yet been approved onto the
platform. That is not a fault; see §8.

Platform staff sign in separately at **ControlHub** (`/controlhub/login`) and
cannot use the pharmacy workspace.

### If you are turned away

| Message | What it means |
| :--- | :--- |
| Asks which pharmacy | Your username exists in more than one; select yours |
| Invalid credentials | The username or the password is wrong. It deliberately does not say which |
| Sign-in opens on approval | The pharmacy is still being reviewed |

---

## 2. Cashier — taking a sale

**Screen: POS Checkout** (`/pos`)

### Ringing up

1. Find the product by typing its name, or scan its barcode.
2. Select it to add it to the basket. Adjust the quantity if needed.
3. If the patient is registered, identify them — this applies any insurance cover they hold.
4. If the sale needs a prescription, attach it.
5. Choose the payment type and complete the sale.
6. The receipt appears and can be printed.

### Prices are not negotiable at the till

The price charged always comes from the product record, never from the till.
This is deliberate: it means a discount cannot be applied by accident, and it
means the totals on the receipt always match the catalogue.

### VAT

VAT is decided per product, not applied across the basket. Most medicines are
**zero-rated** under Group 6 of the Zambian VAT (Zero-Rating) Order, so a
dispensed medicine adds nothing to the tax line. General goods marked
**standard** are taxed at 16%. If a receipt shows K0.00 VAT on a medicine
sale, that is correct.

### When the till refuses a sale

**A refusal is the system working, not breaking.** Nothing is recorded when a
sale is refused — no stock is taken and no receipt is issued. Read the message
and act on it.

| Message | What happened | What to do |
| :--- | :--- | :--- |
| `PRESCRIPTION REQUIRED` | The item is prescription-only and no prescription is attached | Attach a verified prescription |
| `PRESCRIPTION NOT VERIFIED` | A prescription is attached but no pharmacist has verified it | Ask a pharmacist to verify it (§4) |
| `PRESCRIPTION EXPIRED` | The prescription lapsed on the date shown | A new prescription is needed |
| `NOT PRESCRIBED` | The prescription attached does not list this medicine | Check you have the right prescription |
| `EXCEEDS PRESCRIPTION` | More requested than was prescribed | Reduce to the amount prescribed |
| `EXPIRED STOCK` | The batch expired on the date shown | Remove that stock from the shelf and tell a pharmacist |
| `INSUFFICIENT STOCK` | The pharmacy holds less than requested | Reduce the quantity or reorder |
| `NO TILL SESSION` | Your pharmacy requires an open till and you have none | Open your till first (§3) |

If you do not name a batch, the system picks the one expiring soonest that is
still in date — first expired, first out.

---

## 3. Cashier — your till

**Screen: Till Sessions** (`/till`)

This is how the pharmacy knows the drawer balances at the end of your shift.

### Opening

1. Count the cash you are starting with.
2. Enter it as the **opening float** and select **Open till**.

You can only have one till open at a time. Every sale you ring up while it is
open is attached to that shift.

### During the shift

The screen shows, live:

| Figure | Meaning |
| :--- | :--- |
| Opening float | What you started with |
| Sales rung up | How many sales on this shift |
| Cash taken | Cash sales only |
| All takings | Every sale, however it was paid |
| **Drawer should hold** | Opening float + cash taken |

**Only cash counts towards the drawer.** Card, mobile money and insurance
settlements are recorded against the sale but never put a note in the till, so
they raise "all takings" and leave "drawer should hold" alone. This is correct.

### Closing

1. Select **Close and count down**.
2. Count the cash physically in the drawer and enter it.
3. Add a note if anything needs explaining.
4. Select **Close till**.

The system records what the drawer *should* have held, what you counted, and the
difference. A negative variance means the drawer is **short**.

**The expected figure is calculated by the server from the sales it recorded.**
You cannot enter it, and the variance is recorded exactly as it falls out — a
shortfall is never rounded away. If your count is short, say so in the note; the
record is more useful with an explanation than without one.

A closed till cannot be reopened. An Admin can close a till whose cashier has
gone home.

---

## 4. Pharmacist — prescriptions

**Screen: Prescriptions** (`/prescriptions`)

A prescription moves through three states: **pending** when written, **verified**
when a pharmacist has checked it, and **dispensed** once it has been sold
against.

**Only a verified prescription can unlock a controlled sale**, and only for the
medicines it lists, up to the quantities it states. Verification is the
pharmacist's professional judgement and the system treats it as such.

To verify: open the prescription, check the prescriber, the patient and the
items, then select **Verify**.

A prescription with a validity date stops working the day after it lapses.

---

## 5. Pharmacist — stock

**Screen: Inventory** (`/inventory`)

### Adding a product

Select **Add product** and complete the details. Three fields matter more than
the rest:

- **Requires prescription** — this is what makes the till refuse an unauthorised sale.
- **VAT treatment** — zero-rated, standard, or exempt. Get this right or the pharmacy's tax is wrong.
- **Reorder level** — what drives the low-stock list.

You can search the drug directory to fill in details. **Reference data is not
clinical authority**: the directory describes products registered in the United
States, so a pharmacist must still check the entry against the Zambian
registration.

### Batches and expiry

Stock is held in batches, each with its own expiry date and quantity. The stock
figure shown is the sum of the batches — the same number the till enforces
against, so the screen and the counter always agree.

The expiry alert window is set per pharmacy (90 days by default).

### Movements

Every receipt, dispense and adjustment is recorded with who did it and when.
An adjustment requires a reason: an unexplained adjustment is indistinguishable
from shrinkage.

---

## 6. Pharmacist — procurement

**Screen: Procurement** (`/procurement`)

1. **Suppliers** — record the supplier with their TPIN and ZAMRA licence.
2. **Purchase orders** — raise an order listing products, quantities and unit costs.
3. **Receive against order** — when the delivery arrives, enter what actually came, with a **batch number and expiry date per line**.

Receiving is one transaction: batch, stock movement and line total are written
together, or nothing is. An order becomes `RECEIVED` when every line is
complete, or `PARTIALLY_RECEIVED` when some is outstanding.

Do not guess an expiry date. It is what the expiry guard will enforce at the
till.

---

## 6a. Triage — moving a patient through the clinic

**Screen: Triage Queue** (`/triage`)

A patient passes through five stages, shown as counts across the top of the
screen. The system moves them along as the work is actually done, rather than
asking someone to set a label.

| Stage | Meaning |
| :--- | :--- |
| **Waiting** | Registered at reception, nobody has seen them |
| **Triaged** | Vitals have been taken |
| **With clinician** | Routed to a consulting room |
| **At the counter** | Consultation written up, medicines to collect |
| **Completed** | Finished |

### Registering a walk-in

Select **Register walk-in**, choose the patient, and give the reason. The
patient must already be registered — add them on the Patients screen first.
They are given the next queue number for today.

### Taking vitals

Select **Vitals** on the patient's card and record what you measured. Any field
you did not take can be left blank.

**Recording vitals is the triage step.** A waiting patient moves to *Triaged*
automatically; there is no separate button to remember. The card then shows the
readings, and says how many have been taken if there is more than one.

### Routing to a clinician

Select **Route** and choose who will see the patient. The visit moves to *With
clinician*.

Only a prescriber who **holds an account at this pharmacy** can be routed to.
A doctor who wrote a prescription at a clinic elsewhere is a name on paper with
no login, so a patient cannot be sent to them — the screen lists those names
underneath and says why.

### Writing up the consultation

Select **Write up**, record what was assessed, and choose whether the patient is
going to the counter.

- **Going to the counter** — the visit moves to *At the counter* and stays open until the sale is rung up.
- **Nothing to collect** — the visit closes.

The assessment is a record of what the clinician concluded. It is free text
written by the person who saw the patient, and it is never a computed diagnosis.

### Closing

A visit at the counter is closed with **Close visit** once the medicines have
been dispensed.

**A closed visit cannot be reopened, and a visit cannot skip a stage.** If you
try, the system explains what it refused and why. Doctors can switch between the
whole queue and only their own patients.

---

## 7. Pharmacist and admin — other screens

| Screen | Path | What it does |
| :--- | :--- | :--- |
| **Dashboard** | `/dashboard` | Today's takings, low stock, expiring batches, queue summary. A figure shows `—` until the server answers |
| **Patients** | `/patients` | Register and update patients — name, phone, NRC, date of birth |
| **Insurance** | `/insurance` | Schemes and their cover percentage, patient enrolment, cover lookup |
| **Sales History** | `/sales` | Every sale with who served and how it was paid; reprint any receipt |
| **Staff & Roles** | `/staff` | Admin only: create staff accounts and set roles |
| **Site Settings** | `/settings` | Admin only: pharmacy name, branding, colour, currency symbol, contact details |
| **Assistant** | `/agent` | Answers questions about the pharmacy's own data. Not a clinical adviser |

Operational settings — the expiry alert window, whether a customer is required
on a sale, and whether a till session is required — are owned by the platform.
A pharmacy can see them but changes them through the platform operator.

### Insurance on a sale

Where a patient holds active cover, the scheme's share is calculated on the
total and the patient pays the balance. **The sale total does not change** —
the split records who pays what.

---

## 8. Platform operator — ControlHub

**Sign in at `/controlhub/login`.** Platform staff cannot sell or dispense.

| Screen | Path | What it does |
| :--- | :--- | :--- |
| **Dashboard** | `/controlhub/dashboard` | Platform overview |
| **Pharmacies** | `/controlhub/tenants` | Every pharmacy and its status |
| **Onboarding** | `/controlhub/onboarding` | Applications, uploaded documents, and review |
| **Approvals** | `/controlhub/approvals` | Sensitive changes awaiting a second administrator |

### Onboarding a pharmacy

A pharmacy applies, uploads its compliance documents (business registration,
ZAMRA licence, TPIN), and an operator reviews each one. The pharmacy moves
`REGISTERED → SUBMITTED → UNDER_REVIEW → APPROVED → ACTIVE`. **Staff cannot sign
in until the pharmacy is ACTIVE.**

### Maker-checker approvals

Suspending a pharmacy, activating one, and deactivating a staff account are
routed through approval. One administrator proposes with a reason; a **different**
administrator approves.

**You can never approve your own request.** This is the entire purpose of the
mechanism: one compromised or mistaken account cannot both propose and enact a
change. A request that has already been decided cannot be decided again.

---

## 9. What this version does not do

Stated plainly so nobody looks for a screen that is not there.

| | |
| :--- | :--- |
| **ZRA Smart Invoice** | References issued by an approved system are **recorded and printed**, never generated. This system is not a ZRA-approved invoicing provider, and producing something resembling a Smart Invoice would put an invalid tax document in a customer's hands. |
| **SIMFIS fiscalisation** | A **simulation**, and marked as one everywhere it appears — a `SIMFIS-` prefix, a notice on every response, a hatched block on the receipt that survives black-and-white printing, and the QR content printed as text rather than as a scannable square. It is a demonstration of the mechanism, not a fiscal receipt. Never give a SIMFIS block to a customer as a tax document. |
| **SIMSMS reminders** | Patient recall reminders are **simulated and never sent**. No message reaches a patient. |
| **Drug interaction screening** | **No data source is configured, so baskets are not screened.** The system reports that a basket *could not be checked* rather than reporting it clear. A "no interactions found" answer from an unchecked basket would be far more dangerous than an honest refusal. Do not treat the absence of a warning as a safety check. |
| **Clinical insight and patient recall** | Both work on the server and are covered by tests, but **have no screen**. They cannot be reached from the application. |
| **Refunds** | There is no refund workflow. |
| **Offline use** | The application requires the server. If the database is unreachable, screens say so rather than showing figures that might be wrong. |

---

## 10. When something looks wrong

1. **A figure shows `—`.** The server has not answered yet, or could not. It is not zero.
2. **A screen says the database is unreachable.** It is. Nothing is being hidden; the system refuses to show a figure it cannot stand behind.
3. **A sale was refused.** Read §2. Nothing was recorded, so simply correct the cause and ring it up again.
4. **A till is short.** Record the note, and tell a supervisor. The variance is kept exactly as counted.
5. **A page is blank.** Report it with the page name. Two defects of this kind have been found and fixed (DEF-038, DEF-043) and it is the failure most likely to recur.
