# Deployment

**Group 16 · CSC4630 Advanced Software Engineering**
Transition phase.

---

## 1. The shape: one service, not two

The server serves the built client from its own origin. There is one process,
one domain, and one Railway service, plus a PostgreSQL database.

This is a deliberate choice rather than a convenience. The obvious alternative —
an API service and a static site on separate domains — breaks something specific:

- The refresh token is delivered as an `HttpOnly`, `SameSite=Lax`, path-scoped
  cookie (DEF-050). `SameSite=Lax` means the browser will not send it on a
  cross-site request. Split the origins and refresh silently stops working.
- The fix for that would be `SameSite=None; Secure`, which removes exactly the
  cross-site protection the cookie was given in the first place.
- `client/src/api/client.js` defaults to `BASE_URL = '/api'`, same-origin, which
  also means no CORS allowlist to maintain and no preflight on every call.

So the deployment shape is chosen to preserve an existing security control. It
is not a packaging detail.

---

## 2. What was added

| File | Purpose |
| :--- | :--- |
| `package.json` at the repository root | Build and start scripts. Nixpacks detects Node from it, so no Dockerfile is needed. |
| `express.static` in `server/src/app.js` | Serves `client/dist`, with a fallback so client-side routes resolve. |

The static mount is conditional in two ways, both of which matter:

1. **Only when a build is present.** In development the client runs on Vite's own
   port and proxies `/api` here, so there is nothing to serve.
2. **Never under test.** The suite asserts a JSON `404` on unknown non-API paths,
   which is the API's contract. Serving an HTML shell there instead would have
   quietly changed what the tests were checking. Removing the `NODE_ENV !== 'test'`
   condition fails `auth.test.js` — that is recorded as the break-test for DEF-054.

Unknown paths under `/api/` still answer as JSON. Everything else returns the app
shell, because only the browser can resolve a client-side route.

---

## 3. Deploying to Railway

This section describes the GitHub-connected route. **The deployment that actually
exists did not use it** — see §7, which used the CLI and avoided the problem
below entirely.

### 3.1 If the repository does not appear in the list

Railway only lists repositories its GitHub App has been granted access to. This
repository lives under the **md1134** account, so it will not appear for a
different GitHub user until either the owner installs the Railway GitHub App on
it and grants access, or the repository is forked.

The CLI sidesteps this: `railway up` uploads the working directory and never
consults GitHub. The trade-off is that there is no automatic redeploy on push.

### 3.2 Steps

1. **New Project → Deploy from GitHub repo**, and pick this repository.
2. **Add a PostgreSQL database** to the same project.
3. Set the variables in §4.
4. Deploy. Railway runs `npm run build` then `npm start` from the root
   `package.json`.

`npm run build` installs both workspaces and builds the client into
`client/dist`. `npm start` runs the server, which finds that build and serves it.
The server already reads `process.env.PORT`, which Railway assigns.

---

## 4. Environment variables

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Yes | From the Railway PostgreSQL plugin. |
| `JWT_SECRET` | **Yes — critical** | Access token signing key. `middleware/auth.js` falls back to a default that is committed to this repository, so a deployment that omits this can have its tokens forged by anyone who has read the source. Set it to a long random value. |
| `NODE_ENV` | Yes | Set to `production`. It gates the seed described below. |
| `SEED_DEMO_DATA` | No | Only if demo data is genuinely wanted in that environment. See §5. |
| `ALLOWED_ORIGINS` | No | Unnecessary in the one-service shape, since the client is same-origin. |
| `UPLOAD_DIR` | Recommended | Compliance documents are written to disk. A container filesystem is ephemeral, so without a mounted volume uploads are lost on redeploy. See §6. |

`REFRESH_SECRET` is deliberately absent from this table. The CI workflow sets
one, but no code reads it: the refresh token is a random 32-byte value stored as
a SHA-256 hash rather than a signed JWT, so it has no signing key. Setting it
achieves nothing.

Copy `server/.env.example` to `server/.env` and fill it in. Never commit the result —
`server/.env` is git-ignored and the CI pipeline fails the build if a key appears
in the tree.

---

## 5. The seed is withheld in production

