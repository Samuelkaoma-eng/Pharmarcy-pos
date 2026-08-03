const db = require('../config/db');

const MOCK_PRESCRIPTIONS = [
  { prescription_id: 'pr1', customer_id: 'c1', status: 'PENDING', doctor_id: 'd1' }
];

exports.createPrescription = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { doctorId, customerId, visitId, validUntil, notes, items } = req.body; // items: [{productId, dosageInstructions, quantity}]

    if (db.isDbAvailable()) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        const prRes = await client.query(
          `INSERT INTO prescriptions (tenant_id, doctor_id, customer_id, visit_id, valid_until, notes, status) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING prescription_id`,
          [tenantId, doctorId, customerId, visitId, validUntil, notes, 'PENDING']
        );
        const prescriptionId = prRes.rows[0].prescription_id;
        
        for (const item of items) {
          await client.query(
            'INSERT INTO prescription_items (prescription_id, product_id, dosage_instructions, quantity) VALUES ($1, $2, $3, $4)',
            [prescriptionId, item.productId, item.dosageInstructions, item.quantity]
          );
        }
        
        await client.query('COMMIT');
        return res.status(201).json({ message: 'Prescription created', data: { prescription_id: prescriptionId } });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    
    res.status(201).json({ message: 'Prescription created (mock)', data: { prescription_id: 'pr-new' } });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPrescriptions = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { status, customerId } = req.query;

    if (db.isDbAvailable()) {
      let query = 'SELECT p.*, c.name as patient_name FROM prescriptions p JOIN customers c ON p.customer_id = c.customer_id WHERE p.tenant_id = $1';
      const params = [tenantId];
      
      if (status) {
        params.push(status);
        query += ` AND p.status = $${params.length}`;
      }
      if (customerId) {
        params.push(customerId);
        query += ` AND p.customer_id = $${params.length}`;
      }
      
      const result = await db.query(query, params);
      return res.json({ message: 'Prescriptions retrieved', data: result.rows });
    }
    
    res.json({ message: 'Prescriptions retrieved (mock)', data: MOCK_PRESCRIPTIONS });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPrescription = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (db.isDbAvailable()) {
      const prRes = await db.query('SELECT p.*, c.name as patient_name FROM prescriptions p JOIN customers c ON p.customer_id = c.customer_id WHERE p.prescription_id = $1 AND p.tenant_id = $2', [id, tenantId]);
      if (prRes.rows.length === 0) return res.status(404).json({ error: 'Prescription not found' });
      
      const itemsRes = await db.query(`
        SELECT pi.*, p.name as product_name 
        FROM prescription_items pi 
        JOIN products p ON pi.product_id = p.product_id 
        WHERE pi.prescription_id = $1
      `, [id]);
      
      const data = { ...prRes.rows[0], items: itemsRes.rows };
      return res.json({ message: 'Prescription retrieved', data });
    }
    
    res.json({ message: 'Prescription retrieved (mock)', data: MOCK_PRESCRIPTIONS[0] });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.verifyPrescription = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;

    if (db.isDbAvailable()) {
      const result = await db.query(
        'UPDATE prescriptions SET status = $1, verified_by_id = $2 WHERE prescription_id = $3 AND tenant_id = $4 RETURNING *',
        ['VERIFIED', userId, id, tenantId]
      );
      // No matching row means the prescription is missing or owned by another
      // pharmacy. Reporting success there would fake a verification.
      if (result.rows.length === 0) return res.status(404).json({ error: 'Prescription not found' });
      return res.json({ message: 'Prescription verified', data: result.rows[0] });
    }
    
    res.json({ message: 'Prescription verified (mock)', data: { prescription_id: id, status: 'VERIFIED' } });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.dispensePrescription = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (db.isDbAvailable()) {
      const result = await db.query(
        'UPDATE prescriptions SET status = $1 WHERE prescription_id = $2 AND tenant_id = $3 RETURNING *',
        ['DISPENSED', id, tenantId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Prescription not found' });
      return res.json({ message: 'Prescription dispensed', data: result.rows[0] });
    }
    
    res.json({ message: 'Prescription dispensed (mock)', data: { prescription_id: id, status: 'DISPENSED' } });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
