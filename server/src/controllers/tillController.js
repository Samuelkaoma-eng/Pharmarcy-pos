const db = require('../config/db');

// A shift at a till: the float that went in, the takings the system recorded,
// the cash actually counted at the end, and the difference between the last two.
//
// Until this existed a sale belonged to a cashier but not to a shift, so a
// drawer could be short and nothing in the system would say so (LIM-004). The
// Inception business case set out to reduce stock and cash losses, and this is
// the control that makes a loss visible.
//
// The rule the whole thing rests on: expected cash is computed here, from the
// payments actually recorded, and is never accepted from the client. If the
// cashier could declare what the drawer should hold, they could declare it to
// match whatever they counted, and the variance would always be zero.

// Only cash reaches the drawer. Card, mobile and insurance settlements are
// recorded against the sale but never put a note in the till, so counting them
// towards expected cash would manufacture a shortfall on every honest shift.
const DRAWER_PAYMENT_TYPE = 'cash';

// Reconciliation figures for one session, computed from what was recorded.
const takingsFor = async (executor, sessionId, tenantId) => {
  const result = await executor.query(
    `SELECT
       COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = $3), 0) AS cash_taken,
       COALESCE(SUM(p.amount), 0)                                    AS total_taken,
       COUNT(DISTINCT s.sale_id)                                     AS sale_count
     FROM sales s
     JOIN payments p ON p.sale_id = s.sale_id
     WHERE s.till_session_id = $1
       AND s.tenant_id = $2
       AND s.status = 'COMPLETED'`,
    [sessionId, tenantId, DRAWER_PAYMENT_TYPE]
  );

  const row = result.rows[0];
  return {
    cashTaken: parseFloat(row.cash_taken),
    totalTaken: parseFloat(row.total_taken),
    saleCount: parseInt(row.sale_count, 10)
  };
};

// The caller's open session, if they have one. Used by the sale path as well as
// by this controller, so it is exported rather than duplicated.
const openSessionFor = async (executor, userId, tenantId) => {
  const result = await executor.query(
    `SELECT till_session_id, opening_float, opened_at
     FROM till_sessions
     WHERE tenant_id = $1 AND user_id = $2 AND status = 'OPEN'`,
    [tenantId, userId]
  );
  return result.rows[0] || null;
};

