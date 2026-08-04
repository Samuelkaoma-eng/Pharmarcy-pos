const bcrypt = require('bcryptjs');
const db = require('../config/db');
const audit = require('../services/auditLog');

// Roles a pharmacy administrator may hand out. SuperAdmin is deliberately not
// in this list: platform authority is never granted from inside a tenant.
const ASSIGNABLE_ROLES = ['Admin', 'Pharmacist', 'Doctor', 'Cashier'];

const PUBLIC_COLUMNS =
  'user_id, tenant_id, username, full_name, role, avatar_url, is_active, created_at';

exports.getUsers = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE tenant_id = $1 ORDER BY role, username`,
      [tenantId]
    );
    res.json({ success: true, message: 'Staff retrieved', data: result.rows });
  } catch (error) {
    console.error('User controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { username, password, full_name, role } = req.body;

    if (!username || !password || !full_name || !role) {
      return res.status(400).json({ error: 'Username, password, full name and role are all required' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await db.query(
      `INSERT INTO users (tenant_id, username, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${PUBLIC_COLUMNS}`,
      [tenantId, username, passwordHash, full_name, role]
    );

    res.status(201).json({ success: true, message: 'Staff account created', data: result.rows[0] });
  } catch (error) {
    // Usernames are unique per pharmacy, so a clash is a client mistake rather
    // than a server fault.
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That username already exists in this pharmacy' });
    }
    console.error('User controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { tenantId, userId: actorId } = req.user;
    const { id } = req.params;
    const { full_name, role, is_active, avatar_url } = req.body;

    if (role && !ASSIGNABLE_ROLES.includes(role)) {
      return res.status(400).json({ error: `Role must be one of: ${ASSIGNABLE_ROLES.join(', ')}` });
    }

    // An administrator locking or demoting themselves could leave a pharmacy
    // with nobody able to administer it.
    if (id === actorId && (is_active === false || (role && role !== 'Admin'))) {
      return res.status(400).json({ error: 'You cannot change your own role or deactivate yourself' });
    }

    const existing = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Staff member not found' });

    const result = await db.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         role = COALESCE($2, role),
         is_active = COALESCE($3, is_active),
         avatar_url = COALESCE($4, avatar_url)
       WHERE user_id = $5 AND tenant_id = $6
       RETURNING ${PUBLIC_COLUMNS}`,
      [full_name, role, is_active, avatar_url, id, tenantId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Staff member not found' });

    const updated = result.rows[0];
    const was = existing.rows[0];

    // Who can do what, and who is allowed in at all. Both are worth being able
    // to reconstruct after the fact.
    await audit.recordChange(db, req, {
      action: audit.ACTIONS.ROLE_CHANGED,
      entityType: 'user',
      entityId: updated.user_id,
      entityLabel: updated.username,
      fields: ['role'],
      before: was,
      after: updated
    });

    if (String(was.is_active) !== String(updated.is_active)) {
      await audit.record(db, req, {
        action: updated.is_active ? audit.ACTIONS.USER_REACTIVATED : audit.ACTIONS.USER_DEACTIVATED,
        entityType: 'user',
        entityId: updated.user_id,
        entityLabel: updated.username,
        before: { is_active: was.is_active },
        after: { is_active: updated.is_active }
      });
    }

    res.json({ success: true, message: 'Staff account updated', data: updated });
  } catch (error) {
    console.error('User controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Anyone may set their own picture; changing someone else's account is an
// administrator action handled by updateUser above.
exports.updateOwnAvatar = async (req, res) => {
  try {
    const { userId } = req.user;
    const { avatar_url } = req.body;

    const result = await db.query(
      `UPDATE users SET avatar_url = $1 WHERE user_id = $2 RETURNING ${PUBLIC_COLUMNS}`,
      [avatar_url || null, userId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'Profile picture updated', data: result.rows[0] });
  } catch (error) {
    console.error('User controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAssignableRoles = (req, res) => {
  res.json({ success: true, message: 'Roles retrieved', data: ASSIGNABLE_ROLES });
};

module.exports.ASSIGNABLE_ROLES = ASSIGNABLE_ROLES;
