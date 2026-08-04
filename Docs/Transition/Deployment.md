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

### 3.1 If the repository does not appear in the list

Railway only lists repositories its GitHub App has been granted access to. This
repository lives under the **md1134** account, so it will not appear for a
different GitHub user until either the owner installs the Railway GitHub App on
it and grants access, or the repository is forked.

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
2. **CI builds the frontend but does not test it.** The pipeline lints the server
   and runs the server suite; the client's `lint` script is `vite build`, not
   ESLint, and there are no component or end-to-end tests. DEF-038 and DEF-043
   are what that gap has already cost.
3. **CI runs PostgreSQL 15; development runs 18.** Nothing in the schema depends
   on the difference, but the versions are not the same and no deployment has
   been tested against either in a hosted environment.
4. **Tenant isolation is still enforced by convention, not by the database.**
   Row-level security is unimplemented; see R-02 and R-10 in
   `../Elaboration/RiskList.md`, which also records why it was deferred and the
   superuser trap waiting for whoever implements it.
5. **This has not been deployed.** The single-service path was verified locally:
   the client was built, the server started with `NODE_ENV=production`, and the
   app shell, a client-side route, the health endpoint and an unknown API path
   were each confirmed to answer correctly. No Railway deployment has been
   performed, so nothing here is claimed as proven in a hosted environment.
