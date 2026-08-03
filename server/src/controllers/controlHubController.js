const bcrypt = require('bcryptjs');
const db = require('../config/db');

// Offline fallback used only when PostgreSQL is unreachable, so the ControlHub
// screens still render during a demo. IDs mirror the seeded tenant.
const MOCK_TENANTS = [
  { tenant_id: '11111111-1111-1111-1111-111111111111', name: 'Central Care Pharmacy', status: 'ACTIVE', users_count: 3 }
];

exports.getTenants = async (req, res) => {
  try {
    if (db.isDbAvailable()) {
      const result = await db.query(`
        SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) as users_count 
        FROM tenants t
      `);
      return res.json({ message: 'Tenants retrieved', data: result.rows });
    }
    res.json({ message: 'Tenants retrieved (mock)', data: MOCK_TENANTS });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTenant = async (req, res) => {
  try {
    const { id } = req.params;
    if (db.isDbAvailable()) {
      const result = await db.query('SELECT * FROM tenants WHERE tenant_id = $1', [id]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
      return res.json({ message: 'Tenant retrieved', data: result.rows[0] });
    }
    const tenant = MOCK_TENANTS.find(t => t.tenant_id === id);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant retrieved (mock)', data: tenant });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (db.isDbAvailable()) {
      const result = await db.query('UPDATE tenants SET status = $1 WHERE tenant_id = $2 RETURNING *', [status, id]);
      return res.json({ message: 'Tenant status updated', data: result.rows[0] });
    }
    res.json({ message: 'Tenant status updated (mock)', data: { tenant_id: id, status } });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getOnboarding = async (req, res) => {
  try {
    if (db.isDbAvailable()) {
      const result = await db.query("SELECT * FROM tenants WHERE status IN ('REGISTERED', 'SUBMITTED', 'UNDER_REVIEW')");
      return res.json({ message: 'Onboarding applications retrieved', data: result.rows });
    }
    res.json({ message: 'Onboarding applications retrieved (mock)', data: [] });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.registerTenant = async (req, res) => {
  try {
    const { name, owner_email, phone, admin_username, admin_password } = req.body;

    if (!name || !owner_email) {
      return res.status(400).json({ error: 'Pharmacy name and owner email are required' });
    }
    if (!admin_username || !admin_password) {
      return res.status(400).json({ error: 'An administrator username and password are required' });
    }
    if (admin_password.length < 8) {
      return res.status(400).json({ error: 'Administrator password must be at least 8 characters' });
    }

    if (db.isDbAvailable()) {
      // The pharmacy and its first administrator are created together. Without
      // the administrator an approved pharmacy would have nobody able to sign
      // in. The owner chooses the password here, so no secret is generated or
      // returned in the response.
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');

        const tenantRes = await client.query(
          'INSERT INTO tenants (name, owner_email, phone, status) VALUES ($1, $2, $3, $4) RETURNING *',
          [name, owner_email, phone, 'REGISTERED']
        );
        const tenant = tenantRes.rows[0];

        const passwordHash = await bcrypt.hash(admin_password, 10);
        await client.query(
          'INSERT INTO users (tenant_id, username, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5)',
          [tenant.tenant_id, admin_username, passwordHash, `${name} Administrator`, 'Admin']
        );

        await client.query('COMMIT');
        return res.status(201).json({
          message: 'Pharmacy registered and awaiting review',
          data: { ...tenant, admin_username }
        });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.status(201).json({
      message: 'Pharmacy registered and awaiting review (mock)',
      data: { tenant_id: 'pending', name, status: 'REGISTERED', admin_username }
    });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTenantSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT tenant_id, name, status, expiry_alert_days, low_stock_alerts,
              require_customer_on_sale, allow_public_registration
       FROM tenants WHERE tenant_id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant settings retrieved', data: result.rows[0] });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Operational settings are platform-controlled, so only the ControlHub may
// change them. A pharmacy reads them through its own config endpoint.
exports.updateTenantSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiry_alert_days, low_stock_alerts, require_customer_on_sale, allow_public_registration } = req.body;

    if (expiry_alert_days !== undefined && (expiry_alert_days < 7 || expiry_alert_days > 365)) {
      return res.status(400).json({ error: 'Expiry alert window must be between 7 and 365 days' });
    }

    const result = await db.query(
      `UPDATE tenants SET
         expiry_alert_days = COALESCE($1, expiry_alert_days),
         low_stock_alerts = COALESCE($2, low_stock_alerts),
         require_customer_on_sale = COALESCE($3, require_customer_on_sale),
         allow_public_registration = COALESCE($4, allow_public_registration)
       WHERE tenant_id = $5
       RETURNING tenant_id, name, expiry_alert_days, low_stock_alerts,
                 require_customer_on_sale, allow_public_registration`,
      [expiry_alert_days, low_stock_alerts, require_customer_on_sale, allow_public_registration, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant settings updated', data: result.rows[0] });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
