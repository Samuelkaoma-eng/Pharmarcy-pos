# Final Report — Pharmacy POS Platform

**Group 16 · CSC4630 Advanced Software Engineering**
Unified Process, after Larman, *Applying UML and Patterns*, 3rd edition
Report date: **4 August 2026**

---

## 1. What was built

A multi-tenant point-of-sale and dispensing system for Zambian pharmacies. One
deployment serves many pharmacies; each sees only its own patients, stock,
staff and sales. A platform operator admits new pharmacies through a review
process with a two-person approval rule for sensitive changes.

The system covers the counter (catalogue, basket, prescription and expiry
guards, VAT, insurance split, receipt), the stock room (batches, expiry,
movements, suppliers, purchase orders, receiving), the clinic side (patient
registration, visit queue, vitals, consultation, prescribing), the drawer (till
sessions and cash reconciliation), and the platform (onboarding, compliance
documents, maker-checker approvals).

| | |
| :--- | :--- |
| Server | Node.js, Express, PostgreSQL 18, plain SQL through `pg`, no ORM |
| Client | React 18, Vite 8 (Rolldown), CSS design tokens |
| Tests | 234 automated tests across 20 suites |
| Pipeline | 6 jobs: build and test, dependency audit, secret scan, CodeQL, SBOM, project invariants |
| Source of truth | `Docs/Elaboration/schema_postgres.sql` and `seed_data.sql` |

---

## 2. The phases as they actually ran

The repository history is the honest record: **8 commits in February 2026, 1 in
May, and 24 in August.** That distribution is the first and most important
lesson in this report, and §5 returns to it.

### 2.1 Inception (February 2026)

Produced the vision and business case, a stakeholder analysis, 31 high-level
use cases, and a first risk list. The business case named reducing stock losses
caused by theft and error as a core objective.

The phase did what Inception is supposed to do — establish scope and business
justification without pretending to know the design. Its weakness was that the
risk list had four rows and no scoring, so it could not actually drive anything.

### 2.2 Elaboration (August 2026)

The bulk of the architectural work. Five use cases were written fully dressed
with system sequence diagrams and ten operation contracts, a domain model was
drawn, an architectural proof-of-concept was written, and the risk list was
rebuilt to sixteen scored risks.

The proof-of-concept settled the decision that shaped everything after it: **no
ORM.** The guard logic at checkout needs an explicit transaction boundary and
explicit row locks, and hiding those behind a mapper made the safety properties
harder to prove rather than easier. That decision has held up. Its cost —
`tenant_id` scoping being a convention rather than something the database
enforces — is recorded as the largest remaining architectural risk and is
discussed in §6.

### 2.3 Construction (August 2026)

Six more use cases fully dressed, the remaining features implemented, the test
suite grown from a handful to 234, the CI pipeline built, and the defect log
grown to 54 defects and 7 limitations.

Most of the real engineering in this phase was **fixing things that appeared to
work.** That is discussed in §3, because it is the finding of the project.

### 2.4 Transition (August 2026)

Design class diagrams, this report, the user manual, the beta test report, the
demo script, and the closing of the last major functional gap (till sessions).

The transition deliverable the project does **not** have is real user
validation. The beta test report says so in its first paragraph rather than
inventing testers.

---

## 3. What the project actually found

The most valuable output of this project is not a feature. It is a pattern in
the defects, which recurred often enough to be a finding rather than an anecdote.

### 3.1 The dangerous failure is the one that looks like success

Nearly every serious defect in `DEFECT_LOG.md` shares a shape: **the system
produced a confident, plausible, wrong answer**, and nothing about the output
suggested a problem.

| Defect | The system said | The truth |
| :--- | :--- | :--- |
| DEF-037 | This controlled sale is authorised | The prescription was unverified, lapsed, or listed different medicines |
| DEF-034 | This product is zero-rated | It was whatever the pharmacy meant it to be; the field was unreachable |
| DEF-036 | The patient has been moved to the next stage | Nothing changed |
| DEF-039 | Amoxicillin: −6 units | The batch held 39 |
| DEF-040 | Stock: 100 | There was none |
| LIM-003 | Here is your patient queue | The database was down; the queue was invented |
| Interaction check | No interactions found | Nothing had been checked; the API was retired in 2024 |

An outage that presents as working software is worse than an outage. A basket
reported clear by a check that never ran is worse than no check, because it
transfers false confidence to a dispenser.

**This became the project's design rule: fail closed, and never invent.** It is
why six controllers lost their mock fallbacks and now return `503
DATABASE_UNAVAILABLE`; why the interaction checker reports that a basket *could
not be screened*; why the AI provider returns "no answer available" rather than
a guess; why a UI figure shows `—` until the server answers; and why the till's
expected cash is computed by the server and never accepted from the client.

### 3.2 A passing build is not a working application

DEF-038 and DEF-043 are the same defect in two different files: a component used
`currency` without reading it from context, threw on its first row, and rendered
a blank page. **Both passed the production build. Both passed the entire
server-side test suite.**
Only a human opening the page found either.

The cause is structural: the test suite is server-side and API-level, and there
are no component or end-to-end UI tests. That is an honest gap, and it is
recorded as one rather than argued away.

### 3.3 A defect is not closed until a test fails without the fix

`DEFECT_LOG.md` previously carried entries marked RESOLVED that were not. The
correction was to adopt a rule: remove the fix, run the suite, and confirm the
test fails. Applied to the Elaboration defect set it proved 16 of 18 cases;
applied to till sessions this week it proved 8 of 15. Any test that passes both
with and without the fix is not evidence and gets rewritten.

---

## 4. Where the Unified Process genuinely helped

Not a summary of the textbook — the places it changed what we did.

