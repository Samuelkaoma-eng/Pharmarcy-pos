const db = require('../config/db');

// Suppliers and purchase orders. Stock previously appeared through
// receiveStock with no record of where it came from, so a recalled batch could
// not be traced back to whoever supplied it.

exports.getSuppliers = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await db.query(
      'SELECT * FROM suppliers WHERE tenant_id = $1 ORDER BY is_active DESC, name ASC',
      [tenantId]
    );
    res.json({ success: true, message: 'Suppliers retrieved', data: result.rows });
  } catch (error) {
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, contact_name, phone, email, address, tpin, zamra_licence } = req.body;

    if (!name) return res.status(400).json({ error: 'Supplier name is required' });

    const result = await db.query(
      `INSERT INTO suppliers (tenant_id, name, contact_name, phone, email, address, tpin, zamra_licence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, name, contact_name, phone, email, address, tpin, zamra_licence]
    );

    res.status(201).json({ success: true, message: 'Supplier added', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'That supplier already exists for this pharmacy' });
    }
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, contact_name, phone, email, address, tpin, zamra_licence, is_active } = req.body;

    const result = await db.query(
      `UPDATE suppliers SET
         name = COALESCE($1, name), contact_name = COALESCE($2, contact_name),
         phone = COALESCE($3, phone), email = COALESCE($4, email),
         address = COALESCE($5, address), tpin = COALESCE($6, tpin),
         zamra_licence = COALESCE($7, zamra_licence), is_active = COALESCE($8, is_active)
       WHERE supplier_id = $9 AND tenant_id = $10 RETURNING *`,
      [name, contact_name, phone, email, address, tpin, zamra_licence, is_active, id, tenantId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ success: true, message: 'Supplier updated', data: result.rows[0] });
  } catch (error) {
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPurchaseOrders = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await db.query(
      `SELECT po.*, s.name AS supplier_name, u.full_name AS raised_by_name,
              (SELECT COUNT(*)::int FROM purchase_order_items i WHERE i.po_id = po.po_id) AS line_count
       FROM purchase_orders po
       JOIN suppliers s ON s.supplier_id = po.supplier_id
       LEFT JOIN users u ON u.user_id = po.raised_by_id
       WHERE po.tenant_id = $1
       ORDER BY po.created_at DESC`,
      [tenantId]
    );
    res.json({ success: true, message: 'Purchase orders retrieved', data: result.rows });
  } catch (error) {
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getPurchaseOrder = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const po = await db.query(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
       JOIN suppliers s ON s.supplier_id = po.supplier_id
       WHERE po.po_id = $1 AND po.tenant_id = $2`,
      [id, tenantId]
    );
    if (po.rows.length === 0) return res.status(404).json({ error: 'Purchase order not found' });

    const items = await db.query(
      `SELECT i.*, p.name AS product_name FROM purchase_order_items i
       JOIN products p ON p.product_id = i.product_id
       WHERE i.po_id = $1`,
      [id]
    );

    res.json({ success: true, message: 'Purchase order retrieved', data: { ...po.rows[0], items: items.rows } });
  } catch (error) {
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { supplierId, expectedDate, notes, items } = req.body;

    if (!supplierId) return res.status(400).json({ error: 'A supplier is required' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'A purchase order must contain at least one line' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const supplier = await client.query(
        'SELECT 1 FROM suppliers WHERE supplier_id = $1 AND tenant_id = $2',
        [supplierId, tenantId]
      );
      if (supplier.rows.length === 0) throw new Error('Supplier not found for this pharmacy');

      const poNumber = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const poRes = await client.query(
        `INSERT INTO purchase_orders (tenant_id, supplier_id, po_number, status, expected_date, notes, raised_by_id)
         VALUES ($1, $2, $3, 'SENT', $4, $5, $6) RETURNING *`,
        [tenantId, supplierId, poNumber, expectedDate || null, notes || null, userId]
      );
      const po = poRes.rows[0];

      for (const line of items) {
        if (!line.productId || !line.quantity || line.quantity <= 0) {
          throw new Error('Every line needs a product and a quantity above zero');
        }
        // Ownership check per line: a purchase order must not reference
        // another pharmacy's catalogue.
        const owned = await client.query(
          'SELECT 1 FROM products WHERE product_id = $1 AND tenant_id = $2',
          [line.productId, tenantId]
        );
        if (owned.rows.length === 0) throw new Error('Product not found for this pharmacy');

        await client.query(
          `INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, unit_cost)
           VALUES ($1, $2, $3, $4)`,
          [po.po_id, line.productId, line.quantity, line.unitCost || 0]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, message: 'Purchase order raised', data: po });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Receiving against a purchase order is what closes the accountability loop:
// the batch, the movement and the order all name the same supplier.
exports.receiveAgainstOrder = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { id } = req.params;
    const { lines } = req.body; // [{ poItemId, quantity, batchNumber, expiryDate }]

    if (!Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({ error: 'Nothing to receive' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const poRes = await client.query(
        'SELECT * FROM purchase_orders WHERE po_id = $1 AND tenant_id = $2 FOR UPDATE',
        [id, tenantId]
      );
      if (poRes.rows.length === 0) throw new Error('Purchase order not found');
      const po = poRes.rows[0];
      if (po.status === 'CANCELLED') throw new Error('This purchase order was cancelled');

      for (const line of lines) {
        const itemRes = await client.query(
          'SELECT * FROM purchase_order_items WHERE po_item_id = $1 AND po_id = $2',
          [line.poItemId, id]
        );
        if (itemRes.rows.length === 0) throw new Error('Line not found on this purchase order');
        const item = itemRes.rows[0];

        const outstanding = item.quantity_ordered - item.quantity_received;
        if (line.quantity <= 0) throw new Error('Received quantity must be above zero');
        if (line.quantity > outstanding) {
          throw new Error(`Cannot receive ${line.quantity}; only ${outstanding} outstanding on that line`);
        }

        const batchRes = await client.query(
          `INSERT INTO product_batches (product_id, tenant_id, batch_number, expiry_date,
                                        initial_quantity, quantity_on_hand, supplier_id)
           VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING batch_id`,
          [item.product_id, tenantId, line.batchNumber, line.expiryDate, line.quantity, po.supplier_id]
        );

        await client.query(
          `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type,
                                        performed_by_id, reference_id, supplier_id, notes)
           VALUES ($1, $2, $3, $4, 'RECEIVE', $5, $6, $7, $8)`,
          [tenantId, item.product_id, batchRes.rows[0].batch_id, line.quantity, userId, po.po_id,
            po.supplier_id, `Received against ${po.po_number}`]
        );

        await client.query(
          'UPDATE purchase_order_items SET quantity_received = quantity_received + $1 WHERE po_item_id = $2',
          [line.quantity, item.po_item_id]
        );
      }

      // The order closes only when every line is fully satisfied.
      const remaining = await client.query(
        'SELECT COUNT(*)::int AS n FROM purchase_order_items WHERE po_id = $1 AND quantity_received < quantity_ordered',
        [id]
      );
      const status = remaining.rows[0].n === 0 ? 'RECEIVED' : 'PARTIALLY_RECEIVED';
      await client.query('UPDATE purchase_orders SET status = $1 WHERE po_id = $2', [status, id]);

      await client.query('COMMIT');
      res.json({ success: true, message: `Stock received, order is now ${status.toLowerCase().replace('_', ' ')}`, data: { status } });
    } catch (err) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: err.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Supplier controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
