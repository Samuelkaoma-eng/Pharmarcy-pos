# Bonus Claim — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Against the marking guide's *"Bonus (up to 5%): use of design patterns, CI/CD
automation, or exceptional UI/UX."*

Each claim below names files a marker can open. Where the evidence is weaker
than the claim would like, that is said.

---

## Claim 1 — Design patterns

Full treatment in `Docs/Elaboration/DesignClassDiagrams.md` §9.

### Gang of Four patterns genuinely present

**Strategy** — `server/src/controllers/approvalController.js`

`ACTIONS` maps an action name to an object carrying a label and an
`apply(client, payload)` function. `decide` selects one at run time and invokes
it without knowing what it does:

```js
if (decision === 'APPROVED') {
  await ACTIONS[request.action].apply(client, request.payload);
}
```

A family of interchangeable algorithms, encapsulated, selected at run time, with
the client decoupled from which one runs — Strategy's intent exactly, expressed
with function objects as is idiomatic in a language with first-class functions.
It also carries a security property a `switch` would not: `createRequest`
refuses any action not in `ACTIONS`, so the set of things that can ever be
enacted through approval is closed and enumerable in one place.

**Facade** — `client/src/api/client.js`

One interface over `fetch`, header assembly, bearer tokens, JSON parsing and
blob handling. No page calls `fetch` directly, so three cross-cutting concerns
exist exactly once: token attachment, `401` handling, and the two awkward cases
(`upload` must omit `Content-Type` so the browser can set the multipart
boundary; `openAuthedFile` must fetch bytes as a blob because an `<a href>`
cannot carry a bearer token).

**Chain of Responsibility** — `server/src/services/aiProvider.js`

`ask()` tries Claude, and on failure passes to Gemini; if neither can answer it
returns `{ available: false, reason }`. Each handler either handles or passes
along, with an explicit terminal case. The chain is fixed at two links rather
than composed at run time, so this is the pattern in its simplest form.

**Also present:** Singleton (the `pg.Pool`, by module caching), Adapter
(`drugDirectory.js` normalising openFDA and RxNav responses), and a closure
factory (`requireRole(...roles)`).

### GRASP

`DesignClassDiagrams.md` §8 assigns nine responsibilities against Information
Expert, Creator, Controller, Pure Fabrication, Polymorphism, Indirection and
Protected Variations, each with the reasoning.

### What strengthens this claim most

**We removed two pattern claims after checking them.** Our own notes had called
the checkout guard sequence *Template Method* and the triage workflow *State*.
Neither survives inspection — the first has no hierarchy and no overridable
hook, the second is a lookup table with no per-state behaviour. Both are
documented as withdrawn, with the reasoning, in §3 and §6 of the design class
diagrams.

A pattern catalogue that only grows is a vocabulary exercise. One that shrinks
under scrutiny is evidence the team understands what the patterns mean.

---

## Claim 2 — CI/CD automation

`.github/workflows/ci.yml`. **Six jobs**, all gating.

| Job | What it does |
| :--- | :--- |
| `test` | Builds client and server, provisions PostgreSQL, applies the real schema and seed, runs all 234 tests |
| `dependency-audit` | `npm audit`, failing the build on high severity, for both workspaces |
| `secret-scan` | gitleaks over **full history**, not just the diff |
| `codeql` | Static analysis for JavaScript |
| `sbom` | CycloneDX software bill of materials |
| `project-invariants` | Project-specific assertions, described below |

### The invariants job is the part worth marking

Generic tooling cannot know what is dangerous about *this* system. This job
encodes four properties that are specific to a pharmacy POS and would be
invisible to any off-the-shelf scanner:

1. A simulated fiscal value can never reach `sales.smart_invoice_ref` — the field reserved for a reference issued by a ZRA-approved system.
2. Drug interaction screening still fails closed, and has not been "fixed" into returning an empty list.
3. No controller invents data when the database is unreachable.
4. No API key is committed.

Property 1 exists because putting a simulated value in a genuine tax field would
put an invalid tax document in a customer's hands. Property 2 exists because
telling a dispenser a basket is clear when nothing was checked is the most
dangerous thing this system could do. These are the project's safety
commitments, enforced by the pipeline rather than by memory.

### It has already earned its place

The `dependency-audit` job found a real high-severity vulnerability **on its
first run** — Vite 5 carrying a path traversal, an NTLMv2 hash disclosure via
UNC paths on Windows, and a `server.fs.deny` bypass. Dev-server only, but this
team develops on Windows, so it was live exposure on the machines the project is
built on. Recorded as DEF-042 and closed by upgrading to Vite 8.

---

## Claim 3 — UI/UX

This is the claim we hold most loosely, for a reason given at the end.

### What is genuinely good

**The interface never invents a figure.** A value renders as `—` until the
server answers; it does not render as `0`, which would be a claim. An empty list
says it is empty. A page that cannot reach the database says so. This was not
free — six server controllers and several pages had invented data removed
(LIM-003, DEF-038, DEF-040, DEF-043), and it is the single most defensible UX
decision in the project, because in a dispensary a confident wrong number is
worse than a blank.

**Refusals explain themselves and name the specifics.** Not "invalid sale" but
`EXPIRED STOCK: Batch 'B-2024-11' of 'Cough Syrup' expired on 2025-11-30`, and
`EXCEEDS PRESCRIPTION: 'Amoxicillin 250mg' is prescribed as 14, 30 requested`.
The message carries the number the user needs to act.

**Live reconciliation on the till.** The drawer figure updates through the
shift, so a cashier can notice a problem at 2pm rather than discovering it at
closing; and the close dialog previews the variance before committing, while
labelling it a preview because the server computes the real one.

**Restrained motion.** Navigation happens many times an hour, so page
transitions are 180ms and small. One shared `layoutId` pill slides between nav
items rather than cross-fading two backgrounds.

**Tenant branding.** Colour, logo, name and currency symbol follow the signed-in
pharmacy, propagated through CSS custom properties.

**Deliberate anti-affordance on simulations.** The SIMFIS receipt block is
hatched and dashed so it survives black-and-white thermal printing, and its QR
content is printed **as text, never as a scannable square** — so nobody can scan
it and mistake the result for a real fiscal verification. Designing something to
be *less* usable, on purpose, for safety.

### Why we hold this claim loosely

**No user has ever used this interface.** Everything above is an argument from
inspection by the people who built it, which is the weakest possible position
from which to claim exceptional UX. `Docs/Transition/BetaTestReport.md` says so
on its first page.

One known gap also counts against it: clinical insight and patient recall have
no screen at all.

**We would rather claim this honestly and be marked down than claim "exceptional
UX" on evidence we do not have.**

---

## Summary

| Claim | Strength | Evidence |
| :--- | :--- | :--- |
| Design patterns | **Strong** | Three GoF patterns with mechanism and intent both present, nine GRASP assignments, and two claims withdrawn under scrutiny |
| CI/CD automation | **Strong** | Six gating jobs, including project-specific safety invariants; found a real CVE on first run |
| UI/UX | **Partial** | Defensible principles and real decisions, but no user has used it, and two areas are incomplete |
