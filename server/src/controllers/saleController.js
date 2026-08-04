const db = require('../config/db');
const { openSessionFor } = require('./tillController');

// Standard rate. Applied only to products marked STANDARD; medicines are
// zero-rated under Group 6 of the Zambian VAT (Zero-Rating) Order.
const VAT_RATE = 0.16;

exports.createSale = async (req, res) => {
  try {
    const { tenantId, userId } = req.user;
    const { customerId, prescriptionId, visitId, items, paymentType = 'cash', smartInvoiceRef } = req.body;
    // items: [{productId, batchId, quantity}]

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Sale transaction must contain at least one item' });
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      let computedSubtotal = 0;
      let computedTaxAmount = 0;
      const validatedItems = [];

      // The shift this sale belongs to. A sale used to belong to a cashier but
      // not to a shift, so takings could not be reconciled against a drawer and
      // a shortfall was invisible (LIM-004).
      //
      // Where the pharmacy has turned till control on, no open session means no
      // sale: an unattributable taking is exactly what the control exists to
      // prevent. Where it is off, the sale still binds to an open session when
      // there is one, so reconciliation works for pharmacies easing into it.
      const tillSession = await openSessionFor(client, userId, tenantId);

      const tillPolicy = await client.query(
        'SELECT require_till_session FROM tenants WHERE tenant_id = $1',
        [tenantId]
      );

      if (tillPolicy.rows[0]?.require_till_session && !tillSession) {
        throw new Error('NO TILL SESSION: open a till session before ringing up a sale');
      }

      const tillSessionId = tillSession ? tillSession.till_session_id : null;

      // 0. Resolve the prescription once, before pricing anything.
      // Supplying an id was previously the whole of the check: the prescription
      // was never loaded, so an unverified one, one written a year ago, or one
      // listing entirely different medicines all unlocked a controlled sale.
      let prescribed = new Map();

      if (prescriptionId) {
        const prescRes = await client.query(
          `SELECT prescription_id, status, valid_until,
                  valid_until IS NOT NULL AND valid_until < CURRENT_DATE AS has_lapsed
           FROM prescriptions
           WHERE prescription_id = $1 AND tenant_id = $2`,
          [prescriptionId, tenantId]
        );

        if (prescRes.rows.length === 0) {
          throw new Error('Prescription not found for this pharmacy');
        }

        const prescription = prescRes.rows[0];

        // A pharmacist's verification is what makes a prescription dispensable.
        if (prescription.status !== 'VERIFIED') {
          throw new Error(
            `PRESCRIPTION NOT VERIFIED: this prescription is ${prescription.status.toLowerCase()} and must be verified by a pharmacist before dispensing`
          );
        }

        if (prescription.has_lapsed) {
          throw new Error(
            `PRESCRIPTION EXPIRED: it lapsed on ${new Date(prescription.valid_until).toISOString().slice(0, 10)}`
          );
        }

        const prescItems = await client.query(
          'SELECT product_id, quantity FROM prescription_items WHERE prescription_id = $1',
          [prescriptionId]
        );

        prescribed = new Map(prescItems.rows.map((r) => [r.product_id, r.quantity]));
      }

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
        if (product.requires_prescription) {
          if (!prescriptionId) {
            throw new Error(`PRESCRIPTION REQUIRED: Product '${product.name}' requires a valid prescription ID`);
          }

          // The prescription has to authorise this medicine, not merely exist.
          // Checking only that one was supplied let any prescription unlock any
          // controlled drug in the catalogue.
          if (!prescribed.has(product.product_id)) {
            throw new Error(
              `NOT PRESCRIBED: the prescription supplied does not list '${product.name}'`
            );
          }

          const authorised = prescribed.get(product.product_id);
          if (item.quantity > authorised) {
            throw new Error(
              `EXCEEDS PRESCRIPTION: '${product.name}' is prescribed as ${authorised}, ${item.quantity} requested`
            );
          }
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

      // The patient this sale is recorded against, resolved once and scoped to
      // this pharmacy. The name is read here so the response can carry the value
      // that was actually written: the receipt printed for the patient headed
      // every sale "Counter sale", because the response named no customer at
      // all, and a document handed to a named patient must not say otherwise.
      let customerName = null;

      if (customerId) {
        const customerRes = await client.query(
          'SELECT customer_id, name FROM customers WHERE customer_id = $1 AND tenant_id = $2',
          [customerId, tenantId]
        );

        if (customerRes.rows.length === 0) {
          throw new Error('Patient not found for this pharmacy');
        }

        customerName = customerRes.rows[0].name;
      }

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
      // A visit named on the sale must be this pharmacy's and still open, so
      // the walk-in-to-till trail cannot be fabricated after the fact.
      let resolvedVisitId = null;
      if (visitId) {
        const visitRes = await client.query(
          'SELECT visit_id, status FROM visits WHERE visit_id = $1 AND tenant_id = $2',
          [visitId, tenantId]
        );
        if (visitRes.rows.length === 0) {
          throw new Error('Visit not found for this pharmacy');
        }
        if (['COMPLETED', 'CANCELLED'].includes(visitRes.rows[0].status)) {
          throw new Error('That visit is already closed');
        }
        resolvedVisitId = visitRes.rows[0].visit_id;
      }

      const saleRes = await client.query(
        `INSERT INTO sales (tenant_id, receipt_number, subtotal, tax_amount, total, status, user_id,
                            customer_id, prescription_id, visit_id, till_session_id, scheme_id, scheme_covered,
                            patient_payable, smart_invoice_ref)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING sale_id`,
        [
          tenantId, receiptNumber, computedSubtotal, computedTaxAmount, computedTotal, 'COMPLETED',
          userId, customerId || null, prescriptionId || null, resolvedVisitId, tillSessionId, schemeId, schemeCovered, patientPayable,
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
          customer_id: customerId || null,
          // Null for a genuine walk-in, which is what lets the receipt fall
          // back to "Counter sale" honestly.
          customer_name: customerName,
          subtotal: computedSubtotal.toFixed(2),
          tax_amount: computedTaxAmount.toFixed(2),
          total: computedTotal.toFixed(2),
          scheme_covered: schemeCovered.toFixed(2),
          patient_payable: patientPayable.toFixed(2),
          smart_invoice_ref: smartInvoiceRef || null,
          till_session_id: tillSessionId
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
    // The history screen shows who served and how it was settled. Both used to
    // be missing from this response, which is why that screen had invented them.
    const result = await db.query(
      `SELECT s.*,
              u.full_name AS cashier,
              (SELECT p.payment_type FROM payments p WHERE p.sale_id = s.sale_id LIMIT 1) AS payment_type
       FROM sales s
       LEFT JOIN users u ON u.user_id = s.user_id
       WHERE s.tenant_id = $1
       ORDER BY s.date_time DESC
       LIMIT 100`,
      [tenantId]
    );
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