**Operation contracts caught defects before code existed.** Writing CO-01 for
`completeSale` forced the question "what has changed after this operation?"
Listing the postconditions is what exposed that the prescription was never
loaded, only its id checked. DEF-037 was found by writing a document.

**Iterative development is what made the guards correct.** The prescription
guard has been rewritten three times: first "was an id supplied", then "is it
verified and in date", then "does it list this drug in this quantity". No amount
of up-front design would have produced the third version first, because each
version had to exist and be examined before its weakness was visible.

**The domain model kept the vocabulary straight.** Distinguishing Product from
Batch early is why the expiry guard is possible at all. A design that tracked a
single quantity per product could not have refused an expired batch, and
retrofitting that distinction later would have touched everything.

**Risk-driven iteration ordering worked.** The highest-scored risks — dispensing
an expired or unauthorised medicine, tenant data leakage — were built and tested
first. The features that make demonstrations look good were built last.

**The SSD's black-box discipline stopped premature design.** Treating the system
as one box while writing the use cases kept early arguments on *what the actor
needs* rather than which module owns it.

---

## 5. Where the Unified Process did not help, and what we got wrong

This section is deliberately blunt; a reflection that finds only successes is
not a reflection.

**The phase distribution was wrong.** 8 commits in February, 1 in May, 24 in
August. The project was not iterative across its calendar — it was a long
Inception followed by a compressed everything-else. UP describes iterations
weeks apart with working software at each boundary. We produced working software
at the end. The iterations inside August were real and did drive the work, but
they were compressed into days, so the feedback loop that is supposed to run
between a build and the next plan mostly ran between one afternoon and the next.

**Artefacts were written after the code more often than before it.** The
fully-dressed use cases for iteration 2 and the design class diagrams were both
written against implemented behaviour. This is a genuine deviation from UP. It
is defensible only in that the documents describe what is actually there, and
were used to *find* discrepancies — the design class diagram work is what
established that the guard pipeline is not the Template Method pattern we had
been calling it. But documenting after building forfeits the main benefit,
which is catching the error before paying for it.

**The first risk list was decoration.** Four unscored rows that never drove a
decision. It only became useful when rebuilt with sixteen scored risks, and by
then most of the architecture was fixed.

**We over-trusted our own defect log.** It carried entries marked RESOLVED that
were not, which is worse than an unclosed defect because it stops anyone
looking. The verification rule in §3.3 exists because of that.

**We under-invested in UI testing and paid for it twice.** See §3.2.

**Beta testing did not happen.** Planned in the transition documents, never run.
The system is verified and not validated.

---

## 6. Honest limitations

| | |
| :--- | :--- |
| **Tenant isolation is convention, not enforcement** | Every query is scoped by `tenant_id` because it was written that way. Nothing structural stops the next one omitting it. `tenantIsolation.test.js` catches regressions in tested paths and proves nothing about an untested new query. PostgreSQL row-level security is the fix and is not done. This is the highest remaining architectural risk (R-02/R-10). |
| **No UI test layer** | Two blank-page crashes reached the browser through a green build (§3.2). |
| **No real users** | See `Docs/Transition/BetaTestReport.md`. |
| **Clinical insight and patient recall have no UI** | Endpoints and tests exist; nothing calls them. |
| **ZRA Smart Invoice is recorded, never generated** | This is not an approved invoicing provider, and issuing something resembling a Smart Invoice would put an invalid tax document in a customer's hands. Deliberate. |
| **Drug interaction screening has no data source** | The NLM retired its free API in January 2024. The system reports that a basket could not be screened, and refuses to report it clear. Deliberate. |
| **No load or concurrency testing** | Beyond the row locks asserted in `makerChecker.test.js` and `tillSession.test.js`. The suite runs `--runInBand`. |
| **No refunds** | Not implemented. |

---

## 7. Lessons learned

1. **Design the failure mode first.** For every feature that answers a question, decide what it does when it cannot answer. Doing this last produces mock fallbacks that turn outages into silent corruption.

2. **A test that passes with the fix removed is not a test.** Cheap to check, and it invalidated real entries in our own defect log.

3. **Write the postconditions before the code.** The single highest-value hour in the project was writing operation contracts, and it found a critical defect with no code involved.

4. **A green build proves the code compiles, nothing more.** Open the application.

5. **Name patterns honestly.** We called the checkout guard sequence a Template Method for weeks. It has no hierarchy and no overridable hook. Carrying a wrong name meant carrying a wrong mental model of where variation belonged.

6. **Regulatory constraints are design inputs, not paperwork.** Zero-rated VAT on medicines, the ZRA Smart Invoice rule, and ZAMRA licensing each changed the schema. Treating them as a compliance afterthought would have meant charging 16% VAT on every dispensed medicine — which is exactly the bug DEF-034 was.

7. **Simulations must be unmistakable.** SIMFIS and SIMSMS are safe because of three properties held together: a name nowhere near a real service, simulated values in their own columns so they can never occupy a genuine field, and marking on every artefact. Any one alone would not be enough.

8. **Start the calendar earlier.** Every technical lesson above was learned in a compressed period. Most would have been cheaper to learn in March.

---

## 8. Assessment

The system does what it claims, refuses what it should refuse, and states
plainly what it cannot do. Its guards are tested, and the tests have been shown
to fail without them. Its most dangerous behaviours — inventing data during an
outage, reporting an unchecked basket as clear, generating a tax document it has
no authority to issue — were identified and deliberately designed out.

It has not been used by a pharmacist. Until it has, the correct description is a
well-verified prototype rather than a system ready for a counter. The remaining
work, in order: run the beta test plan, add row-level security, add a UI test
layer, and give clinical insight and patient recall the screens they lack.
