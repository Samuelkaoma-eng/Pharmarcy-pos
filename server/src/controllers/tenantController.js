const db = require('../config/db');

// Public list backing the pharmacy picker on the staff login screen. Staff need
// to name their pharmacy before signing in, because usernames are only unique
// within a tenant. Only the id and display name are exposed, and the platform
// tenant is withheld since nobody signs in to it from the staff portal.
exports.getDirectory = async (req, res) => {
  try {
    if (!db.isDbAvailable()) return db.unavailable(res);

    // The sign-in page needs the list of pharmacies before anybody has signed
    // in, so this read has no tenant to be scoped to. It returns two columns —
    // the name and the id you would then sign in against — and nothing else.
    const result = await db.withAuthLookup(() =>
      db.query(
        "SELECT tenant_id, name FROM tenants WHERE status = 'ACTIVE' AND license_number <> 'PLATFORM-000' ORDER BY name ASC"
      )
    );
    res.json({ message: 'Pharmacy directory retrieved', data: result.rows });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getConfig = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!db.isDbAvailable()) return db.unavailable(res);

    // Branding is the pharmacy's own; the operational settings below are
    // read-only here and only the ControlHub can change them.
    const result = await db.query(
      `SELECT name, theme_color, logo_url, currency_symbol, address, phone,
              expiry_alert_days, low_stock_alerts, require_customer_on_sale,
              require_till_session
       FROM tenants WHERE tenant_id = $1`,
      [tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pharmacy not found' });

    res.json({ message: 'Tenant config retrieved', data: result.rows[0] });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, theme_color, currency_symbol, address, phone, logo_url } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

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
    if (result.rows.length === 0) return res.status(404).json({ error: 'Pharmacy not found' });

    res.json({ message: 'Tenant config updated', data: result.rows[0] });
  } catch (error) {
    console.error('Tenant controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
