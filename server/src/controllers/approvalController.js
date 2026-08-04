const db = require('../config/db');
const readiness = require('../services/onboardingReadiness');

// Maker-checker. Sensitive platform actions are proposed by one administrator
// and carried out only once a different one approves. The rule that matters is
// that the requester can never be the approver: a single compromised or
// mistaken account cannot both propose and enact a change.

// Actions that may be routed through approval, and how each is applied once
// approved. Anything not listed here is refused outright rather than executed.
const ACTIONS = {
  SUSPEND_TENANT: {
    label: 'Suspend a pharmacy',
    apply: (client, payload) =>
      client.query('UPDATE tenants SET status = $1 WHERE tenant_id = $2', ['REJECTED', payload.tenant_id])
  },
  ACTIVATE_TENANT: {
    label: 'Activate a pharmacy',
    // Approval by a second operator is not a substitute for the paperwork. The
    // guard runs on the same transaction client as the change it would permit,
    // so the documents cannot be altered between the check and the update.
    guard: (client, payload) => readiness.blockingReason(payload.tenant_id, client),
    apply: (client, payload) =>
      client.query('UPDATE tenants SET status = $1 WHERE tenant_id = $2', ['ACTIVE', payload.tenant_id])
  },
  DEACTIVATE_USER: {
    label: 'Deactivate a staff account',
    apply: (client, payload) =>
      client.query('UPDATE users SET is_active = FALSE WHERE user_id = $1', [payload.user_id])
  }
};

exports.getActions = (req, res) => {
  res.json({
    message: 'Approvable actions retrieved',
    data: Object.entries(ACTIONS).map(([action, { label }]) => ({ action, label }))
  });
};

exports.createRequest = async (req, res) => {
  try {
    const { userId } = req.user;
    const { action, payload, reason, tenant_id } = req.body;

    if (!action || !ACTIONS[action]) {
      return res.status(400).json({ error: 'Unknown action. It cannot be routed for approval.' });
    }
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'A payload describing the change is required' });
    }
    if (!reason) {
      return res.status(400).json({ error: 'A reason is required so the approver can judge the request' });
    }

    const result = await db.query(
      `INSERT INTO approval_requests (tenant_id, action, payload, reason, requested_by_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenant_id || payload.tenant_id || null, action, JSON.stringify(payload), reason, userId]
    );

    res.status(201).json({ message: 'Request submitted for approval', data: result.rows[0] });
  } catch (error) {
    console.error('Approval controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getRequests = async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let query = `
      SELECT r.*,
             requester.full_name AS requested_by_name,
             decider.full_name AS decided_by_name,
             t.name AS tenant_name
      FROM approval_requests r
      JOIN users requester ON requester.user_id = r.requested_by_id
      LEFT JOIN users decider ON decider.user_id = r.decided_by_id
      LEFT JOIN tenants t ON t.tenant_id = r.tenant_id`;

    if (status) {
      params.push(status);
      query += ` WHERE r.status = $${params.length}`;
    }
    query += ' ORDER BY r.requested_at DESC';

    const result = await db.query(query, params);
    res.json({ message: 'Approval requests retrieved', data: result.rows });
  } catch (error) {
    console.error('Approval controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.decide = async (req, res) => {
  try {
    const { userId } = req.user;
    const { id } = req.params;
    const { decision, decision_notes } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be APPROVED or REJECTED' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Locked for the duration so two approvers cannot both decide the same
      // request and apply the action twice.
      const found = await client.query(
        'SELECT * FROM approval_requests WHERE request_id = $1 FOR UPDATE',
        [id]
      );

      if (found.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Approval request not found' });
      }

      const request = found.rows[0];

      if (request.status !== 'PENDING') {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: `This request was already ${request.status.toLowerCase()}` });
      }

      // The rule the whole mechanism exists for.
      if (request.requested_by_id === userId) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'You raised this request, so it must be decided by a different administrator'
        });
      }

      if (decision === 'APPROVED') {
        const action = ACTIONS[request.action];

        // An action may refuse to be applied even once approved. A refusal is
        // the caller's answer, not a fault, so it rolls back and reports why
        // rather than surfacing as a server error.
        if (action.guard) {
          const blocked = await action.guard(client, request.payload);
          if (blocked) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: blocked });
          }
        }

        await action.apply(client, request.payload);
      }

      const updated = await client.query(
        `UPDATE approval_requests
         SET status = $1, decided_by_id = $2, decision_notes = $3, decided_at = NOW()
         WHERE request_id = $4 RETURNING *`,
        [decision, userId, decision_notes || null, id]
      );

      await client.query('COMMIT');
      return res.json({
        message: decision === 'APPROVED' ? 'Request approved and applied' : 'Request rejected',
        data: updated.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Approval controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
