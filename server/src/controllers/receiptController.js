const db = require('../config/db');

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

exports.getReceiptHtml = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { receiptNumber } = req.params;

    let tenant = { name: 'Pharmacy', address: 'Address', phone: 'Phone', currency_symbol: 'K' };
    let sale = { date_time: new Date(), receipt_number: receiptNumber, subtotal: 0, tax_amount: 0, total: 0 };
    let items = [];

    const tRes = await db.query('SELECT * FROM tenants WHERE tenant_id = $1', [tenantId]);
    if (tRes.rows.length > 0) tenant = tRes.rows[0];

    const sRes = await db.query('SELECT * FROM sales WHERE receipt_number = $1 AND tenant_id = $2', [receiptNumber, tenantId]);
    if (sRes.rows.length === 0) return res.status(404).send('Sale not found');
    sale = sRes.rows[0];

    const iRes = await db.query(`
      SELECT si.*, p.name 
      FROM sale_items si 
      JOIN products p ON si.product_id = p.product_id 
      WHERE si.sale_id = $1
    `, [sale.sale_id]);
    items = iRes.rows;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Receipt - ${escapeHtml(sale.receipt_number)}</title>
          <style>
            body { font-family: monospace; width: 300px; margin: 0 auto; padding: 20px; color: #000; background: #fff; }
            .text-center { text-align: center; }
            .item-row { display: flex; justify-content: space-between; }
            .divider { border-top: 1px dashed #000; margin: 10px 0; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="text-center">
            <h2>${escapeHtml(tenant.name)}</h2>
            <p>${escapeHtml(tenant.address)}<br>${escapeHtml(tenant.phone)}</p>
          </div>
          <div class="divider"></div>
          <p>Receipt: ${escapeHtml(sale.receipt_number)}<br>Date: ${escapeHtml(new Date(sale.date_time).toLocaleString())}</p>
          <div class="divider"></div>
          ${items.map(i => `
            <div class="item-row">
              <span>${escapeHtml(i.name)} x${escapeHtml(i.quantity)}</span>
              <span>${escapeHtml(tenant.currency_symbol || 'K')} ${Number(i.subtotal).toFixed(2)}</span>
            </div>
          `).join('')}
          <div class="divider"></div>
          <div class="item-row"><strong>Subtotal:</strong> <span>${escapeHtml(tenant.currency_symbol || 'K')} ${Number(sale.subtotal).toFixed(2)}</span></div>
          <div class="item-row"><strong>VAT (16%):</strong> <span>${escapeHtml(tenant.currency_symbol || 'K')} ${Number(sale.tax_amount).toFixed(2)}</span></div>
          <div class="item-row"><strong>TOTAL:</strong> <strong>${escapeHtml(tenant.currency_symbol || 'K')} ${Number(sale.total).toFixed(2)}</strong></div>
          <div class="divider"></div>
          <p class="text-center">Thank you for your visit!</p>
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    console.error('Receipt generation error:', error);
    res.status(500).send('Server error');
  }
};
