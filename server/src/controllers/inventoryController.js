const db = require('../config/db');
const audit = require('../services/auditLog');

exports.receiveStock = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { productId, batchNumber, expiryDate, quantity, notes, supplierId } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Received quantity must be above zero' });
    }
    if (!expiryDate) {
      return res.status(400).json({ error: 'An expiry date is required to book a batch in' });
    }

    // The batch insert only proves the product exists, not that it belongs to
    // the caller, so confirm ownership before writing anything.
    const owned = await db.query('SELECT 1 FROM products WHERE product_id = $1 AND tenant_id = $2', [productId, tenantId]);
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found for this pharmacy' });
    }

    if (supplierId) {
      const supplier = await db.query('SELECT 1 FROM suppliers WHERE supplier_id = $1 AND tenant_id = $2', [supplierId, tenantId]);
      if (supplier.rows.length === 0) {
        return res.status(404).json({ error: 'Supplier not found for this pharmacy' });
      }
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      const batchRes = await client.query(
        `INSERT INTO product_batches (product_id, tenant_id, batch_number, expiry_date, initial_quantity, quantity_on_hand, supplier_id)
         VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING batch_id`,
        [productId, tenantId, batchNumber, expiryDate, quantity, supplierId || null]
      );
      const batchId = batchRes.rows[0].batch_id;

      await client.query(
        `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, supplier_id, notes)
         VALUES ($1, $2, $3, $4, 'RECEIVE', $5, $6, $7)`,
        [tenantId, productId, batchId, quantity, userId, supplierId || null, notes]
      );

      await client.query('COMMIT');
      return res.json({ message: 'Stock received successfully', data: { batch_id: batchId } });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Inventory controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.dispenseStock = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { productId, batchId, quantity, referenceId, notes } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Dispensed quantity must be above zero' });
    }

    const owned = await db.query('SELECT name FROM products WHERE product_id = $1 AND tenant_id = $2', [productId, tenantId]);
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found for this pharmacy' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      if (batchId) {
        // Lock the batch, then check it is this pharmacy's, in date and holds
        // enough. The update previously ran unchecked: a batch id belonging to
        // another pharmacy matched nothing, and the movement below was written
        // anyway, logging a dispense that never touched any stock.
        const batchRes = await client.query(
          `SELECT batch_id, batch_number, quantity_on_hand, expiry_date,
                  expiry_date < CURRENT_DATE AS is_expired
           FROM product_batches
           WHERE batch_id = $1 AND product_id = $2 AND tenant_id = $3
           FOR UPDATE`,
          [batchId, productId, tenantId]
        );

        if (batchRes.rows.length === 0) {
          throw new Error('Batch not found for this product');
        }

        const batch = batchRes.rows[0];

        if (batch.is_expired) {
          throw new Error(
            `EXPIRED STOCK: batch '${batch.batch_number}' expired on ${new Date(batch.expiry_date).toISOString().slice(0, 10)}`
          );
        }
        if (batch.quantity_on_hand < quantity) {
          throw new Error(
            `INSUFFICIENT STOCK: batch '${batch.batch_number}' holds ${batch.quantity_on_hand}, ${quantity} requested`
          );
        }

        await client.query(
          'UPDATE product_batches SET quantity_on_hand = quantity_on_hand - $1 WHERE batch_id = $2 AND tenant_id = $3',
          [quantity, batchId, tenantId]
        );
      }

      await client.query(
        `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, reference_id, notes)
         VALUES ($1, $2, $3, $4, 'DISPENSE', $5, $6, $7)`,
        [tenantId, productId, batchId || null, -Math.abs(quantity), userId, referenceId, notes]
      );

      await client.query('COMMIT');
      return res.json({ message: 'Stock dispensed successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Inventory controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { productId, batchId, quantityDifference, notes } = req.body;

    if (!db.isDbAvailable()) return db.unavailable(res);

    if (!quantityDifference) {
      return res.status(400).json({ error: 'An adjustment of zero changes nothing' });
    }
    if (!notes) {
      // An unexplained adjustment is indistinguishable from shrinkage.
      return res.status(400).json({ error: 'A reason is required for a stock adjustment' });
    }

    const owned = await db.query('SELECT 1 FROM products WHERE product_id = $1 AND tenant_id = $2', [productId, tenantId]);
    if (owned.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found for this pharmacy' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      if (batchId) {
        const batchRes = await client.query(
          'SELECT quantity_on_hand FROM product_batches WHERE batch_id = $1 AND product_id = $2 AND tenant_id = $3 FOR UPDATE',
          [batchId, productId, tenantId]
        );

        if (batchRes.rows.length === 0) {
          throw new Error('Batch not found for this product');
        }
        if (batchRes.rows[0].quantity_on_hand + quantityDifference < 0) {
          throw new Error(
            `That adjustment would take batch stock below zero: ${batchRes.rows[0].quantity_on_hand} held, ${quantityDifference} applied`
          );
        }

        await client.query(
          'UPDATE product_batches SET quantity_on_hand = quantity_on_hand + $1 WHERE batch_id = $2 AND tenant_id = $3',
          [quantityDifference, batchId, tenantId]
        );
      }

      await client.query(
        `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, notes)
         VALUES ($1, $2, $3, $4, 'ADJUSTMENT', $5, $6)`,
        [tenantId, productId, batchId || null, quantityDifference, userId, notes]
      );

      // Recorded with the transaction client and carrying the reason the
      // controller already insists on, so the trail says why as well as what.
      await audit.record(client, req, {
        action: audit.ACTIONS.STOCK_ADJUSTED,
        entityType: 'product',
        entityId: productId,
        entityLabel: batchId ? `Batch ${batchId}` : 'Untracked stock',
        before: null,
        after: { quantity_difference: quantityDifference, batch_id: batchId || null },
        reason: notes
      });

      await client.query('COMMIT');
      return res.json({ message: 'Stock adjusted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Inventory controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMovements = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { productId } = req.params;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      `SELECT m.*, u.full_name AS performed_by_name, s.name AS supplier_name, b.batch_number
       FROM stock_movements m
       LEFT JOIN users u ON u.user_id = m.performed_by_id
       LEFT JOIN suppliers s ON s.supplier_id = m.supplier_id
       LEFT JOIN product_batches b ON b.batch_id = m.batch_id
       WHERE m.product_id = $1 AND m.tenant_id = $2
       ORDER BY m.created_at DESC`,
      [productId, tenantId]
    );

    res.json({ message: 'Movements retrieved', data: result.rows });
  } catch (error) {
    console.error('Inventory controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
