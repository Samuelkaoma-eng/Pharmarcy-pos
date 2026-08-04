const db = require('../config/db');

// Reporting: what the pharmacy owes, what it holds, what it sold, and who
// dispensed what.
//
// The system recorded all of this and could not report any of it. An owner
// could not see a day's takings, and a VAT-registered pharmacy had no way to
// produce the figures a return needs — despite the sale path having carefully
// separated standard-rated from zero-rated lines since DEF-034.
//
// Two rules hold across every report here:
//
//   * Every figure is computed from recorded rows at the moment it is asked
//     for. Nothing is cached and nothing is stored as a "report", because a
//     stale tax figure is worse than no tax figure.
//   * **Nothing here is a tax return, and nothing here is a Smart Invoice.**
//     These are the pharmacy's own working figures, for its accountant to
//     prepare a return from. This system is not a ZRA-approved invoicing
//     provider, so it summarises what it recorded and never issues a document
//     that could be mistaken for a filing.

const NOT_A_RETURN =
  "These are working figures prepared from this pharmacy's own records. " +
  'They are not a tax return and not a ZRA Smart Invoice. ' +
  'A return must be filed through an approved system.';

const VAT_RATE = 0.16;

// A report always covers a stated window. Defaulting silently to "today" and
// labelling it nothing would let a figure be read as covering a different
// period than it does.
const resolveRange = (query) => {
  const to = query.to || new Date().toISOString().slice(0, 10);
  const from = query.from || to;
  return { from, to };
};

const money = (v) => Number(parseFloat(v || 0).toFixed(2));

/**
 * VAT summary. The figures an accountant needs to prepare a return: what was
 * sold at the standard rate, what was zero-rated, what was exempt, and the
 * output tax charged.
 *
 * Split per line rather than per sale, because a basket can mix a zero-rated
 * medicine with a standard-rated general good and the totals must not blur.
 */
