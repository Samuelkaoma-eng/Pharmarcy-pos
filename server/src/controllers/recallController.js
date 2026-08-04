const db = require('../config/db');
const simulator = require('../services/recallSimulator');

// Patient recall: bringing someone back for a check-up, a follow-up, or a
// repeat prescription. The list is real; the reminders are simulated and say
// so on every response.

exports.getStatus = (req, res) => {
  res.json({ message: 'Reminder service status', data: simulator.status() });
};

// What is due, overdue, or coming up.
exports.getRecalls = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { status, window } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const params = [tenantId];
    let filter = '';

    if (status) {
      params.push(status);
      filter += ` AND r.status = $${params.length}`;
    }
    if (window) {
      params.push(parseInt(window, 10));
      filter += ` AND r.due_date <= CURRENT_DATE + ($${params.length}::int || ' days')::interval`;
    }

    const result = await db.query(
      `SELECT r.*, c.name AS patient_name, c.phone AS patient_phone,
              (r.due_date < CURRENT_DATE) AS overdue
       FROM patient_recalls r
       JOIN customers c ON c.customer_id = r.customer_id
       WHERE r.tenant_id = $1${filter}
       ORDER BY r.due_date ASC`,
      params
    );

    res.json({ message: 'Recalls retrieved', data: result.rows });
  } catch (error) {
    console.error('Recall controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createRecall = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { customerId, reason, dueDate, visitId } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);
    if (!customerId || !reason || !dueDate) {
      return res.status(400).json({ error: 'A patient, a reason and a due date are all required' });
    }

    const owned = await db.query(
      'SELECT 1 FROM customers WHERE customer_id = $1 AND tenant_id = $2',
      [customerId, tenantId]
    );
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Patient not found for this pharmacy' });
    }

    if (visitId) {
      const visit = await db.query(
        'SELECT 1 FROM visits WHERE visit_id = $1 AND tenant_id = $2',
        [visitId, tenantId]
      );
      if (visit.rows.length === 0) {
        return res.status(404).json({ error: 'Visit not found for this pharmacy' });
      }
    }

    const result = await db.query(
      `INSERT INTO patient_recalls (tenant_id, customer_id, visit_id, reason, due_date, created_by_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, customerId, visitId || null, reason, dueDate, userId]
    );

    res.status(201).json({ message: 'Recall scheduled', data: result.rows[0] });
  } catch (error) {
    console.error('Recall controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Compose the reminder that would be sent. Sends nothing.
exports.simulateReminder = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const found = await db.query(
      `SELECT r.*, c.name AS patient_name, c.phone AS patient_phone,
              t.name AS pharmacy_name, t.currency_symbol
       FROM patient_recalls r
       JOIN customers c ON c.customer_id = r.customer_id
       JOIN tenants t ON t.tenant_id = r.tenant_id
       WHERE r.recall_id = $1 AND r.tenant_id = $2`,
      [id, tenantId]
    );
    if (found.rows.length === 0) return res.status(404).json({ error: 'Recall not found' });

    const recall = found.rows[0];

    if (recall.status === 'CANCELLED') {
      return res.status(409).json({ error: 'This recall was cancelled' });
    }
    if (recall.simulated_message_ref) {
      return res.status(409).json({
        error: 'A reminder has already been composed for this recall',
        data: { reference: recall.simulated_message_ref }
      });
    }
    if (!recall.patient_phone) {
      // A real campaign would fail here, so the simulation does too rather
      // than pretending a patient with no number could be reached.
      return res.status(400).json({
        error: 'This patient has no phone number on file, so no reminder could be addressed to them'
      });
    }

    const message = simulator.compose({
      patientName: recall.patient_name,
      pharmacyName: recall.pharmacy_name,
      reason: recall.reason,
      dueDate: recall.due_date,
      currency: recall.currency_symbol
    });

    const updated = await db.query(
      `UPDATE patient_recalls
       SET simulated_message_ref = $1, simulated_message_body = $2,
           simulated_sent_at = NOW(), status = 'REMINDED'
       WHERE recall_id = $3 AND tenant_id = $4 RETURNING *`,
      [message.reference, message.body, id, tenantId]
    );

    res.status(201).json({
      message: 'Reminder composed (simulated — nothing was sent)',
      data: { ...message, recall: updated.rows[0], to: recall.patient_phone }
    });
  } catch (error) {
    console.error('Recall controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateRecall = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { status } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const allowed = ['SCHEDULED', 'REMINDED', 'ATTENDED', 'MISSED', 'CANCELLED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    }

    const result = await db.query(
      'UPDATE patient_recalls SET status = $1 WHERE recall_id = $2 AND tenant_id = $3 RETURNING *',
      [status, id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Recall not found' });

    res.json({ message: 'Recall updated', data: result.rows[0] });
  } catch (error) {
    console.error('Recall controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