exports.getCurrent = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    if (!db.isDbAvailable()) return db.unavailable(res);

    const session = await openSessionFor(db, userId, tenantId);
    if (!session) {
      // Not an error. Most of the day a given cashier has no shift open, and
      // the screen needs to be able to say so plainly.
      return res.json({ message: 'No till session is open', data: null });
    }

    const takings = await takingsFor(db, session.till_session_id, tenantId);
    const openingFloat = parseFloat(session.opening_float);

    res.json({
      message: 'Open till session retrieved',
      data: {
        till_session_id: session.till_session_id,
        opened_at: session.opened_at,
        opening_float: openingFloat,
        sale_count: takings.saleCount,
        cash_taken: takings.cashTaken,
        total_taken: takings.totalTaken,
        // What the drawer should hold right now. Shown live so a cashier can
        // spot a problem during the shift rather than at the end of it.
        expected_cash: openingFloat + takings.cashTaken
      }
    });
  } catch (error) {
    console.error('Till controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.open = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { opening_float, opening_notes } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const float = Number(opening_float);
    if (!Number.isFinite(float) || float < 0) {
      return res.status(400).json({ error: 'An opening float of zero or more is required' });
    }

    const result = await db.query(
      `INSERT INTO till_sessions (tenant_id, user_id, opening_float, opening_notes)
       VALUES ($1, $2, $3, $4)
       RETURNING till_session_id, opened_at, opening_float, status`,
      [tenantId, userId, float, opening_notes || null]
    );

    res.status(201).json({ message: 'Till session opened', data: result.rows[0] });
  } catch (error) {
    // The partial unique index is what actually prevents a second open session,
    // so a race between two clicks surfaces here rather than passing a check
    // and inserting anyway.
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'You already have a till session open. Close it before opening another.'
      });
    }
    console.error('Till controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.close = async (req, res) => {
  try {
    const { tenantId, userId, role } = req.user;
    const { id } = req.params;
    const { closing_count, closing_notes } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const counted = Number(closing_count);
    if (!Number.isFinite(counted) || counted < 0) {
      return res.status(400).json({ error: 'A counted closing cash amount of zero or more is required' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Locked so two people cannot close the same drawer and write two
      // different variances over each other.
      const found = await client.query(
        'SELECT * FROM till_sessions WHERE till_session_id = $1 AND tenant_id = $2 FOR UPDATE',
        [id, tenantId]
      );

      if (found.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Till session not found' });
      }

      const session = found.rows[0];

      if (session.status === 'CLOSED') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That till session is already closed' });
      }

      // A cashier closes their own drawer. An Admin may close anyone's, because
      // somebody has to be able to reconcile a shift whose cashier has gone home.
      const isOwner = session.user_id === userId;
      const isSupervisor = role === 'Admin' || role === 'SuperAdmin';
      if (!isOwner && !isSupervisor) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Only the cashier who opened this till, or an administrator, may close it' });
      }

      const takings = await takingsFor(client, session.till_session_id, tenantId);
      const openingFloat = parseFloat(session.opening_float);

      // Computed here, from what was recorded. Never taken from the request.
      const expectedCash = openingFloat + takings.cashTaken;
      // Negative means the drawer is short. Stored as it falls out.
      const variance = counted - expectedCash;

      const updated = await client.query(
        `UPDATE till_sessions
         SET status = 'CLOSED', closed_at = NOW(), closed_by_id = $1,
             closing_count = $2, expected_cash = $3, variance = $4, closing_notes = $5
         WHERE till_session_id = $6
         RETURNING *`,
        [userId, counted, expectedCash, variance, closing_notes || null, session.till_session_id]
      );

      await client.query('COMMIT');

      return res.json({
        message: 'Till session closed',
        data: {
          ...updated.rows[0],
          sale_count: takings.saleCount,
          cash_taken: takings.cashTaken,
          total_taken: takings.totalTaken
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Till controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const { tenantId, userId, role } = req.user;
    const { status } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const params = [tenantId];
    let where = 't.tenant_id = $1';

    // A cashier sees their own shifts. Supervisors see the whole floor, which
    // is the point: a variance is only useful to somebody who can act on it.
    if (role !== 'Admin' && role !== 'SuperAdmin') {
      params.push(userId);
      where += ` AND t.user_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      where += ` AND t.status = $${params.length}`;
    }

    const result = await db.query(
      `SELECT t.*,
              opener.full_name AS opened_by_name,
              closer.full_name AS closed_by_name
       FROM till_sessions t
       JOIN users opener ON opener.user_id = t.user_id
       LEFT JOIN users closer ON closer.user_id = t.closed_by_id
       WHERE ${where}
       ORDER BY t.opened_at DESC
       LIMIT 100`,
      params
    );

    res.json({ message: 'Till sessions retrieved', data: result.rows });
  } catch (error) {
    console.error('Till controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSession = async (req, res) => {
  try {
    const { tenantId, userId, role } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      `SELECT t.*,
              opener.full_name AS opened_by_name,
              closer.full_name AS closed_by_name
       FROM till_sessions t
       JOIN users opener ON opener.user_id = t.user_id
       LEFT JOIN users closer ON closer.user_id = t.closed_by_id
       WHERE t.till_session_id = $1 AND t.tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Till session not found' });

    const session = result.rows[0];
    if (session.user_id !== userId && role !== 'Admin' && role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'That till session belongs to another cashier' });
    }

    const takings = await takingsFor(db, session.till_session_id, tenantId);

    const sales = await db.query(
      `SELECT sale_id, receipt_number, date_time, total, status
       FROM sales
       WHERE till_session_id = $1 AND tenant_id = $2
       ORDER BY date_time ASC`,
      [id, tenantId]
    );

    res.json({
      message: 'Till session retrieved',
      data: {
        ...session,
        sale_count: takings.saleCount,
        cash_taken: takings.cashTaken,
        total_taken: takings.totalTaken,
        // For an open session this is the running figure; for a closed one it
        // is what was computed at close and stored.
        expected_cash:
          session.status === 'OPEN'
            ? parseFloat(session.opening_float) + takings.cashTaken
            : parseFloat(session.expected_cash),
        sales: sales.rows
      }
    });
  } catch (error) {
    console.error('Till controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports.openSessionFor = openSessionFor;
module.exports.DRAWER_PAYMENT_TYPE = DRAWER_PAYMENT_TYPE;
