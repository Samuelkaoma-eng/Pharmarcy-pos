const db = require('../config/db');

exports.getProducts = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { search, category, status } = req.query;

    let query = `
      SELECT p.*, COALESCE((SELECT SUM(quantity) FROM stock_movements sm WHERE sm.product_id = p.product_id), 0) as quantity_on_hand
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
    const { name, barcode, dosage, category, cost_price, selling_price, unit_of_measure, requires_prescription } = req.body;

    if (!name || selling_price === undefined) {
      return res.status(400).json({ error: 'Product name and selling_price are required' });
    }

    const result = await db.query(
      `INSERT INTO products (tenant_id, name, barcode, dosage, category, cost_price, selling_price, unit_of_measure, requires_prescription) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [tenantId, name, barcode, dosage, category, cost_price || 0, selling_price, unit_of_measure || 'tablet', requires_prescription || false]
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
    const { name, selling_price, state } = req.body;

    const result = await db.query(
      'UPDATE products SET name = $1, selling_price = $2, state = $3 WHERE product_id = $4 AND tenant_id = $5 RETURNING *',
      [name, selling_price, state || 'ACTIVE', id, tenantId]
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
    const result = await db.query(`
      SELECT p.*, COALESCE((SELECT SUM(quantity) FROM stock_movements sm WHERE sm.product_id = p.product_id), 0) as quantity_on_hand
      FROM products p
      WHERE p.tenant_id = $1
    `, [tenantId]);
    
    const lowStock = result.rows.filter(p => p.quantity_on_hand <= (p.reorder_level || 20));
    return res.json({ success: true, message: 'Low stock products retrieved', data: lowStock });
  } catch (error) {
    console.error('Get low stock error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getExpiryAlerts = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await db.query(`
      SELECT b.*, p.name as product_name
      FROM product_batches b
      JOIN products p ON b.product_id = p.product_id
      WHERE b.tenant_id = $1 AND b.expiry_date <= CURRENT_DATE + INTERVAL '90 days'
      AND b.quantity_on_hand > 0
    `, [tenantId]);
    return res.json({ success: true, message: 'Expiry alerts retrieved', data: result.rows });
  } catch (error) {
    console.error('Get expiry alerts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
