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
    const { name, theme_color, currency_symbol, address, phone, logo_url } = req.body;

    if (db.isDbAvailable()) {
      // COALESCE so a partial update does not blank the fields it omits.
      const result = await db.query(
        `UPDATE tenants SET
           name = COALESCE($1, name),
           theme_color = COALESCE($2, theme_color),
           currency_symbol = COALESCE($3, currency_symbol),
           address = COALESCE($4, address),
           phone = COALESCE($5, phone),
           logo_url = NULLIF(COALESCE($6, logo_url), '')
         WHERE tenant_id = $7
         RETURNING name, theme_color, currency_symbol, address, phone, logo_url`,
        [name, theme_color, currency_symbol, address, phone, logo_url, tenantId]
      );
      return res.json({ message: 'Tenant config updated', data: result.rows[0] });
    }
    res.json({ message: 'Tenant config updated (mock)', data: { ...MOCK_CONFIG, name, theme_color } });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
