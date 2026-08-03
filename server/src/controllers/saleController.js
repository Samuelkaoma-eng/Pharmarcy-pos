const db = require('../config/db');

// Standard rate. Applied only to products marked STANDARD; medicines are
// zero-rated under Group 6 of the Zambian VAT (Zero-Rating) Order.
const VAT_RATE = 0.16;

exports.createSale = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { customerId, prescriptionId, items, paymentType = 'cash', smartInvoiceRef } = req.body;
    // items: [{productId, batchId, quantity}]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale transaction must contain at least one item' });
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      let computedSubtotal = 0;
      let computedTaxAmount = 0;
      const validatedItems = [];

      // 1. Fetch official DB prices and calculate subtotals on server side
      for (const item of items) {
        if (!item.productId || !item.quantity || item.quantity <= 0) {
          throw new Error('Invalid item quantity or product ID');
        }

        const prodRes = await client.query(
          'SELECT product_id, name, selling_price, requires_prescription, vat_treatment FROM products WHERE product_id = $1 AND tenant_id = $2',
          [item.productId, tenantId]
        );

        if (prodRes.rows.length === 0) {
          throw new Error(`Product not found: ${item.productId}`);
        }

        const product = prodRes.rows[0];

        // Prescription Guard Check
        if (product.requires_prescription && !prescriptionId) {
          throw new Error(`PRESCRIPTION REQUIRED: Product '${product.name}' requires a valid prescription ID`);
        }

        // Expiry Guard Check
        // A named batch must be the caller's own and still in date. With no
        // batch named we pick first-expired-first-out from what is still in
        // date, and refuse the sale when every tracked batch has expired.
        let resolvedBatchId = null;

        if (item.batchId) {
          const batchRes = await client.query(
            `SELECT batch_id, batch_number, expiry_date, quantity_on_hand,
                    expiry_date < CURRENT_DATE AS is_expired
             FROM product_batches
             WHERE batch_id = $1 AND product_id = $2 AND tenant_id = $3`,
            [item.batchId, product.product_id, tenantId]
          );

          if (batchRes.rows.length === 0) {
            throw new Error(`Batch not found for product '${product.name}'`);
          }
          if (batchRes.rows[0].is_expired) {
            throw new Error(
              `EXPIRED STOCK: Batch '${batchRes.rows[0].batch_number}' of '${product.name}' expired on ${new Date(batchRes.rows[0].expiry_date).toISOString().slice(0, 10)}`
            );
          }
          if (batchRes.rows[0].quantity_on_hand < item.quantity) {
            throw new Error(
              `INSUFFICIENT STOCK: batch '${batchRes.rows[0].batch_number}' holds ${batchRes.rows[0].quantity_on_hand} of '${product.name}', ${item.quantity} requested`
            );
          }
          resolvedBatchId = batchRes.rows[0].batch_id;
        } else {
          const tracked = await client.query(
            `SELECT batch_id, expiry_date >= CURRENT_DATE AS is_sellable, quantity_on_hand
             FROM product_batches
             WHERE product_id = $1 AND tenant_id = $2
             ORDER BY expiry_date ASC`,
            [product.product_id, tenantId]
          );

          const sellable = tracked.rows.filter((b) => b.is_sellable && b.quantity_on_hand > 0);

          if (tracked.rows.length > 0 && sellable.length === 0) {
            throw new Error(`EXPIRED STOCK: All batches of '${product.name}' are expired or out of stock`);
          }

          // Stock Guard Check
          // A pharmacy cannot dispense what it does not hold. Without this the
          // sale still succeeded and drove quantity_on_hand negative.
          if (sellable.length > 0) {
            const available = sellable.reduce((sum, b) => sum + b.quantity_on_hand, 0);
            if (available < item.quantity) {
              throw new Error(
                `INSUFFICIENT STOCK: only ${available} of '${product.name}' remain in date, ${item.quantity} requested`
              );
            }
          }

          // Products with no batch records are untracked stock and stay sellable.
          resolvedBatchId = sellable.length > 0 ? sellable[0].batch_id : null;
        }

        const unitPrice = parseFloat(product.selling_price);
        const itemSubtotal = unitPrice * item.quantity;
        computedSubtotal += itemSubtotal;

        // VAT is decided per product, not as one blanket rate. Medicines are
        // zero-rated under Group 6 of the Zambian VAT (Zero-Rating) Order, so
        // charging 16% across the basket overcharged on every dispensed item.
        const itemTax = product.vat_treatment === 'STANDARD' ? itemSubtotal * VAT_RATE : 0;
        computedTaxAmount += itemTax;

        validatedItems.push({
          productId: product.product_id,
          batchId: resolvedBatchId,
          unitPrice,
          quantity: item.quantity,
          subtotal: itemSubtotal
        });
      }

      const computedTotal = computedSubtotal + computedTaxAmount;

      // Insurance. The scheme covers its declared share of the basket and the
      // patient pays the balance; the sale total is unchanged either way.
      let schemeId = null;
      let schemeCovered = 0;

      if (customerId) {
        const cover = await client.query(
          `SELECT s.scheme_id, s.cover_percent
           FROM scheme_memberships m
           JOIN insurance_schemes s ON s.scheme_id = m.scheme_id
           WHERE m.customer_id = $1 AND m.tenant_id = $2
             AND m.is_active AND s.is_active
             AND (m.valid_until IS NULL OR m.valid_until >= CURRENT_DATE)
           LIMIT 1`,
          [customerId, tenantId]
        );

        if (cover.rows.length > 0) {
          schemeId = cover.rows[0].scheme_id;
          schemeCovered = computedTotal * (parseFloat(cover.rows[0].cover_percent) / 100);
        }
      }

      const patientPayable = computedTotal - schemeCovered;

      // 2. Generate Receipt Number Sequence
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      const receiptNumber = `REC-${dateStr}-${randomNum}`;

      // 3. Insert Sale Record
      const saleRes = await client.query(
        `INSERT INTO sales (tenant_id, receipt_number, subtotal, tax_amount, total, status, user_id,
                            customer_id, prescription_id, scheme_id, scheme_covered, patient_payable,
                            smart_invoice_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING sale_id`,
        [
          tenantId, receiptNumber, computedSubtotal, computedTaxAmount, computedTotal, 'COMPLETED',
          userId, customerId || null, prescriptionId || null, schemeId, schemeCovered, patientPayable,
          // Recorded when the pharmacy's ZRA-approved system has issued one.
          // Never generated here: this is not an approved invoicing provider.
          smartInvoiceRef || null
        ]
      );
      const saleId = saleRes.rows[0].sale_id;

      // 4. Insert Items & Record Stock Movements
      for (const item of validatedItems) {
        await client.query(
          'INSERT INTO sale_items (sale_id, product_id, batch_id, unit_price, quantity, subtotal) VALUES ($1, $2, $3, $4, $5, $6)',
          [saleId, item.productId, item.batchId, item.unitPrice, item.quantity, item.subtotal]
        );

        if (item.batchId) {
          await client.query(
            'UPDATE product_batches SET quantity_on_hand = GREATEST(0, quantity_on_hand - $1) WHERE batch_id = $2 AND tenant_id = $3',
            [item.quantity, item.batchId, tenantId]
          );
        }

        await client.query(
          `INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, reference_id, notes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, item.productId, item.batchId, -item.quantity, 'DISPENSE', userId, saleId, 'Sale transaction complete']
        );
      }

      // 5. Insert Payment
      await client.query(
        'INSERT INTO payments (tenant_id, sale_id, amount, payment_type) VALUES ($1, $2, $3, $4)',
        [tenantId, saleId, computedTotal, paymentType]
      );

      if (prescriptionId) {
        await client.query('UPDATE prescriptions SET status = $1 WHERE prescription_id = $2 AND tenant_id = $3', ['DISPENSED', prescriptionId, tenantId]);
      }

      await client.query('COMMIT');
      return res.status(201).json({
        success: true,
        message: 'Sale transaction processed successfully',
        data: {
          sale_id: saleId,
          receipt_number: receiptNumber,
          subtotal: computedSubtotal.toFixed(2),
          tax_amount: computedTaxAmount.toFixed(2),
          total: computedTotal.toFixed(2),
          scheme_covered: schemeCovered.toFixed(2),
          patient_payable: patientPayable.toFixed(2),
          smart_invoice_ref: smartInvoiceRef || null
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Sale transaction error:', err.message);
      return res.status(400).json({ error: err.message || 'Failed to process sale' });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Create sale server error:', error);
    res.status(500).json({ error: 'Server error processing sale' });
  }
};

exports.getSales = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await db.query('SELECT * FROM sales WHERE tenant_id = $1 ORDER BY date_time DESC LIMIT 100', [tenantId]);
    res.json({ success: true, message: 'Sales retrieved', data: result.rows });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({ error: 'Server error retrieving sales' });
  }
};

exports.getSale = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const saleRes = await db.query('SELECT * FROM sales WHERE sale_id = $1 AND tenant_id = $2', [id, tenantId]);
    if (saleRes.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const itemsRes = await db.query(`
      SELECT si.*, p.name as product_name 
      FROM sale_items si 
      JOIN products p ON si.product_id = p.product_id 
      WHERE si.sale_id = $1
    `, [id]);

    res.json({ success: true, message: 'Sale retrieved', data: { ...saleRes.rows[0], items: itemsRes.rows } });
  } catch (error) {
    console.error('Get sale error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
