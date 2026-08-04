const db = require('../config/db');

// How a product is taxed. Medicines are zero-rated under Group 6 of the Zambian
// VAT (Zero-Rating) Order, which is why that is the default; sundries sold
// alongside them carry the standard rate. The field was previously unreachable
// from the API, so every product a pharmacy added was zero-rated whatever it
// actually was.
const VAT_TREATMENTS = ['ZERO_RATED', 'STANDARD', 'EXEMPT'];
const PRODUCT_STATES = ['ACTIVE', 'DISCONTINUED'];

exports.getProducts = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { search, category, status } = req.query;

    // Stock on hand is the sum of what the batches hold. It was previously the
    // sum of the movement ledger, which is a different question and gave a
    // different answer: any batch opened without a matching RECEIVE movement
    // read as zero, and a later dispense drove the figure negative. The guards
    // at checkout enforce against the batch quantities, so the screen has to
    // report the same number the till will act on.
    let query = `
      SELECT p.*, COALESCE((
        SELECT SUM(b.quantity_on_hand) FROM product_batches b
        WHERE b.product_id = p.product_id AND b.tenant_id = p.tenant_id
      ), 0)::int as quantity_on_hand
      FROM products p
      WHERE p.tenant_id = $1
    `;
    const params = [tenantId];
    let paramIndex = 2;

    if (search) {
      query += ` AND p.name ILIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (category) {
      query += ` AND p.category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND p.state = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    const result = await db.query(query, params);
    return res.json({ success: true, message: 'Products retrieved', data: result.rows });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ error: 'Server error retrieving products' });
  }
};

exports.getProduct = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const result = await db.query('SELECT * FROM products WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    
    const product = result.rows[0];
    const batches = await db.query('SELECT * FROM product_batches WHERE product_id = $1 AND tenant_id = $2', [id, tenantId]);
    const movements = await db.query('SELECT * FROM stock_movements WHERE product_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 10', [id, tenantId]);
    
    product.batches = batches.rows;
    product.recent_movements = movements.rows;
    
    return res.json({ success: true, message: 'Product retrieved', data: product });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const {
      name, barcode, dosage, category, cost_price, selling_price, unit_of_measure,
      requires_prescription, vat_treatment, reorder_level,
      generic_name, manufacturer, ndc_code
    } = req.body;

    if (!name || selling_price === undefined) {
      return res.status(400).json({ error: 'Product name and selling_price are required' });
    }
    if (vat_treatment && !VAT_TREATMENTS.includes(vat_treatment)) {
      return res.status(400).json({ error: `VAT treatment must be one of: ${VAT_TREATMENTS.join(', ')}` });
    }

    const result = await db.query(
      `INSERT INTO products (tenant_id, name, barcode, dosage, category, cost_price, selling_price,
                             unit_of_measure, requires_prescription, vat_treatment, reorder_level,
                             generic_name, manufacturer, ndc_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'ZERO_RATED'), COALESCE($11, 10), $12, $13, $14)
       RETURNING *`,
      [
        tenantId, name, barcode, dosage, category, cost_price || 0, selling_price,
        unit_of_measure || 'tablet', requires_prescription || false, vat_treatment || null,
        reorder_level ?? null, generic_name || null, manufacturer || null, ndc_code || null
      ]
    );

    return res.status(201).json({ success: true, message: 'Product created', data: result.rows[0] });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Server error creating product' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const {
      name, selling_price, cost_price, state, category, dosage, barcode,
      unit_of_measure, requires_prescription, vat_treatment, reorder_level
    } = req.body;

    if (vat_treatment && !VAT_TREATMENTS.includes(vat_treatment)) {
      return res.status(400).json({ error: `VAT treatment must be one of: ${VAT_TREATMENTS.join(', ')}` });
    }
    if (state && !PRODUCT_STATES.includes(state)) {
      return res.status(400).json({ error: `State must be one of: ${PRODUCT_STATES.join(', ')}` });
    }

    // Every field coalesces to what is already stored. Assigning unconditionally
    // meant a request sending only a price tried to write null over the name,
    // and an omitted state silently reinstated a discontinued line.
    const result = await db.query(
      `UPDATE products SET
         name = COALESCE($1, name),
         selling_price = COALESCE($2, selling_price),
         cost_price = COALESCE($3, cost_price),
         state = COALESCE($4, state),
         category = COALESCE($5, category),
         dosage = COALESCE($6, dosage),
         barcode = COALESCE($7, barcode),
         unit_of_measure = COALESCE($8, unit_of_measure),
         requires_prescription = COALESCE($9, requires_prescription),
         vat_treatment = COALESCE($10, vat_treatment),
         reorder_level = COALESCE($11, reorder_level)
       WHERE product_id = $12 AND tenant_id = $13 RETURNING *`,
      [
        name ?? null, selling_price ?? null, cost_price ?? null, state ?? null,
        category ?? null, dosage ?? null, barcode ?? null, unit_of_measure ?? null,
        requires_prescription ?? null, vat_treatment ?? null, reorder_level ?? null,
        id, tenantId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({ success: true, message: 'Product updated', data: result.rows[0] });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getLowStock = async (req, res) => {
  try {
    const { tenantId } = req.user;
    // Same source as getProducts, and the same one the checkout guards use.
    // The threshold is the product's own reorder level, which the schema
    // defaults to 10; the previous `|| 20` silently applied a different
    // threshold to any product whose level was zero.
    const result = await db.query(`
      SELECT p.*, COALESCE((
        SELECT SUM(b.quantity_on_hand) FROM product_batches b
        WHERE b.product_id = p.product_id AND b.tenant_id = p.tenant_id
      ), 0)::int as quantity_on_hand
      FROM products p
      WHERE p.tenant_id = $1 AND p.state = 'ACTIVE'
    `, [tenantId]);

    const lowStock = result.rows.filter((p) => p.quantity_on_hand <= (p.reorder_level ?? 10));
    return res.json({ success: true, message: 'Low stock products retrieved', data: lowStock });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getExpiryAlerts = async (req, res) => {
  try {
    const { tenantId } = req.user;
    // The alert window is a per-pharmacy setting managed from the ControlHub,
    // so it is read here rather than hardcoded.
    const result = await db.query(`
      SELECT b.*, p.name as product_name
      FROM product_batches b
      JOIN products p ON b.product_id = p.product_id
      JOIN tenants t ON t.tenant_id = b.tenant_id
      WHERE b.tenant_id = $1
      AND b.expiry_date <= CURRENT_DATE + (t.expiry_alert_days * INTERVAL '1 day')
      AND b.quantity_on_hand > 0
      ORDER BY b.expiry_date ASC
    `, [tenantId]);
    return res.json({ success: true, message: 'Expiry alerts retrieved', data: result.rows });
  } catch (error) {
    console.error('Get expiry alerts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
