const db = require('../config/db');

// A patient's passage through the clinic side of the pharmacy. The queue was
// previously a board of hand-set labels: any signed-in user could set any
// status, "TRIAGE" was never set by anything, and there was no state between
// the consulting room and the till. It is now a workflow — each transition is
// made by the person whose job it is, and the system advances the visit as the
// work is actually done.
const VISIT_STATUSES = ['WAITING', 'TRIAGE', 'IN_PROGRESS', 'DISPENSING', 'COMPLETED', 'CANCELLED'];

// Which statuses a visit may move to from where it is. A patient cannot be
// sent to the counter before anyone has seen them, and a closed visit does not
// reopen.
const ALLOWED_TRANSITIONS = {
  WAITING: ['TRIAGE', 'IN_PROGRESS', 'CANCELLED'],
  TRIAGE: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DISPENSING', 'COMPLETED', 'CANCELLED'],
  DISPENSING: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};

// The prescriber record belonging to the signed-in user, where they are one.
// A doctor who works here holds an account; a doctor who wrote a prescription
// at a clinic elsewhere is a name on paper with no login.
const prescriberFor = async (userId, tenantId) => {
  const res = await db.query(
    'SELECT doctor_id FROM doctors WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );
  return res.rows[0]?.doctor_id || null;
};

// The pharmacy's prescribers. `has_account` is the field that matters: only a
// doctor with a linked login can be handed a queue, so the front desk needs to
// see which names are routable before it picks one. A referring doctor who
// wrote a prescription at a clinic elsewhere is a name on paper.
exports.getDoctors = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      `SELECT doctor_id, name, specialty, license_number,
              user_id IS NOT NULL AS has_account
       FROM doctors
       WHERE tenant_id = $1
       ORDER BY name ASC`,
      [tenantId]
    );

    res.json({ message: 'Doctors retrieved', data: result.rows });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getQueue = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { mine } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const params = [tenantId];
    let scope = '';

    // A doctor asking for their queue gets their own patients, not the whole
    // waiting room. Assignment is a hand-off, not a label.
    if (mine === 'true') {
      const doctorId = await prescriberFor(userId, tenantId);
      if (!doctorId) {
        return res.status(403).json({
          error: 'Only a prescriber with a linked account has a queue of their own'
        });
      }
      params.push(doctorId);
      scope = ` AND v.doctor_id = $${params.length}`;
    }

    // Today's visits only. Yesterday's numbering does not carry forward, so a
    // queue number means something at the counter.
    // The most recent vitals travel with the queue row. The screen used to read
    // a `vitals` property this query never returned, so every visit displayed
    // "Vitals Pending" however many readings had been taken (DEF-045).
    const result = await db.query(`
      SELECT v.*, c.name as patient_name, c.phone as patient_phone,
             d.name as doctor_name,
             (SELECT COUNT(*)::int FROM vitals vi WHERE vi.visit_id = v.visit_id) AS vitals_count,
             to_jsonb(lv) - 'visit_id' AS latest_vitals
      FROM visits v
      JOIN customers c ON v.customer_id = c.customer_id
      LEFT JOIN doctors d ON d.doctor_id = v.doctor_id
      LEFT JOIN LATERAL (
        SELECT vi.visit_id, vi.bp, vi.heart_rate, vi.temperature, vi.spo2, vi.weight, vi.created_at
        FROM vitals vi
        WHERE vi.visit_id = v.visit_id
        ORDER BY vi.created_at DESC
        LIMIT 1
      ) lv ON TRUE
      WHERE v.tenant_id = $1 AND DATE(v.date) = CURRENT_DATE${scope}
      ORDER BY v.queue_number ASC
    `, params);

    res.json({ message: 'Queue retrieved', data: result.rows, scoped_to_me: mine === 'true' });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(`
      SELECT status, COUNT(*) as count
      FROM visits
      WHERE tenant_id = $1 AND DATE(date) = CURRENT_DATE
      GROUP BY status
    `, [tenantId]);

    res.json({ message: 'Stats retrieved', data: result.rows });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Reception. Anyone at the front desk may register an arrival.
