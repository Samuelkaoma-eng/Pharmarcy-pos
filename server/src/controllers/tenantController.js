const db = require('../config/db');

const MOCK_CONFIG = {
  name: 'Lusaka Central Pharmacy',
  theme_color: '#28a745',
  currency_symbol: 'ZMW',
  address: '123 Cairo Road, Lusaka'
};

// Public list backing the pharmacy picker on the staff login screen. Staff need
// to name their pharmacy before signing in, because usernames are only unique
// within a tenant. Only the id and display name are exposed, and the platform
// tenant is withheld since nobody signs in to it from the staff portal.
exports.getDirectory = async (req, res) => {
  try {
    if (db.isDbAvailable()) {
      const result = await db.query(
        "SELECT tenant_id, name FROM tenants WHERE status = 'ACTIVE' AND license_number <> 'PLATFORM-000' ORDER BY name ASC"
      );
      return res.json({ message: 'Pharmacy directory retrieved', data: result.rows });
    }
    res.json({ message: 'Pharmacy directory retrieved (mock)', data: [] });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getConfig = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (db.isDbAvailable()) {
      // Branding is the pharmacy's own; the operational settings below are
      // read-only here and only the ControlHub can change them.
      const result = await db.query(
        `SELECT name, theme_color, logo_url, currency_symbol, address, phone,
                expiry_alert_days, low_stock_alerts, require_customer_on_sale
         FROM tenants WHERE tenant_id = $1`,
        [tenantId]
      );
      return res.json({ message: 'Tenant config retrieved', data: result.rows[0] });
    }
    res.json({ message: 'Tenant config retrieved (mock)', data: MOCK_CONFIG });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, theme_color, currency_symbol, address } = req.body;
    
    if (db.isDbAvailable()) {
      const result = await db.query(
        'UPDATE tenants SET name = $1, theme_color = $2, currency_symbol = $3, address = $4 WHERE tenant_id = $5 RETURNING name, theme_color, currency_symbol, address',
        [name, theme_color, currency_symbol, address, tenantId]
      );
      return res.json({ message: 'Tenant config updated', data: result.rows[0] });
    }
    res.json({ message: 'Tenant config updated (mock)', data: { ...MOCK_CONFIG, name, theme_color } });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
