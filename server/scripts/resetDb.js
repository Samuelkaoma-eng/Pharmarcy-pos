// Drops and rebuilds the pharmacy_pos database from the Elaboration artefacts.
// The schema file already begins with DROP TABLE ... CASCADE, so running this
// is destructive by design and is only intended for local and CI databases.
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DOCS = path.join(__dirname, '../../Docs/Elaboration');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'pharmacy_pos',
  password: process.env.DB_PASSWORD || 'password',
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
    await run('Seed data', 'seed_data.sql');
    console.log('Database reset complete');
  } catch (err) {
    console.error('Database reset failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