exports.vatSummary = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { from, to } = resolveRange(req.query);

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      `SELECT p.vat_treatment,
              COUNT(DISTINCT s.sale_id)::int AS sale_count,
              COALESCE(SUM(si.subtotal), 0)  AS net_sales
       FROM sale_items si
       JOIN sales s    ON s.sale_id = si.sale_id
       JOIN products p ON p.product_id = si.product_id
       WHERE s.tenant_id = $1
         AND s.status = 'COMPLETED'
         AND s.date_time::date BETWEEN $2 AND $3
       GROUP BY p.vat_treatment`,
      [tenantId, from, to]
    );

    const bucket = { STANDARD: 0, ZERO_RATED: 0, EXEMPT: 0 };
    let sales = 0;
    for (const row of result.rows) {
      bucket[row.vat_treatment] = money(row.net_sales);
      sales += row.sale_count;
    }

    // Output tax is derived from the standard-rated lines only. Applying the
    // rate to the whole basket is exactly the error DEF-034 was.
    const outputTax = money(bucket.STANDARD * VAT_RATE);

    // Reconciled against what the sales actually recorded, so a mismatch
    // surfaces here rather than in a return.
    const recorded = await db.query(
      `SELECT COALESCE(SUM(tax_amount), 0) AS tax, COALESCE(SUM(total), 0) AS total
       FROM sales
       WHERE tenant_id = $1 AND status = 'COMPLETED' AND date_time::date BETWEEN $2 AND $3`,
      [tenantId, from, to]
    );

    const recordedTax = money(recorded.rows[0].tax);

    res.json({
      message: 'VAT summary prepared',
      notice: NOT_A_RETURN,
      data: {
        period: { from, to },
        sale_count: sales,
        standard_rated_net: bucket.STANDARD,
        zero_rated_net: bucket.ZERO_RATED,
        exempt_net: bucket.EXEMPT,
        vat_rate: VAT_RATE,
        output_tax_calculated: outputTax,
        output_tax_recorded: recordedTax,
        // Should be zero. A non-zero figure means a sale was priced under a
        // different rule than the one in force now, and is worth investigating
        // before anything is filed.
        variance: money(recordedTax - outputTax),
        gross_takings: money(recorded.rows[0].total)
      }
    });
  } catch (error) {
    console.error('Report controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Trading summary for the owner: takings by day, by payment method, and by
 * who served, plus the discrepancy between what the tills expected and what
 * was counted.
 */
exports.tradingSummary = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { from, to } = resolveRange(req.query);

    if (!db.isDbAvailable()) return db.unavailable(res);

    const daily = await db.query(
      `SELECT s.date_time::date AS day,
              COUNT(*)::int AS sale_count,
              COALESCE(SUM(s.subtotal), 0) AS net,
              COALESCE(SUM(s.tax_amount), 0) AS tax,
              COALESCE(SUM(s.total), 0) AS gross,
              COALESCE(SUM(s.scheme_covered), 0) AS scheme_covered,
              COALESCE(SUM(s.patient_payable), 0) AS patient_paid
       FROM sales s
       WHERE s.tenant_id = $1 AND s.status = 'COMPLETED' AND s.date_time::date BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 1`,
      [tenantId, from, to]
    );

    const byMethod = await db.query(
      `SELECT p.payment_type, COUNT(*)::int AS count, COALESCE(SUM(p.amount), 0) AS amount
       FROM payments p
       JOIN sales s ON s.sale_id = p.sale_id
       WHERE s.tenant_id = $1 AND s.status = 'COMPLETED' AND s.date_time::date BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 3 DESC`,
      [tenantId, from, to]
    );

    const byStaff = await db.query(
      `SELECT u.full_name AS served_by, COUNT(*)::int AS sale_count,
              COALESCE(SUM(s.total), 0) AS gross
       FROM sales s
       LEFT JOIN users u ON u.user_id = s.user_id
       WHERE s.tenant_id = $1 AND s.status = 'COMPLETED' AND s.date_time::date BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 3 DESC`,
      [tenantId, from, to]
    );

    // The reason till sessions exist. An owner asking "did the drawers balance"
    // gets a number rather than a shrug.
    const till = await db.query(
      `SELECT COUNT(*)::int AS closed_sessions,
              COALESCE(SUM(variance), 0) AS net_variance,
              COALESCE(SUM(CASE WHEN variance < 0 THEN variance ELSE 0 END), 0) AS total_short,
              COALESCE(SUM(CASE WHEN variance > 0 THEN variance ELSE 0 END), 0) AS total_over
       FROM till_sessions
       WHERE tenant_id = $1 AND status = 'CLOSED' AND opened_at::date BETWEEN $2 AND $3`,
      [tenantId, from, to]
    );

    const top = await db.query(
      `SELECT p.name AS product, SUM(si.quantity)::int AS units,
              COALESCE(SUM(si.subtotal), 0) AS net
       FROM sale_items si
       JOIN sales s    ON s.sale_id = si.sale_id
       JOIN products p ON p.product_id = si.product_id
       WHERE s.tenant_id = $1 AND s.status = 'COMPLETED' AND s.date_time::date BETWEEN $2 AND $3
       GROUP BY 1 ORDER BY 3 DESC LIMIT 10`,
      [tenantId, from, to]
    );

    const totals = daily.rows.reduce(
      (acc, r) => ({
        sale_count: acc.sale_count + r.sale_count,
        net: acc.net + parseFloat(r.net),
        tax: acc.tax + parseFloat(r.tax),
        gross: acc.gross + parseFloat(r.gross)
      }),
      { sale_count: 0, net: 0, tax: 0, gross: 0 }
    );

    res.json({
      message: 'Trading summary prepared',
      data: {
        period: { from, to },
        totals: {
          sale_count: totals.sale_count,
          net: money(totals.net),
          tax: money(totals.tax),
          gross: money(totals.gross)
        },
        daily: daily.rows,
        by_payment_method: byMethod.rows,
        by_staff: byStaff.rows,
        till: {
          closed_sessions: till.rows[0].closed_sessions,
          net_variance: money(till.rows[0].net_variance),
          total_short: money(till.rows[0].total_short),
          total_over: money(till.rows[0].total_over)
        },
        top_products: top.rows
      }
    });
  } catch (error) {
    console.error('Report controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Stock valuation and exposure: what the pharmacy is holding, what it cost,
 * what it is worth, and what is about to be worth nothing.
 */
exports.stockValuation = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!db.isDbAvailable()) return db.unavailable(res);

    const settings = await db.query('SELECT expiry_alert_days FROM tenants WHERE tenant_id = $1', [tenantId]);
    const window = settings.rows[0]?.expiry_alert_days || 90;

    const valuation = await db.query(
      `SELECT COUNT(DISTINCT p.product_id)::int AS product_lines,
              COALESCE(SUM(b.quantity_on_hand), 0)::int AS units,
              COALESCE(SUM(b.quantity_on_hand * p.cost_price), 0)    AS at_cost,
              COALESCE(SUM(b.quantity_on_hand * p.selling_price), 0) AS at_retail
       FROM product_batches b
       JOIN products p ON p.product_id = b.product_id
       WHERE b.tenant_id = $1 AND b.quantity_on_hand > 0 AND p.state = 'ACTIVE'`,
      [tenantId]
    );

    // Expired stock is a loss the owner has already taken but may not have
    // seen. It is reported separately from stock merely nearing expiry.
    const expired = await db.query(
      `SELECT COALESCE(SUM(b.quantity_on_hand), 0)::int AS units,
              COALESCE(SUM(b.quantity_on_hand * p.cost_price), 0) AS at_cost
       FROM product_batches b
       JOIN products p ON p.product_id = b.product_id
       WHERE b.tenant_id = $1 AND b.quantity_on_hand > 0 AND b.expiry_date < CURRENT_DATE`,
      [tenantId]
    );

    const expiring = await db.query(
      `SELECT p.name AS product, b.batch_number, b.expiry_date, b.quantity_on_hand,
              (b.quantity_on_hand * p.cost_price) AS at_cost
       FROM product_batches b
       JOIN products p ON p.product_id = b.product_id
       WHERE b.tenant_id = $1 AND b.quantity_on_hand > 0
         AND b.expiry_date >= CURRENT_DATE
         AND b.expiry_date < CURRENT_DATE + ($2 || ' days')::interval
       ORDER BY b.expiry_date ASC`,
      [tenantId, String(window)]
    );

    const belowReorder = await db.query(
      `SELECT p.name AS product, p.reorder_level,
              COALESCE(SUM(b.quantity_on_hand), 0)::int AS on_hand
       FROM products p
       LEFT JOIN product_batches b
         ON b.product_id = p.product_id AND b.expiry_date >= CURRENT_DATE
       WHERE p.tenant_id = $1 AND p.state = 'ACTIVE'
       GROUP BY p.product_id, p.name, p.reorder_level
       HAVING COALESCE(SUM(b.quantity_on_hand), 0) <= p.reorder_level
       ORDER BY 3 ASC`,
      [tenantId]
    );

    res.json({
      message: 'Stock valuation prepared',
      data: {
        as_at: new Date().toISOString().slice(0, 10),
        expiry_alert_days: window,
        holding: {
          product_lines: valuation.rows[0].product_lines,
          units: valuation.rows[0].units,
          at_cost: money(valuation.rows[0].at_cost),
          at_retail: money(valuation.rows[0].at_retail)
        },
        expired: {
          units: expired.rows[0].units,
          at_cost: money(expired.rows[0].at_cost)
        },
        expiring_soon: expiring.rows,
        below_reorder_level: belowReorder.rows
      }
    });
  } catch (error) {
    console.error('Report controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Dispensing register for prescription-only medicines.
 *
 * A pharmacy is expected to be able to account for what it dispensed against
 * prescription, to whom, on whose authority and by whose hand. Every field
 * below was already recorded; nothing here is reconstructed or inferred.
 */
exports.dispensingRegister = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { from, to } = resolveRange(req.query);

    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      `SELECT s.date_time, s.receipt_number,
              p.name AS product, p.dosage,
              si.quantity, b.batch_number, b.expiry_date,
              c.name AS patient_name, c.nrc AS patient_nrc,
              d.name AS prescriber, d.license_number AS prescriber_license,
              u.full_name AS dispensed_by,
              ver.full_name AS verified_by,
              s.prescription_id
       FROM sale_items si
       JOIN sales s        ON s.sale_id = si.sale_id
       JOIN products p     ON p.product_id = si.product_id
       LEFT JOIN product_batches b ON b.batch_id = si.batch_id
       LEFT JOIN customers c       ON c.customer_id = s.customer_id
       LEFT JOIN prescriptions pr  ON pr.prescription_id = s.prescription_id
       LEFT JOIN doctors d         ON d.doctor_id = pr.doctor_id
       LEFT JOIN users u           ON u.user_id = s.user_id
       LEFT JOIN users ver         ON ver.user_id = pr.verified_by_id
       WHERE s.tenant_id = $1
         AND s.status = 'COMPLETED'
         AND p.requires_prescription = TRUE
         AND s.date_time::date BETWEEN $2 AND $3
       ORDER BY s.date_time DESC`,
      [tenantId, from, to]
    );

    res.json({
      message: 'Dispensing register prepared',
      data: {
        period: { from, to },
        entry_count: result.rows.length,
        entries: result.rows
      }
    });
  } catch (error) {
    console.error('Report controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * The audit trail. A log nobody can read is not a control, so it is exposed
 * here alongside the other things an owner or regulator would ask for.
 *
 * Filterable by action, by the entity touched and by who did it, because those
 * are the three questions actually asked of an audit log: what happened to
 * this product, what did this member of staff do, and show me every price
 * change.
 */
exports.auditTrail = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { from, to } = resolveRange(req.query);
    const { action, entityId, actorId } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const params = [tenantId, from, to];
    let where = 'a.tenant_id = $1 AND a.occurred_at::date BETWEEN $2 AND $3';

    if (action) {
      params.push(action);
      where += ` AND a.action = $${params.length}`;
    }
    if (entityId) {
      params.push(entityId);
      where += ` AND a.entity_id = $${params.length}`;
    }
    if (actorId) {
      params.push(actorId);
      where += ` AND a.actor_id = $${params.length}`;
    }

    const result = await db.query(
      `SELECT a.audit_id, a.occurred_at, a.action, a.entity_type, a.entity_id,
              a.entity_label, a.before_value, a.after_value, a.reason, a.ip,
              a.actor_username, a.actor_role,
              u.full_name AS actor_name
       FROM audit_log a
       LEFT JOIN users u ON u.user_id = a.actor_id
       WHERE ${where}
       ORDER BY a.occurred_at DESC
       LIMIT 500`,
      params
    );

    res.json({
      message: 'Audit trail retrieved',
      data: {
        period: { from, to },
        entry_count: result.rows.length,
        entries: result.rows
      }
    });
  } catch (error) {
    console.error('Report controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports.NOT_A_RETURN = NOT_A_RETURN;
