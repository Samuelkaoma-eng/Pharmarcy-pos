const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME || 'pharmacy_pos',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

let dbAvailable = true;

const checkDbConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Successfully connected to PostgreSQL (pharmacy_pos)');
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

const initDb = async () => {
  if (!(await checkDbConnection())) return;

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
      const schemaPath = path.join(__dirname, '../../../Docs/Elaboration/schema_postgres.sql');
      const seedPath = path.join(__dirname, '../../../Docs/Elaboration/seed_data.sql');

      if (fs.existsSync(schemaPath)) {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schema);
        console.log('✅ Database schema created successfully');
      }

      if (fs.existsSync(seedPath)) {
        const seed = fs.readFileSync(seedPath, 'utf8');
        await pool.query(seed);
        console.log('✅ Initial seed data inserted successfully');
      }
    } else {
      console.log('✅ Database schema verified (Tables intact)');
    }
  } catch (err) {
    console.error('Error verifying database schema:', err.message);
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
  pool,
  query: (text, params) => {
    if (!dbAvailable) {
      throw new Error('Database not available');
    }
    return pool.query(text, params);
  },
  initDb,
  isDbAvailable: () => dbAvailable,
  unavailable,
};
