const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { APP_ROLE, ensureAppRole } = require('./appRole');

// The credentials the server runs under. Since row-level security was enabled
// this is deliberately NOT the superuser: `pharmacy_app` is subject to the
// policies in Docs/Elaboration/rls_policies.sql, and a superuser would bypass
// every one of them without a word.
const pool = new Pool({
  user: process.env.DB_USER || APP_ROLE,
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'pharmacy_pos',
  password: process.env.DB_PASSWORD || 'pharmacy_app_dev',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  // A connection is now held for the length of a request rather than for the
  // length of a query, because the tenant lives on the connection. Requests
  // that call a language model or a reference API hold theirs across that call,
  // so the ceiling is raised to match.
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  // Off by default, which is correct for a local database and for the deployed
  // one: it reaches PostgreSQL over a private network where TLS is not
  // required. Set DB_SSL=true if the host is ever moved to a public endpoint —
  // without it the database password and patient records would cross the
  // network in clear text.
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// Migration credentials: creating the schema, seeding it, provisioning the
// application role and installing the policies. Separate from the pool above
// because those are the operations the application role must NOT be able to
// perform. Only ever opened for as long as the work takes.
const adminConfig = () => ({
  user: process.env.DB_ADMIN_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'pharmacy_pos',
  password: process.env.DB_ADMIN_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

let dbAvailable = true;

// ---------------------------------------------------------------------------
// The request scope
// ---------------------------------------------------------------------------
// `app.tenant_id` is session state on a PostgreSQL connection, and connections
// are pooled. That is the second thing that would have made this change worse
// than the convention it replaces: a connection handed back to the pool still
// holding a tenant is a silent cross-tenant read, where a forgotten
// `WHERE tenant_id = $1` is at least visible in the SQL.
//
// So one connection belongs to one request. AsyncLocalStorage carries it, which
// is what lets the fifty-odd existing `db.query` calls and the fourteen
// transactions keep their shape — they no longer touch an arbitrary pooled
// connection, they touch this request's.
//
// The connection is acquired lazily, on the first query, so a request that
// never reaches the database never takes one; and it is released when the
// response closes, cleared with DISCARD ALL. A connection that cannot be
// cleared is destroyed rather than reused.
const scopes = new AsyncLocalStorage();

const applyScope = (client, scope) =>
  client.query(
    `SELECT set_config('app.tenant_id', $1, false),
            set_config('app.platform_admin', $2, false),
            set_config('app.auth_lookup', $3, false)`,
    [
      scope.tenantId || '',
      scope.platformAdmin ? 'on' : 'off',
      scope.authLookup ? 'on' : 'off'
    ]
  );

const acquire = async (scope) => {
  if (scope.client) return scope.client;
  if (scope.pending) return scope.pending;

  // Two queries fired together at the start of a request must not each check
  // out a connection, or the request would hold two and clear one.
  scope.pending = pool
    .connect()
    .then(async (client) => {
      scope.client = client;
      scope.pending = null;
      await applyScope(client, scope);
      return client;
    })
    .catch((err) => {
      scope.pending = null;
      throw err;
    });

  return scope.pending;
};

// Runs `fn` with a fresh request scope. Nothing is set on the connection yet:
// an unauthenticated request keeps the empty scope, and an empty scope sees no
// rows, which is the correct default.
const runInScope = (fn) => scopes.run({ tenantId: null, platformAdmin: false, authLookup: false, client: null, pending: null }, fn);

const currentScope = () => scopes.getStore();

// Called by the authentication middleware once the token has been verified.
const setTenantScope = async ({ tenantId, platformAdmin }) => {
  const scope = currentScope();
  if (!scope) return;
  scope.tenantId = tenantId || null;
  scope.platformAdmin = Boolean(platformAdmin);
  if (scope.client) await applyScope(scope.client, scope);
};

/**
 * Opens the narrow window in which the identity tables — tenants, users,
 * refresh_tokens — may be read without a tenant.
 *
 * Signing in has to find a user by name before it can know which pharmacy they
 * belong to; refreshing has to find a token by its hash; registering creates a
 * pharmacy that has no session yet. Nothing else needs this, and it unlocks
 * nothing else: no patient record, no stock, no sale. The `finally` closes it
 * again on the same connection, so it cannot outlive the lookup it was opened
 * for.
 */
const withAuthLookup = async (fn) => {
  const scope = currentScope();
  if (!scope) {
    throw new Error(
      'withAuthLookup was called outside a request scope. Sign-in lookups must run inside ' +
        'one, or they would touch an arbitrary pooled connection.'
    );
  }

  scope.authLookup = true;
  if (scope.client) await applyScope(scope.client, scope);

  try {
    return await fn();
  } finally {
    scope.authLookup = false;
    if (scope.client) {
      // If this fails the connection is dirty. Losing it is the safe outcome,
      // so mark it and let the release path destroy it.
      await applyScope(scope.client, scope).catch(() => {
        scope.dirty = true;
      });
    }
  }
};

// Ends the request's hold on its connection. Called when the response closes,
// including when the client hung up mid-request.
const releaseScope = async (scope) => {
  const held = scope?.client;
  if (!held) return;
  scope.client = null;

  if (scope.dirty) {
    held.release(new Error('connection left in an unknown state'));
    return;
  }

  try {
    // DISCARD ALL clears the session variables this request set. It also
    // refuses to run inside an open transaction — which is exactly what should
    // happen if a controller leaked one: the connection is destroyed below
    // rather than returned to the pool mid-transaction.
    await held.query('DISCARD ALL');
    held.release();
  } catch (err) {
    held.release(err);
  }
};

// ---------------------------------------------------------------------------
// Query entry points
// ---------------------------------------------------------------------------
const query = async (text, params) => {
  if (!dbAvailable) {
    throw new Error('Database not available');
  }

  const scope = currentScope();
  // Outside a request — the boot-time checks, the health probe — there is no
  // tenant, and a query issued there sees nothing. That is intentional: it
  // fails closed rather than quietly running unscoped.
  if (!scope) return pool.query(text, params);

  const client = await acquire(scope);
  return client.query(text, params);
};

/**
 * A client for a multi-statement transaction.
 *
 * Inside a request this is the request's own connection, already carrying the
 * tenant, so `release()` is a no-op: the request owns it and gives it back when
 * the response ends. Returning it to the pool here would hand a connection
 * still holding a tenant to whoever asked next.
 */
const connect = async () => {
  if (!dbAvailable) {
    throw new Error('Database not available');
  }

  const scope = currentScope();
  if (!scope) return pool.connect();

  const client = await acquire(scope);
  return {
    query: (...args) => client.query(...args),
    release: () => {}
  };
};

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const checkDbConnection = async () => {
  try {
    const client = await pool.connect();
    console.log(`✅ Successfully connected to PostgreSQL (${process.env.DB_NAME || 'pharmacy_pos'})`);
    client.release();
    dbAvailable = true;
    return true;
  } catch (err) {
    console.warn('\n=========================================');
    console.warn('WARNING: Could not connect to PostgreSQL database!');
    console.warn('Reason:', err.message);
    console.warn('=========================================\n');
    dbAvailable = false;
    return false;
  }
};

const DOCS = path.join(__dirname, '../../../Docs/Elaboration');

/**
 * Reports whether row-level security is actually in force, rather than merely
 * installed.
 *
 * Three separate things have to hold, and each has been the way this kind of
 * change fails silently elsewhere:
 *   * the connecting role is not a superuser and holds no BYPASSRLS, or every
 *     policy is ignored;
 *   * every table has RLS enabled, or the one that does not is readable across
 *     the whole platform;
 *   * and a real query with no tenant set returns nothing, which is the only
 *     one of the three that tests the mechanism end to end.
 */
const verifyRlsEnforced = async () => {
  const role = await pool.query(
    'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
  );
  const { rolsuper, rolbypassrls } = role.rows[0] || {};

  const unprotected = await pool.query(`
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
     ORDER BY c.relname
  `);

  // No tenant is set on this connection, so a scoped table must answer with
  // nothing whatever it holds.
  const leak = await pool.query('SELECT COUNT(*)::int AS n FROM customers');

  return {
    roleIsSuperuser: Boolean(rolsuper),
    roleBypassesRls: Boolean(rolbypassrls),
    tablesWithoutRls: unprotected.rows.map((r) => r.relname),
    rowsVisibleWithoutATenant: leak.rows[0].n,
    enforced:
      !rolsuper &&
      !rolbypassrls &&
      unprotected.rows.length === 0 &&
      leak.rows[0].n === 0
  };
};

const applyFile = async (executor, file) => {
  const full = path.join(DOCS, file);
  if (!fs.existsSync(full)) throw new Error(`Missing ${file} in Docs/Elaboration`);
  await executor.query(fs.readFileSync(full, 'utf8'));
};

const initDb = async () => {
  let admin;

  if (!(await checkDbConnection())) {
    // A database that has never been provisioned has no `pharmacy_app` role, so
    // the first connection attempt cannot succeed by definition. Create the role
    // with the owner's credentials and try once more. If the database is
    // genuinely down this fails too, and the server carries on reporting itself
    // as degraded rather than pretending otherwise.
    try {
      admin = new Pool(adminConfig());
      await ensureAppRole(admin, process.env.DB_PASSWORD || 'pharmacy_app_dev');
      console.log(`🔄 Created the application role ${APP_ROLE} on a database that had none.`);
    } catch (err) {
      console.warn('Could not provision the application role:', err.message);
    }

    if (!(await checkDbConnection())) {
      if (admin) await admin.end().catch(() => {});
      return;
    }
  }

  try {
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
      );
    `);

    const tablesExist = tableCheck.rows[0].exists;

    if (!tablesExist) {
      console.log('🔄 First run detected. Initializing database schema & seed data...');
      // Creating tables, seeding them, and installing policies are the owner's
      // work, not the application's. The application role has no privilege to
      // do any of it, which is the point.
      admin = new Pool(adminConfig());

      await applyFile(admin, 'schema_postgres.sql');
      console.log('✅ Database schema created successfully');

      // The seed is demonstration data: named pharmacies, and staff accounts
      // whose password is published in the demo script. Applying it to a
      // production database on first boot would create real, reachable logins
      // with a known password, so it is withheld there unless asked for
      // explicitly. The schema above is always applied — an empty database is
      // a usable one, a database seeded with known credentials is not.
      const seedAllowed = process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO_DATA === 'true';
      const seedPath = path.join(DOCS, 'seed_data.sql');

      if (!fs.existsSync(seedPath)) {
        // nothing to seed
      } else if (!seedAllowed) {
        console.log('↩️  Seed data withheld in production. Set SEED_DEMO_DATA=true to load it.');
      } else {
        await applyFile(admin, 'seed_data.sql');
        console.log('✅ Initial seed data inserted successfully');
      }
    } else {
      console.log('✅ Database schema verified (Tables intact)');
    }

    // Checked on every boot, installed only when it is missing.
    //
    // A database restored from a backup, or migrated by hand, must not come up
    // without its policies — but re-running the DDL on every start would take an
    // exclusive lock on twenty-five tables each time, which is a cost paid
    // forever to fix a problem that is nearly always absent. So: verify, and
    // repair only if verification says there is something to repair.
    // A database that has only just been created has no policies and has not
    // granted the application role anything yet, so there is nothing to verify:
    // install first, then check the result.
    let rls = tablesExist ? await verifyRlsEnforced() : null;

    if (!rls || (!rls.enforced && !rls.roleIsSuperuser && !rls.roleBypassesRls)) {
      console.log('🔄 Row-level security is not installed. Installing it now...');
      admin = admin || new Pool(adminConfig());
      await ensureAppRole(admin, process.env.DB_PASSWORD || 'pharmacy_app_dev');
      await applyFile(admin, 'rls_policies.sql');
      rls = await verifyRlsEnforced();
    }

    if (rls.enforced) {
      console.log('✅ Row-level security in force (tenant isolation enforced by the database)');
    } else {
      // Loudly, and in production fatally. The whole failure mode this guards
      // against is protection that looks present and does nothing, so it must
      // never be a line somebody scrolls past.
      const detail = [
        rls.roleIsSuperuser && 'the connecting role is a SUPERUSER, which bypasses every policy',
        rls.roleBypassesRls && 'the connecting role holds BYPASSRLS',
        rls.tablesWithoutRls.length && `these tables have no policy: ${rls.tablesWithoutRls.join(', ')}`,
        rls.rowsVisibleWithoutATenant > 0 &&
          `a connection with no tenant set can still read ${rls.rowsVisibleWithoutATenant} patient rows`
      ]
        .filter(Boolean)
        .join('; ');

      const message = `Row-level security is NOT being enforced: ${detail}.`;
      if (process.env.NODE_ENV === 'production') throw new Error(message);
      console.error(`\n❌ ${message}\n`);
    }
  } catch (err) {
    console.error('Error preparing the database:', err.message);
    if (process.env.NODE_ENV === 'production') throw err;
  } finally {
    if (admin) await admin.end().catch(() => {});
  }
};

// Several controllers used to answer with invented data when PostgreSQL was
// unreachable — a queue of fabricated patients, a prescription that was never
// written. That was meant as demo resilience and it is the most dangerous kind
// of bug: an outage presents as working software, which is precisely what a
// health check exists to prevent. The fallbacks are gone. A controller that
// cannot reach the database says so.
const unavailable = (res) =>
  res.status(503).json({
    error: 'DATABASE_UNAVAILABLE',
    message: 'The database is not reachable, so this request cannot be answered.'
  });

module.exports = {
  // The raw pool. Reserved for the health probe and for the test suite; a
  // controller reaching for it would escape the request's tenant scope, which
  // the project-invariants CI job checks for.
  pool,
  query,
  connect,
  initDb,
  isDbAvailable: () => dbAvailable,
  unavailable,
  // Request scope
  runInScope,
  currentScope,
  setTenantScope,
  withAuthLookup,
  releaseScope,
  verifyRlsEnforced,
  adminConfig
};
