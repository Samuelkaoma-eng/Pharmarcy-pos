const db = require('../config/db');

exports.getPatients = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { search } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    let query = 'SELECT * FROM customers WHERE tenant_id = $1';
    const params = [tenantId];
    if (search) {
      query += ' AND (name ILIKE $2 OR phone ILIKE $2 OR nrc ILIKE $2)';
      params.push(`%${search}%`);
    }
    query += ' ORDER BY name ASC';

    const result = await db.query(query, params);
    res.json({ message: 'Patients retrieved', data: result.rows });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query('SELECT * FROM customers WHERE customer_id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    const patient = result.rows[0];
    // Scoped by tenant as well as patient: the patient is already known to be
    // this pharmacy's, but a query that does not say so is one refactor away
    // from not being.
    const visits = await db.query(
      'SELECT * FROM visits WHERE customer_id = $1 AND tenant_id = $2 ORDER BY date DESC LIMIT 5',
      [id, tenantId]
    );
    patient.recent_visits = visits.rows;

    res.json({ message: 'Patient retrieved', data: patient });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createPatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, phone, email, nrc, gender, dob, address } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);
    if (!name) return res.status(400).json({ error: 'A patient name is required' });

    const result = await db.query(
      `INSERT INTO customers (tenant_id, name, phone, email, nrc, gender, dob, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, name, phone || null, email || null, nrc || null, gender || null, dob || null, address || null]
    );

    res.status(201).json({ message: 'Patient registered', data: result.rows[0] });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, phone, email, address, nrc, gender, dob } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    // COALESCE so a partial update does not blank the fields it omits.
    const result = await db.query(
      `UPDATE customers SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         email = COALESCE($3, email),
         address = COALESCE($4, address),
         nrc = COALESCE($5, nrc),
         gender = COALESCE($6, gender),
         dob = COALESCE($7, dob)
       WHERE customer_id = $8 AND tenant_id = $9 RETURNING *`,
      [name ?? null, phone ?? null, email ?? null, address ?? null, nrc ?? null, gender ?? null, dob ?? null, id, tenantId]
    );

    // An update matching no row means the patient belongs to another pharmacy.
    if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });

    res.json({ message: 'Patient updated', data: result.rows[0] });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
