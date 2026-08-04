const db = require('../config/db');
const audit = require('../services/auditLog');

exports.createPrescription = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { doctorId, customerId, visitId, validUntil, notes, items } = req.body; // items: [{productId, dosageInstructions, quantity}]

    if (!db.isDbAvailable()) return db.unavailable(res);

    if (!customerId) return res.status(400).json({ error: 'A patient is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'A prescription must list at least one medicine' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const prRes = await client.query(
        `INSERT INTO prescriptions (tenant_id, doctor_id, customer_id, visit_id, valid_until, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING prescription_id`,
        [tenantId, doctorId || null, customerId, visitId || null, validUntil || null, notes || null, 'PENDING']
      );
      const prescriptionId = prRes.rows[0].prescription_id;

      for (const item of items) {
        // A prescription naming another pharmacy's product could never be
        // dispensed here, and the checkout guard now matches on product, so a
        // mismatch would surface as a refusal at the till rather than here.
        const owned = await client.query(
          'SELECT 1 FROM products WHERE product_id = $1 AND tenant_id = $2',
          [item.productId, tenantId]
        );
        if (owned.rows.length === 0) {
          throw new Error('Prescribed product not found for this pharmacy');
        }

        await client.query(
          'INSERT INTO prescription_items (prescription_id, product_id, dosage_instructions, quantity) VALUES ($1, $2, $3, $4)',
          [prescriptionId, item.productId, item.dosageInstructions, item.quantity || 1]
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({ message: 'Prescription created', data: { prescription_id: prescriptionId } });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPrescriptions = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { status, customerId } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    // The review list has to show what was prescribed, by whom, and whether it
    // is still in date. It previously returned bare prescription rows, so the
    // screen had nothing to display and invented a medicine and a prescriber.
    let query = `
      SELECT p.*,
             c.name AS patient_name,
             d.name AS doctor_name,
             v.full_name AS verified_by_name,
             p.valid_until IS NOT NULL AND p.valid_until < CURRENT_DATE AS has_lapsed,
             (SELECT COUNT(*)::int FROM prescription_items pi WHERE pi.prescription_id = p.prescription_id) AS item_count,
             (SELECT string_agg(pr.name, ', ' ORDER BY pr.name)
                FROM prescription_items pi
                JOIN products pr ON pr.product_id = pi.product_id
               WHERE pi.prescription_id = p.prescription_id) AS item_summary
      FROM prescriptions p
      JOIN customers c ON p.customer_id = c.customer_id
      LEFT JOIN doctors d ON d.doctor_id = p.doctor_id
      LEFT JOIN users v ON v.user_id = p.verified_by_id
      WHERE p.tenant_id = $1`;
    const params = [tenantId];

    if (status) {
      params.push(status);
      query += ` AND p.status = $${params.length}`;
    }
    if (customerId) {
      params.push(customerId);
      query += ` AND p.customer_id = $${params.length}`;
    }
    query += ' ORDER BY p.created_at DESC';

    const result = await db.query(query, params);
    res.json({ message: 'Prescriptions retrieved', data: result.rows });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPrescription = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const prRes = await db.query(
      `SELECT p.*,
              c.name AS patient_name, c.phone AS patient_phone, c.nrc AS patient_nrc,
              c.dob AS patient_dob,
              d.name AS doctor_name, d.specialty AS doctor_specialty,
              d.license_number AS doctor_license,
              v.full_name AS verified_by_name,
              p.valid_until IS NOT NULL AND p.valid_until < CURRENT_DATE AS has_lapsed
       FROM prescriptions p
       JOIN customers c ON p.customer_id = c.customer_id
       LEFT JOIN doctors d ON d.doctor_id = p.doctor_id
       LEFT JOIN users v ON v.user_id = p.verified_by_id
       WHERE p.prescription_id = $1 AND p.tenant_id = $2`,
      [id, tenantId]
    );
    if (prRes.rows.length === 0) return res.status(404).json({ error: 'Prescription not found' });

    // A pharmacist verifying a prescription needs to see the stock position of
    // each medicine on it, not just its name.
    const itemsRes = await db.query(`
      SELECT pi.*, p.name AS product_name, p.dosage, p.unit_of_measure,
             p.requires_prescription, p.selling_price,
             COALESCE((SELECT SUM(b.quantity_on_hand)
                         FROM product_batches b
                        WHERE b.product_id = p.product_id
                          AND b.expiry_date >= CURRENT_DATE), 0) AS in_date_stock
      FROM prescription_items pi
      JOIN products p ON pi.product_id = p.product_id
      WHERE pi.prescription_id = $1
      ORDER BY p.name
    `, [id]);

    res.json({ message: 'Prescription retrieved', data: { ...prRes.rows[0], items: itemsRes.rows } });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.verifyPrescription = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      'UPDATE prescriptions SET status = $1, verified_by_id = $2 WHERE prescription_id = $3 AND tenant_id = $4 RETURNING *',
      ['VERIFIED', userId, id, tenantId]
    );
    // No matching row means the prescription is missing or owned by another
    // pharmacy. Reporting success there would fake a verification.
    if (result.rows.length === 0) return res.status(404).json({ error: 'Prescription not found' });

    // Verification is the pharmacist's professional judgement and the thing
    // that unlocks a controlled sale, so it is the single most important act
    // on this system to be able to attribute afterwards.
    await audit.record(db, req, {
      action: audit.ACTIONS.PRESCRIPTION_VERIFIED,
      entityType: 'prescription',
      entityId: id,
      entityLabel: `Prescription ${String(id).slice(0, 8).toUpperCase()}`,
      before: { status: 'PENDING' },
      after: { status: 'VERIFIED' }
    });

    res.json({ message: 'Prescription verified', data: result.rows[0] });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.dispensePrescription = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      'UPDATE prescriptions SET status = $1 WHERE prescription_id = $2 AND tenant_id = $3 RETURNING *',
      ['DISPENSED', id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Prescription not found' });

    res.json({ message: 'Prescription dispensed', data: result.rows[0] });
  } catch (error) {
    console.error('Prescription controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
