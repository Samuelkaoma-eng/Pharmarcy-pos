const db = require('../config/db');
const { fiscalise, verify, NOTICE } = require('../services/fiscalSimulator');

// SIMFIS endpoints. These demonstrate the fiscalisation flow the system is not
// authorised to perform for real. Everything they return is marked simulated,
// and the values are written to columns of their own so a simulated reference
// can never be mistaken for a genuine ZRA Smart Invoice reference recorded
// from an approved system.

exports.getStatus = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const tenant = await db.query('SELECT name, license_number FROM tenants WHERE tenant_id = $1', [tenantId]);

    res.json({
      success: true,
      message: 'Simulated fiscalisation service status',
      data: {
        simulated: true,
        notice: NOTICE,
        approved_provider: false,
        pharmacy: tenant.rows[0]?.name || null,
        // Stated plainly so nobody reading the API mistakes this for readiness.
        real_integration: 'Requires certification by the Zambia Revenue Authority and a Virtual Sales Data Controller.'
      }
    });
  } catch (error) {
    console.error('Fiscal controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.fiscaliseSale = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const saleRes = await db.query(
      `SELECT s.*, t.license_number, t.name AS tenant_name
       FROM sales s JOIN tenants t ON t.tenant_id = s.tenant_id
       WHERE s.sale_id = $1 AND s.tenant_id = $2`,
      [id, tenantId]
    );
    if (saleRes.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const sale = saleRes.rows[0];

    if (sale.simulated_fiscal_ref) {
      return res.status(409).json({ error: 'This sale has already been fiscalised' });
    }

    const result = fiscalise({
      tenantId,
      tenantTpin: sale.license_number,
      receiptNumber: sale.receipt_number,
      subtotal: sale.subtotal,
      taxAmount: sale.tax_amount,
      total: sale.total,
      dateTime: sale.date_time
    });

    if (result.error) return res.status(400).json({ error: result.error });

    await db.query(
      `UPDATE sales SET simulated_fiscal_ref = $1, simulated_fiscal_signature = $2,
                        simulated_fiscal_counter = $3, simulated_fiscal_at = $4
       WHERE sale_id = $5`,
      [result.reference, result.signature, result.fiscal_counter, result.issued_at, id]
    );

    res.status(201).json({ success: true, message: 'Sale fiscalised (simulated)', data: result });
  } catch (error) {
    console.error('Fiscal controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Re-signs the sale as stored and compares. This is what makes the exercise
// worth doing: altering a total after the fact breaks the signature, which is
// precisely the property real fiscalisation exists to provide.
exports.verifySale = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;

    const saleRes = await db.query(
      `SELECT s.*, t.license_number FROM sales s JOIN tenants t ON t.tenant_id = s.tenant_id
       WHERE s.sale_id = $1 AND s.tenant_id = $2`,
      [id, tenantId]
    );
    if (saleRes.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });

    const sale = saleRes.rows[0];
    if (!sale.simulated_fiscal_ref) {
      return res.status(404).json({ error: 'This sale has not been fiscalised' });
    }

    const result = verify({
      tenantId,
      tenantTpin: sale.license_number,
      receiptNumber: sale.receipt_number,
      subtotal: sale.subtotal,
      taxAmount: sale.tax_amount,
      total: sale.total,
      issuedAt: new Date(sale.simulated_fiscal_at).toISOString(),
      fiscalCounter: sale.simulated_fiscal_counter,
      signature: sale.simulated_fiscal_signature
    });

    res.json({
      success: true,
      message: result.matches
        ? 'Signature matches the stored sale'
        : 'Signature does not match: the sale was altered after it was fiscalised',
      data: result
    });
  } catch (error) {
    console.error('Fiscal controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
