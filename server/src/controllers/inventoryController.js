const db = require('../config/db');

exports.receiveStock = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { productId, batchNumber, expiryDate, quantity, notes } = req.body;

    if (db.isDbAvailable()) {
      // Begin transaction
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // 1. Create or update batch
        const batchRes = await client.query(
          `INSERT INTO product_batches (product_id, tenant_id, batch_number, expiry_date, initial_quantity, quantity_on_hand)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING batch_id`,
          [productId, tenantId, batchNumber, expiryDate, quantity, quantity]
        );
        const batchId = batchRes.rows[0].batch_id;

        // 2. Insert movement
        await client.query(
          `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, productId, batchId, quantity, 'RECEIVE', userId, notes]
        );

        await client.query('COMMIT');
        return res.json({ message: 'Stock received successfully' });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    
    res.json({ message: 'Stock received (mock)' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.dispenseStock = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { productId, batchId, quantity, referenceId, notes } = req.body;

    if (db.isDbAvailable()) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        // Decrement batch
        if (batchId) {
          await client.query('UPDATE product_batches SET quantity_on_hand = quantity_on_hand - $1 WHERE batch_id = $2 AND tenant_id = $3', [quantity, batchId, tenantId]);
        }

        // Insert movement (negative quantity)
        await client.query(
          `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, reference_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, productId, batchId, -Math.abs(quantity), 'DISPENSE', userId, referenceId, notes]
        );

        await client.query('COMMIT');
        return res.json({ message: 'Stock dispensed successfully' });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    
    res.json({ message: 'Stock dispensed (mock)' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { productId, batchId, quantityDifference, notes } = req.body;

    if (db.isDbAvailable()) {
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        
        if (batchId) {
          await client.query('UPDATE product_batches SET quantity_on_hand = quantity_on_hand + $1 WHERE batch_id = $2 AND tenant_id = $3', [quantityDifference, batchId, tenantId]);
        }

        await client.query(
          `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [tenantId, productId, batchId, quantityDifference, 'ADJUSTMENT', userId, notes]
        );

        await client.query('COMMIT');
        return res.json({ message: 'Stock adjusted successfully' });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
    
    res.json({ message: 'Stock adjusted (mock)' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMovements = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { productId } = req.params;

    if (db.isDbAvailable()) {
      const result = await db.query('SELECT * FROM stock_movements WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at DESC', [productId, tenantId]);
      return res.json({ message: 'Movements retrieved', data: result.rows });
    }
    
    res.json({ message: 'Movements retrieved (mock)', data: [] });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
