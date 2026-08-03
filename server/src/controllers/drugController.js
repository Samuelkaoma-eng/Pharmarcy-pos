const db = require('../config/db');
const { searchDrugs, checkInteractions } = require('../services/drugDirectory');

// Look a medicine up in the openFDA directory so the catalogue entry can be
// filled in from a reference source instead of typed from memory.
exports.search = async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Provide at least two characters to search' });
    }

    const result = await searchDrugs(q.trim(), limit);
    if (result.error) {
      // The directory being unreachable is not a server fault, and the
      // pharmacist can still enter the product by hand.
      return res.status(502).json({ error: `Drug directory unavailable: ${result.error}` });
    }

    res.json({ success: true, message: 'Directory results retrieved', data: result.results });
  } catch (error) {
    console.error('Drug controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Checks the basket for known interactions between the medicines in it.
// Advisory only: it informs the pharmacist, it does not block the sale. A
// directory outage must never stop a pharmacy trading.
exports.checkBasket = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { productIds } = req.body;

    if (!Array.isArray(productIds) || productIds.length < 2) {
      return res.json({
        success: true,
        message: 'Nothing to check',
        data: { available: true, interactions: [], checked: productIds?.length || 0 }
      });
    }

    // Names come from the pharmacy's own catalogue, scoped to the tenant, so
    // one pharmacy cannot probe another's stock through this endpoint.
    const products = await db.query(
      'SELECT name, generic_name FROM products WHERE product_id = ANY($1::uuid[]) AND tenant_id = $2',
      [productIds, tenantId]
    );

    // The generic name resolves far more reliably against RxNorm than a brand.
    const names = products.rows.map((p) => p.generic_name || p.name);

    const result = await checkInteractions(names);

    // "No known interactions" is only ever said when a screen actually ran.
    // Where it could not, that is reported as such, so nobody reads silence as
    // a clean bill of health.
    const message = !result.available
      ? 'Basket could not be screened'
      : result.interactions.length > 0
        ? 'Interactions found'
        : 'No known interactions';

    res.json({ success: true, message, data: result });
  } catch (error) {
    console.error('Drug controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