exports.createVisit = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { customerId, reason } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);
    if (!customerId) return res.status(400).json({ error: 'A patient is required to open a visit' });

    // The patient must be this pharmacy's before a visit can be opened for
    // them; the foreign key alone only proves the row exists somewhere.
    const owned = await db.query(
      'SELECT 1 FROM customers WHERE customer_id = $1 AND tenant_id = $2',
      [customerId, tenantId]
    );
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found for this pharmacy' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Read the current maximum and insert in the same transaction, so two
      // arrivals at once cannot take the same queue number.
      const qRes = await client.query(
        'SELECT COALESCE(MAX(queue_number), 0) + 1 as next_q FROM visits WHERE tenant_id = $1 AND DATE(date) = CURRENT_DATE',
        [tenantId]
      );

      const result = await client.query(
        'INSERT INTO visits (tenant_id, customer_id, reason, status, queue_number) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [tenantId, customerId, reason, 'WAITING', qRes.rows[0].next_q]
      );

      await client.query('COMMIT');
      return res.status(201).json({ message: 'Visit created', data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { status } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);
    if (!VISIT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${VISIT_STATUSES.join(', ')}` });
    }

    const current = await db.query(
      'SELECT status FROM visits WHERE visit_id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    // No matching row means the visit is missing or belongs to another
    // pharmacy. This previously returned 200 with an undefined body, reporting
    // a status change that never happened.
    if (current.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });

    const from = current.rows[0].status;
    if (!ALLOWED_TRANSITIONS[from].includes(status)) {
      return res.status(409).json({
        error: `A visit that is ${from.toLowerCase().replace(/_/g, ' ')} cannot move to ${status.toLowerCase().replace(/_/g, ' ')}`
      });
    }

    // Closing time is decided here rather than in a CASE over the same
    // placeholder: reusing $1 both as the assigned value and inside an IN list
    // makes Postgres deduce two different types for one parameter and reject
    // the statement.
    const closesVisit = status === 'COMPLETED' || status === 'CANCELLED';

    const result = await db.query(
      `UPDATE visits SET status = $1,
         completed_at = COALESCE($2::timestamptz, completed_at)
       WHERE visit_id = $3 AND tenant_id = $4 RETURNING *`,
      [status, closesVisit ? new Date() : null, id, tenantId]
    );

    res.json({ message: 'Status updated', data: result.rows[0] });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignDoctor = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { doctorId } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);
    if (!doctorId) return res.status(400).json({ error: 'A doctor is required' });

    // Only a prescriber who works here can be handed a queue. Assigning a
    // referring doctor with no account would route a patient to nobody.
    const doctor = await db.query(
      'SELECT name, user_id FROM doctors WHERE doctor_id = $1 AND tenant_id = $2',
      [doctorId, tenantId]
    );
    if (doctor.rows.length === 0) {
      return res.status(404).json({ error: 'Doctor not found for this pharmacy' });
    }
    if (!doctor.rows[0].user_id) {
      return res.status(400).json({
        error: `${doctor.rows[0].name} has no account here, so a patient cannot be routed to them`
      });
    }

    const result = await db.query(
      `UPDATE visits SET doctor_id = $1, status = 'IN_PROGRESS'
       WHERE visit_id = $2 AND tenant_id = $3 AND status IN ('WAITING','TRIAGE')
       RETURNING *`,
      [doctorId, id, tenantId]
    );

    if (result.rows.length === 0) {
      const exists = await db.query('SELECT status FROM visits WHERE visit_id = $1 AND tenant_id = $2', [id, tenantId]);
      if (exists.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });
      return res.status(409).json({
        error: `This visit is already ${exists.rows[0].status.toLowerCase().replace(/_/g, ' ')}`
      });
    }

    res.json({ message: 'Doctor assigned', data: result.rows[0] });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Triage proper. Recording vitals is the triage step, so it moves the visit
// rather than leaving someone to remember to set the status afterwards.
exports.recordVitals = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;
    const { bp, heartRate, temperature, spo2, weight } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const vRes = await client.query(
        'SELECT customer_id, status FROM visits WHERE visit_id = $1 AND tenant_id = $2 FOR UPDATE',
        [id, tenantId]
      );
      if (vRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Visit not found' });
      }
      if (['COMPLETED', 'CANCELLED'].includes(vRes.rows[0].status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'This visit is closed' });
      }

      const result = await client.query(
        `INSERT INTO vitals (tenant_id, visit_id, customer_id, bp, heart_rate, temperature, spo2, weight, recorded_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [tenantId, id, vRes.rows[0].customer_id, bp, heartRate, temperature, spo2, weight, userId]
      );

      // Taking vitals *is* the triage step.
      if (vRes.rows[0].status === 'WAITING') {
        await client.query("UPDATE visits SET status = 'TRIAGE' WHERE visit_id = $1", [id]);
      }

      await client.query('COMMIT');
      return res.json({ message: 'Vitals recorded', data: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// The consultation outcome, recorded by the clinician who saw the patient, and
// the hand-off to the dispensing counter.
exports.recordAssessment = async (req, res) => {
  try {
    const { tenantId, userId, role } = req.user;
    const { id } = req.params;
    const { assessment, sendToDispensary = true } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);
    if (!assessment) return res.status(400).json({ error: 'An assessment is required' });

    const visit = await db.query(
      'SELECT status, doctor_id FROM visits WHERE visit_id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (visit.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });
    if (visit.rows[0].status !== 'IN_PROGRESS') {
      return res.status(409).json({ error: 'Only a visit in progress can be assessed' });
    }

    // A doctor may only write up their own consultations. An Admin or
    // Pharmacist can record on behalf of one who saw the patient on paper.
    if (role === 'Doctor') {
      const doctorId = await prescriberFor(userId, tenantId);
      if (visit.rows[0].doctor_id !== doctorId) {
        return res.status(403).json({ error: 'This patient was not assigned to you' });
      }
    }

    const nextStatus = sendToDispensary ? 'DISPENSING' : 'COMPLETED';

    const result = await db.query(
      `UPDATE visits SET assessment = $1, status = $2,
         completed_at = COALESCE($3::timestamptz, completed_at)
       WHERE visit_id = $4 AND tenant_id = $5 RETURNING *`,
      [assessment, nextStatus, nextStatus === 'COMPLETED' ? new Date() : null, id, tenantId]
    );

    res.json({
      message: sendToDispensary
        ? 'Assessment recorded, patient sent to the counter'
        : 'Assessment recorded, visit closed',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getVisit = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const visitRes = await db.query(`
      SELECT v.*, c.name as patient_name, d.name as doctor_name
      FROM visits v
      JOIN customers c ON c.customer_id = v.customer_id
      LEFT JOIN doctors d ON d.doctor_id = v.doctor_id
      WHERE v.visit_id = $1 AND v.tenant_id = $2
    `, [id, tenantId]);
    if (visitRes.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });

    const vitalsRes = await db.query('SELECT * FROM vitals WHERE visit_id = $1 ORDER BY created_at DESC', [id]);
    const rxRes = await db.query(
      'SELECT prescription_id, status, created_at FROM prescriptions WHERE visit_id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    res.json({
      message: 'Visit retrieved',
      data: {
        ...visitRes.rows[0],
        vitals: vitalsRes.rows[0] || null,
        vitals_history: vitalsRes.rows,
        prescriptions: rxRes.rows
      }
    });
  } catch (error) {
    console.error('Triage controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports.VISIT_STATUSES = VISIT_STATUSES;
module.exports.ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS;
