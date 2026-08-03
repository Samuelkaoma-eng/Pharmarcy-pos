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
    const { name, owner_email, phone } = req.body;
    if (db.isDbAvailable()) {
      const result = await db.query(
        'INSERT INTO tenants (name, owner_email, phone, status) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, owner_email, phone, 'REGISTERED']
      );
      // Create admin user too ideally
      return res.json({ message: 'Tenant registered successfully', data: result.rows[0] });
    }
    res.json({ message: 'Tenant registered successfully (mock)', data: { tenant_id: 't-new', name, status: 'REGISTERED' } });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
