const db = require('../config/db');

const MOCK_QUEUE = [
  { visit_id: 'v1', customer_id: 'c1', patient_name: 'Mutinta Banda', status: 'WAITING', queue_number: 1 },
  { visit_id: 'v2', customer_id: 'c2', patient_name: 'Chanda Mulenga', status: 'COMPLETED', queue_number: 2 }
];

exports.getQueue = async (req, res) => {
  try {
    const { tenantId } = req.user;
    
    if (db.isDbAvailable()) {
      // Get today's visits
      const result = await db.query(`
        SELECT v.*, c.name as patient_name
        FROM visits v
        JOIN customers c ON v.customer_id = c.customer_id
        WHERE v.tenant_id = $1 AND DATE(v.date) = CURRENT_DATE
        ORDER BY v.queue_number ASC
      `, [tenantId]);
      return res.json({ message: 'Queue retrieved', data: result.rows });
    }
    
    res.json({ message: 'Queue retrieved (mock)', data: MOCK_QUEUE });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getStats = async (req, res) => {
  try {
    const { tenantId } = req.user;
    
    if (db.isDbAvailable()) {
      const result = await db.query(`
        SELECT status, COUNT(*) as count
        FROM visits
        WHERE tenant_id = $1 AND DATE(date) = CURRENT_DATE
        GROUP BY status
      `, [tenantId]);
      return res.json({ message: 'Stats retrieved', data: result.rows });
    }
    
    res.json({ message: 'Stats retrieved (mock)', data: [{ status: 'WAITING', count: 1 }, { status: 'COMPLETED', count: 1 }] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createVisit = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { customerId, reason } = req.body;
    
    if (db.isDbAvailable()) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // Get max queue number for today
        const qRes = await client.query('SELECT COALESCE(MAX(queue_number), 0) + 1 as next_q FROM visits WHERE tenant_id = $1 AND DATE(date) = CURRENT_DATE', [tenantId]);
        const queueNumber = qRes.rows[0].next_q;
        
        const result = await client.query(
          'INSERT INTO visits (tenant_id, customer_id, reason, status, queue_number) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [tenantId, customerId, reason, 'WAITING', queueNumber]
        );
        
        await client.query('COMMIT');
        return res.status(201).json({ message: 'Visit created', data: result.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    
    res.status(201).json({ message: 'Visit created (mock)', data: { visit_id: 'v-new', queue_number: 3, status: 'WAITING' } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { status } = req.body;
    
    if (db.isDbAvailable()) {
      const result = await db.query('UPDATE visits SET status = $1 WHERE visit_id = $2 AND tenant_id = $3 RETURNING *', [status, id, tenantId]);
      return res.json({ message: 'Status updated', data: result.rows[0] });
    }
    
    res.json({ message: 'Status updated (mock)', data: { visit_id: id, status } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignDoctor = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { doctorId } = req.body;
    
    if (db.isDbAvailable()) {
      const result = await db.query('UPDATE visits SET doctor_id = $1, status = $2 WHERE visit_id = $3 AND tenant_id = $4 RETURNING *', [doctorId, 'IN_PROGRESS', id, tenantId]);
      return res.json({ message: 'Doctor assigned', data: result.rows[0] });
    }
    
    res.json({ message: 'Doctor assigned (mock)', data: { visit_id: id, doctor_id: doctorId, status: 'IN_PROGRESS' } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.recordVitals = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;
    const { bp, heartRate, temperature, spo2, weight } = req.body;
    
    if (db.isDbAvailable()) {
      const vRes = await db.query('SELECT customer_id FROM visits WHERE visit_id = $1 AND tenant_id = $2', [id, tenantId]);
      if (vRes.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });
      const customerId = vRes.rows[0].customer_id;
      
      const result = await db.query(
        'INSERT INTO vitals (tenant_id, visit_id, customer_id, bp, heart_rate, temperature, spo2, weight, recorded_by_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
        [tenantId, id, customerId, bp, heartRate, temperature, spo2, weight, userId]
      );
      return res.json({ message: 'Vitals recorded', data: result.rows[0] });
    }
    
    res.json({ message: 'Vitals recorded (mock)', data: { vitals_id: 'vitals-new', ...req.body } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getVisit = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    if (db.isDbAvailable()) {
      const visitRes = await db.query('SELECT * FROM visits WHERE visit_id = $1 AND tenant_id = $2', [id, tenantId]);
      if (visitRes.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });
      
      const vitalsRes = await db.query('SELECT * FROM vitals WHERE visit_id = $1', [id]);
      
      const data = {
        ...visitRes.rows[0],
        vitals: vitalsRes.rows[0] || null
      };
      return res.json({ message: 'Visit retrieved', data });
    }
    
    res.json({ message: 'Visit retrieved (mock)', data: { visit_id: id, status: 'WAITING' } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
