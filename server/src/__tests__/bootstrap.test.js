const { Pool } = require('pg');
const { adminConfig } = require('../config/db');
const { pool, closeAll } = require('./helpers/adminDb');

// How the server decides whether a database has already been set up.
//
// `initDb` asks whether the tables exist, and if the answer is no it applies
// schema_postgres.sql — which opens with DROP TABLE ... CASCADE. So the cost of
// that question being answered wrongly is the whole database, and it was
// answered wrongly: the check used `information_schema.tables`, which is
// privilege-filtered. It shows a role only the tables it holds some privilege
// on, and on the one boot that matters — the boot that first installs the
// policies, before rls_policies.sql has granted the application role anything —
// that is no tables at all.
//
// It emptied a seeded database on the first production-mode boot of this
// change, and it would have done the same to the deployed one. pg_class is the
// catalog itself and is readable whatever the privileges, so it answers what is
// actually there rather than what the caller is allowed to touch.
describe('Detecting an already-initialised database', () => {
  const PROBE_ROLE = 'pharmacy_bootstrap_probe';
  const PROBE_PASSWORD = 'bootstrap_probe_only';
  let probe;

  beforeAll(async () => {
    // A role in exactly the state the application role is in on that boot:
    // able to log in, granted nothing.
    await pool.query(`
      DO $probe$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PROBE_ROLE}') THEN
          CREATE ROLE ${PROBE_ROLE} LOGIN;
        END IF;
      END
      $probe$;
    `);
    const { rows } = await pool.query(
      `SELECT format('ALTER ROLE ${PROBE_ROLE} WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD %L', $1::text) AS statement`,
      [PROBE_PASSWORD]
    );
    await pool.query(rows[0].statement);

    probe = new Pool({ ...adminConfig(), user: PROBE_ROLE, password: PROBE_PASSWORD });
  });

  afterAll(async () => {
    if (probe) await probe.end();
    await pool.query(`DROP OWNED BY ${PROBE_ROLE}`).catch(() => {});
    await pool.query(`DROP ROLE IF EXISTS ${PROBE_ROLE}`).catch(() => {});
    await closeAll();
  });

  it('sees the existing tables through the catalogue, granted nothing', async () => {
    const res = await probe.query(`
      SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = 'tenants'
      ) AS exists;
    `);

    expect(res.rows[0].exists).toBe(true);
  });

  it('is the answer information_schema would not have given', async () => {
    // This is the assertion that makes the test above mean something. If this
    // ever starts returning true, the two sources agree and the original check
    // was harmless after all — which would be worth knowing, because the whole
    // reason the query changed was that they disagree precisely here.
    const res = await probe.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'tenants'
      ) AS exists;
    `);

    expect(res.rows[0].exists).toBe(false);
  });

  it('refuses the unprivileged role the rows themselves', async () => {
    // Seeing that a table exists is not permission to read it. Worth pinning:
    // if this ever passes, the probe role has been granted something and the
    // first test is no longer testing the case it was written for.
    await expect(probe.query('SELECT 1 FROM customers LIMIT 1')).rejects.toThrow(/permission denied/i);
  });
});
