const { Pool } = require('pg');
const { pool: applicationPool, adminConfig } = require('../../config/db');

// The connection the tests arrange and inspect the database with.
//
// Since row-level security went on, the pool the *server* uses belongs to
// `pharmacy_app`: a role with no tenant set sees no rows at all, which is the
// entire point. A test that arranged its fixtures through that pool would write
// nothing and read nothing back, and — worse — a test that checked isolation
// from inside the boundary it is checking would prove nothing.
//
// So setup and out-of-band verification connect as the owner, from outside the
// boundary. Every assertion about what a *pharmacy* can see still goes through
// the API, where the boundary applies.
const pool = new Pool(adminConfig());

// Both pools have to be closed or Jest reports an open handle. The application
// pool is the server's, so the tests do not own it — they only have to let go
// of it at the end of the run.
const closeAll = async () => {
  await pool.end();
  await applicationPool.end();
};

module.exports = { pool, closeAll };
