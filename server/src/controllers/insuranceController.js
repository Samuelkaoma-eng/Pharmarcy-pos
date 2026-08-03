const db = require('../config/db');

// Insurance schemes and patient membership. Previously 'insurance' was only a
// payment_type string with nothing behind it: no scheme, no member number, and
// no way to split a bill between a scheme and the patient.

exports.getSchemes = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await db.query(
      'SELECT * FROM insurance_schemes WHERE tenant_id = $1 ORDER BY is_active DESC, name ASC',
      [tenantId]
    );
    res.json({ success: true, message: 'Schemes retrieved', data: result.rows });
  } catch (error) {
    console.error('Insurance controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createScheme = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, cover_percent, contact_phone } = req.body;

    if (!name) return res.status(400).json({ error: 'Scheme name is required' });
    if (cover_percent !== undefined && (cover_percent < 0 || cover_percent > 100)) {
      return res.status(400).json({ error: 'Cover must be between 0 and 100 percent' });
    }

    const result = await db.query(
      `INSERT INTO insurance_schemes (tenant_id, name, cover_percent, contact_phone)
       VALUES ($1, $2, COALESCE($3, 100), $4) RETURNING *`,
      [tenantId, name, cover_percent, contact_phone]
    );

    res.status(201).json({ success: true, message: 'Scheme added', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That scheme already exists for this pharmacy' });
    }
    console.error('Insurance controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.enrolPatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { schemeId, customerId, memberNumber, validUntil } = req.body;

    if (!schemeId || !customerId || !memberNumber) {
      return res.status(400).json({ error: 'Scheme, patient and member number are all required' });
    }

    // Both sides must belong to this pharmacy before they can be linked.
    const owned = await db.query(
      `SELECT
         (SELECT COUNT(*) FROM insurance_schemes WHERE scheme_id = $1 AND tenant_id = $3) AS scheme,
         (SELECT COUNT(*) FROM customers WHERE customer_id = $2 AND tenant_id = $3) AS customer`,
      [schemeId, customerId, tenantId]
    );
    if (owned.rows[0].scheme === '0' || owned.rows[0].customer === '0') {
      return res.status(404).json({ error: 'Scheme or patient not found for this pharmacy' });
    }

    const result = await db.query(
      `INSERT INTO scheme_memberships (tenant_id, scheme_id, customer_id, member_number, valid_until)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (scheme_id, customer_id)
         DO UPDATE SET member_number = EXCLUDED.member_number,
                       valid_until = EXCLUDED.valid_until,
                       is_active = TRUE
       RETURNING *`,
      [tenantId, schemeId, customerId, memberNumber, validUntil || null]
    );

    res.status(201).json({ success: true, message: 'Patient enrolled', data: result.rows[0] });
  } catch (error) {
    console.error('Insurance controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// What the till needs before ringing up: is this patient covered, and by how
// much. Expired or inactive memberships do not count.
exports.getCoverage = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { customerId } = req.params;

    const result = await db.query(
      `SELECT m.member_number, m.valid_until, s.scheme_id, s.name, s.cover_percent
       FROM scheme_memberships m
       JOIN insurance_schemes s ON s.scheme_id = m.scheme_id
       WHERE m.customer_id = $1 AND m.tenant_id = $2
         AND m.is_active AND s.is_active
         AND (m.valid_until IS NULL OR m.valid_until >= CURRENT_DATE)`,
      [customerId, tenantId]
    );

    res.json({
      success: true,
      message: result.rows.length > 0 ? 'Patient is covered' : 'No active cover',
      data: result.rows[0] || null
    });
  } catch (error) {
    console.error('Insurance controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