`initDb` creates the schema on first boot if the `tenants` table is absent. It
used to load `seed_data.sql` at the same time, unconditionally.

That seed contains demonstration pharmacies and staff accounts whose password is
published in the demo script. On a fresh production database it would have
created real, reachable logins with a known password. This is recorded as
**DEF-053**.

The schema is still applied unconditionally — an empty database is usable. The
seed is withheld when `NODE_ENV=production` unless `SEED_DEMO_DATA=true` is set
deliberately, and the decision is logged rather than made silently.

**For a marked demo this means: set `SEED_DEMO_DATA=true`,** or the deployment
will come up with an empty database and no accounts to sign in with.

---

## 6. Known limits of this deployment

Stated rather than discovered later.

1. **Uploaded documents do not survive a redeploy** unless `UPLOAD_DIR` points at
   a mounted volume. Compliance documents are written to the local filesystem,
   and a container's filesystem is replaced on every deploy.
2. **The frontend is now linted and component-tested in CI**, which it was not:
   the client's `lint` script was `vite build`, and no component tests existed.
   Both were what DEF-038 and DEF-043 cost. End-to-end tests driving a real
   browser against a real server still do not exist.
3. **CI, development and the deployment now all run PostgreSQL 18.** The pipeline
   previously stood up 15 while the deployment ran 18, so it was not testing
   against the version actually in use. That is closed.
4. **Tenant isolation is still enforced by convention, not by the database.**
   Row-level security is unimplemented; see R-02 and R-10 in
   `../Elaboration/RiskList.md`, which also records why it was deferred and the
   superuser trap waiting for whoever implements it.
5. **The live deployment carries demonstration credentials.** `SEED_DEMO_DATA` is
   set to `true` on the deployment described in §7, because a demonstration with
   an empty database and no accounts is not a demonstration. The consequence is
   that the accounts in the user manual — including `admin` — are reachable from
   the public internet on a published password. That is acceptable for a graded
   demonstration and unacceptable for anything else. After marking, either delete
   the service or remove the public domain.

---

## 7. The deployment that exists

Deployed 4 August 2026 with the Railway CLI, from the working directory rather
than from a GitHub connection. `railway up` uploads the current folder, so the
repository-access problem in §3.1 never arises — nothing needed to be forked and
no GitHub App had to be installed.

| | |
| :--- | :--- |
| URL | https://g-16-pharmarcypos.up.railway.app |
| Project | `group-16-pharmacy-pos` |
| Services | `pharmacy-pos` (the app), `Postgres` (PostgreSQL 18) |
| Region | `sfo` |

### What was verified against the live deployment

Checked by request rather than assumed:

| Check | Result |
| :--- | :--- |
| `GET /api/health` | `200`, `"database":"connected"` |
| `GET /` | `200 text/html` — the built client is served by the server |
| `GET /api/tenants/directory` | Returns Central Care Pharmacy and Riverside Chemist, so the schema and seed applied |
| `POST /api/auth/login` | `pharmacist` signs in and is issued a token |

Two things worth recording because they were open questions beforehand:

1. **The Postgres image is `postgres-ssl`, and `config/db.js` builds its Pool with
   no SSL option.** This is correct as configured, not a latent fault: `DB_HOST`
   is set to `postgres.railway.internal`, so the connection stays inside
   Railway's private network, where TLS is not required. It is verified working.

   The condition to be aware of is what happens if `DB_HOST` is ever repointed at
   Railway's public TCP proxy. The connection would then cross the public internet
   with no transport encryption, carrying the database password and patient data
   in clear text. Whether Postgres would refuse it outright or merely allow it
   depends on the image's `pg_hba` rules and has not been tested here — but the
   confidentiality problem holds either way. Anyone moving off the private network
   must add an `ssl` option to the Pool first.
2. **`JWT_SECRET` is set to a generated 96-character value**, not the fallback in
   `middleware/auth.js`. That fallback is committed to this repository; a
   deployment relying on it could have its tokens forged by anyone who has read
   the source.

### Redeploying

```bash
railway up --service pharmacy-pos
```

There is no automatic redeploy on push, because the service is not connected to a
GitHub repository. Pushing to any remote does nothing to the deployment until
this command is run again.
