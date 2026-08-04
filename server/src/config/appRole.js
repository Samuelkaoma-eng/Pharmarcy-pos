// Provisioning the role the application actually connects as.
//
// Row-level security is only worth installing if the connecting role is
// subject to it. A superuser — which is what `postgres` is, and what the
// Railway Postgres plugin hands out — bypasses every policy unconditionally,
// and `FORCE ROW LEVEL SECURITY` does not change that. The policies would
// install cleanly, the suite would stay green, and nothing at all would be
// enforced.
//
// So the role is created here without superuser and without BYPASSRLS, and
// those attributes are re-stated on every run rather than only at creation.
// The protection rests entirely on them; leaving them to whatever a previous
// run happened to set would make the guarantee depend on history.

const APP_ROLE = 'pharmacy_app';

// Fixed, not configurable. rls_policies.sql names this role in its GRANTs and
// in the check that refuses to install policies the role could bypass, and a
// policy naming a role from an environment variable is a policy nobody can
// read and verify.
const ensureAppRole = async (adminExecutor, password) => {
  if (!password) {
    throw new Error(
      'No password supplied for the application database role. Set DB_PASSWORD (the ' +
        'credentials the server connects with) before provisioning.'
    );
  }

  await adminExecutor.query(`
    DO $ensure$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN;
      END IF;
    END
    $ensure$;
  `);

  // ALTER ROLE will not take a bind parameter for a password, so the literal is
  // quoted by PostgreSQL's own format(%L) rather than by string concatenation
  // here.
  const { rows } = await adminExecutor.query(
    `SELECT format(
       'ALTER ROLE ${APP_ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L',
       $1::text
     ) AS statement`,
    [password]
  );
  await adminExecutor.query(rows[0].statement);

  return APP_ROLE;
};

module.exports = { APP_ROLE, ensureAppRole };
