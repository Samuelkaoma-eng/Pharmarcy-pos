const db = require('../config/db');

const MOCK_CONFIG = {
  name: 'Lusaka Central Pharmacy',
  theme_color: '#28a745',
  currency_symbol: 'ZMW',
  address: '123 Cairo Road, Lusaka'
};

exports.getConfig = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (db.isDbAvailable()) {
      const result = await db.query('SELECT name, theme_color, logo_url, currency_symbol, address, phone FROM tenants WHERE tenant_id = $1', [tenantId]);
      return res.json({ message: 'Tenant config retrieved', data: result.rows[0] });
    }
    res.json({ message: 'Tenant config retrieved (mock)', data: MOCK_CONFIG });
  } catch (error) {
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
    res.status(500).json({ error: 'Server error' });
  }
};
