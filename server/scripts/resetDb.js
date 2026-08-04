// Drops and rebuilds the pharmacy_pos database from the Elaboration artefacts.
// The schema file already begins with DROP TABLE ... CASCADE, so running this
// is destructive by design and is only intended for local and CI databases.
//
// It connects as the OWNER (DB_ADMIN_USER), not as the role the server runs
// under. Creating tables, seeding them and installing row-level security are
// exactly the operations the application role is not permitted to perform.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { APP_ROLE, ensureAppRole } = require('../src/config/appRole');

const DOCS = path.join(__dirname, '../../Docs/Elaboration');

const pool = new Pool({
  user: process.env.DB_ADMIN_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'pharmacy_pos',
  password: process.env.DB_ADMIN_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10)
});

const run = async (label, file) => {
  const full = path.join(DOCS, file);
  if (!fs.existsSync(full)) {
    throw new Error(`Missing ${file} in Docs/Elaboration`);
  }
  await pool.query(fs.readFileSync(full, 'utf8'));
  console.log(`${label} applied from ${file}`);
};

(async () => {
  try {
    await run('Schema', 'schema_postgres.sql');
    // Seeded before the policies go on, so the demonstration data is written by
    // the owner rather than fighting its way past rules meant for the
    // application.
    await run('Seed data', 'seed_data.sql');

    // The role the server connects as. Recreated here rather than assumed,
    // because the whole guarantee rests on it having neither SUPERUSER nor
    // BYPASSRLS, and rls_policies.sql refuses to install if it has either.
    await ensureAppRole(pool, process.env.DB_PASSWORD || 'pharmacy_app_dev');
    console.log(`Application role ${APP_ROLE} provisioned (no superuser, no BYPASSRLS)`);

    await run('Row-level security', 'rls_policies.sql');

    console.log('Database reset complete');
  } catch (err) {
    console.error('Database reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
