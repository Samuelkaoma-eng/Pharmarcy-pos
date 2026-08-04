const db = require('../config/db');

// Gives every API request its own database connection, and takes it back when
// the response ends.
//
// The tenant now lives on the connection as `app.tenant_id`, which the
// row-level security policies read. That is only safe if a connection cannot
// carry one request's tenant into the next request that borrows it — so the
// release below is not housekeeping, it is the control. It runs on `close`,
// which fires whether the response completed normally or the client hung up
// halfway through.
//
// The scope starts empty. An unauthenticated request therefore has no tenant,
// and no tenant means no rows: the default is closed. `authenticate` fills it
// in once it has verified a token.
const dbContext = (req, res, next) => {
  db.runInScope(() => {
    const scope = db.currentScope();

    res.on('close', () => {
      db.releaseScope(scope).catch((err) => {
        console.error('Failed to release the request database connection:', err.message);
      });
    });

    next();
  });
};

module.exports = { dbContext };
