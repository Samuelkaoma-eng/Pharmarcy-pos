const db = require('../config/db');

const MOCK_PATIENTS = [
  { customer_id: 'c1', name: 'Mutinta Banda', phone: '0961111111', nrc: '111111/11/1' },
  { customer_id: 'c2', name: 'Chanda Mulenga', phone: '0972222222', nrc: '222222/22/2' }
];

exports.getPatients = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { search } = req.query;

    if (db.isDbAvailable()) {
      let query = 'SELECT * FROM customers WHERE tenant_id = $1';
      const params = [tenantId];
      if (search) {
        query += ' AND (name ILIKE $2 OR phone ILIKE $2 OR nrc ILIKE $2)';
        params.push(`%${search}%`);
      }
      const result = await db.query(query, params);
      return res.json({ message: 'Patients retrieved', data: result.rows });
    }
    
    res.json({ message: 'Patients retrieved (mock)', data: MOCK_PATIENTS });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (db.isDbAvailable()) {
      const result = await db.query('SELECT * FROM customers WHERE customer_id = $1 AND tenant_id = $2', [id, tenantId]);
      if (result.rows.length === 0) return res.status(404).json({ error: 'Patient not found' });
      
      const patient = result.rows[0];
      const visits = await db.query('SELECT * FROM visits WHERE customer_id = $1 ORDER BY date DESC LIMIT 5', [id]);
      patient.recent_visits = visits.rows;
      
      return res.json({ message: 'Patient retrieved', data: patient });
    }
    
    const patient = MOCK_PATIENTS.find(p => p.customer_id === id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });
    res.json({ message: 'Patient retrieved (mock)', data: patient });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createPatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, phone, email, nrc, gender, dob, address } = req.body;

    if (db.isDbAvailable()) {
      const result = await db.query(
        `INSERT INTO customers (tenant_id, name, phone, email, nrc, gender, dob, address) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [tenantId, name, phone, email, nrc, gender, dob, address]
      );
      return res.status(201).json({ message: 'Patient registered', data: result.rows[0] });
    }
    
    res.status(201).json({ message: 'Patient registered (mock)', data: { customer_id: 'c-new', ...req.body } });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updatePatient = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, phone, email, address } = req.body;

    if (db.isDbAvailable()) {
      const result = await db.query(
        'UPDATE customers SET name = $1, phone = $2, email = $3, address = $4 WHERE customer_id = $5 AND tenant_id = $6 RETURNING *',
        [name, phone, email, address, id, tenantId]
      );
      return res.json({ message: 'Patient updated', data: result.rows[0] });
    }
    
    res.json({ message: 'Patient updated (mock)', data: { customer_id: id, name, phone, email, address } });
  } catch (error) {
    console.error('Patient controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
