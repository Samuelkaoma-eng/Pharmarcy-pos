# Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering · University of Zambia**

A multi-tenant point-of-sale and dispensing system for Zambian pharmacies. One
deployment serves many pharmacies; each sees only its own patients, stock, staff
and sales. A platform operator admits new pharmacies through an onboarding
review, with a two-person approval rule for sensitive changes.

---

## This is a Node project

There is no `requirements.txt`, no `venv`, and no Python anywhere in the tree.
The equivalents are:

| If you are used to | Here |
| :--- | :--- |
| `requirements.txt` | `package.json` — one per workspace |
| `pip freeze` | `package-lock.json` — pins every transitive package with an integrity hash |
| `pip install -r requirements.txt` | `npm ci` |

Do not run `pip freeze > requirements.txt` in this repository. It would capture
whatever Python happens to be installed on your machine, none of which this
project uses.

---

## Prerequisites

| | |
| :--- | :--- |
| Node.js | 20 or newer |
| PostgreSQL | 15 or newer — developed against 18, CI runs 15 |
| npm | Ships with Node |

You need a running PostgreSQL server and credentials for it. Nothing else.

---

## Getting it running

**1. Install both workspaces.**

```bash
npm run install:all
```

**2. Create your environment file.**

```bash
cp server/.env.example server/.env
```

Open `server/.env` and set the five `DB_*` values to match your PostgreSQL. That
is the only block you must fill in to run locally. Everything else has a working
default, and the file explains each one.

`server/.env` is git-ignored. Never commit it.

**3. Create the schema and load the demonstration data.**

```bash
npm run db:reset
```

This drops and rebuilds everything from `Docs/Elaboration/schema_postgres.sql`
and `seed_data.sql`, which are the single source of truth for the database.
Re-run it any time the data gets into a state you do not want — including after
running the test suite, which mutates stock levels.

**4. Start the server.** Leave it running.

```bash
npm start
```

**5. Start the client**, in a second terminal.

```bash
npm --prefix client run dev
```

Then open **http://localhost:3000**. The client proxies `/api` to the server on
port 5000, so both need to be running.

---

## Signing in

Every seeded account uses the password `password123`.

| Username | Pharmacy | Role |
| :--- | :--- | :--- |
| `cashier` | Central Care | Cashier — the till |
| `pharmacist` | Central Care | Pharmacist — dispensing, stock, prescriptions |
| `admin` | Central Care | Admin — staff, suppliers, reports |
| `superadmin` | Platform | Platform operator (ControlHub) |
| `superadmin2` | Platform | Second operator, for the two-person approval rule |

These exist only because the seed was loaded. They are demonstration accounts
with a published password and are withheld from production deployments.

---

## Checking it works

```bash
npm test
```

234 tests across 20 suites. They run against your real database and mutate it,
so run `npm run db:reset` afterwards before demonstrating anything.

```bash
npm run lint
```

---

## Layout

| Path | |
| :--- | :--- |
| `server/src/controllers/` | One per area. `saleController.js` holds the checkout guards. |
| `server/src/services/` | Audit logging, AI provider chain, fiscal simulation. |
| `server/src/middleware/auth.js` | Token verification and role checks. |
| `server/src/__tests__/` | 20 suites. |
| `client/src/pages/` | One per screen. `POSCheckout.jsx` is the till. |
| `client/src/api/client.js` | Single interface over every server call. |
| `Docs/` | Use cases, domain model, diagrams, risk list, reports. |
| `Docs/Elaboration/schema_postgres.sql` | The database. Edit here, not in a migration. |
| `DEFECT_LOG.md` | Every defect found, with the test that holds each fix closed. |

---

## Things worth knowing before you change anything

1. **Safety checks fail closed.** A check that cannot run reports that it could
   not run. It never reports the basket as clear. Drug interaction screening has
   no data source and says so rather than returning an empty list.
2. **The interface never invents data.** A value renders as `—` until the server
   answers. There are no mock fallbacks; an outage looks like an outage.
3. **A defect is not closed until the suite fails without the fix.** Remove the
   fix, run the tests, confirm the failure. A test that passes either way is not
   evidence. `DEFECT_LOG.md` records this for every entry.
4. **ZRA fiscal references are recorded, never generated.** This system is not an
   approved invoicing provider. The SIMFIS simulation is marked as simulated
   everywhere it appears and writes to its own columns.

---

## Documentation

| Document | |
| :--- | :--- |
| `Docs/Inception/UseCases-HighLevel.md` | All 31 use cases, and the diagram of every actor |
| `Docs/Elaboration/` | Fully-dressed use cases, domain model, sequence and design class diagrams, architecture, risks |
| `Docs/Transition/UserManual.md` | How to operate each role |
| `Docs/Transition/Deployment.md` | Deploying as a single service |
| `Docs/Transition/BetaTestReport.md` | What was tested, and honestly what was not |
| `Docs/FinalReport.md` | How the four phases actually ran |
| `Docs/diagrams/rendered/` | Every diagram as SVG and PNG |
