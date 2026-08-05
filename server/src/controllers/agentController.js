const db = require('../config/db');
const ai = require('../services/aiProvider');

// The assistant staff actually talk to.
//
// This began as a chain of `prompt.includes('stock')` tests returning fixed
// sentences. A language model was later added, but only underneath those tests,
// which left the original problem in place: every real pharmacy question hits a
// keyword first, so "how much paracetamol do we have" was answered with a
// sentence about being *able* to check stock rather than with the number. It
// described its own capabilities instead of using them.
//
// Two things replace that. Live figures are read from this pharmacy's own rows
// before the model is called, so an answer is grounded in what the database
// actually holds; and the model always writes the reply, with those figures and
// instructions to answer from them alone. The classification below survives
// because it still earns its place: it decides which figures to fetch, and it
// decides whether a reply needs confirmation before anything is acted on. That
// gate is a safety property and is not delegated to a language model.

const INTENTS = {
  STOCK_LOOKUP: {
    match: (p) => /\bstock\b|\binventory\b|how many|reorder|running (low|out)|do we have/.test(p),
    offline: 'I can check stock levels, reorder thresholds, and expiring batches for the selected medication.',
    proposed_action: 'Open inventory and filter matching products',
    requires_confirmation: false,
    confidence: 0.88
  },
  EXPIRY_CHECK: {
    match: (p) => /expir|lapsed|out of date|shelf life/.test(p),
    offline: 'I can review batches expiring within the configured alert window and surface stock that should be quarantined or discounted.',
    proposed_action: 'Open expiring-batches view',
    requires_confirmation: false,
    confidence: 0.86
  },
  // Asking to *start* a sale. Deliberately narrower than "mentions the word
  // sale": this is the one intent that reduces stock and takes money, so it
  // carries a confirmation gate, and putting a gate on "how were sales today"
  // trains staff to click past the warning that matters.
  PREPARE_SALE: {
    match: (p) => /prepare (a |an )?sale|make a sale|new sale|start a sale|process a sale|ring up|\bsell\b|checkout|dispense to/.test(p),
    offline: 'I can prepare a checkout draft, but the cashier must confirm product, quantity, prescription, and payment before stock is reduced.',
    proposed_action: 'Create checkout draft',
    requires_confirmation: true,
    confidence: 0.8
  },
  // Asking what the shop has already taken. A report, so no gate.
  SALES_SUMMARY: {
    match: (p) => /\bsales?\b|takings|revenue|turnover|best.?sell|how much did we (make|take)/.test(p),
    offline: 'I can report today\'s transactions, takings, and best-selling lines from the completed sales on record.',
    proposed_action: 'Open sales history',
    requires_confirmation: false,
    confidence: 0.84
  },
  PRESCRIPTION_CHECK: {
    match: (p) => /prescription|\brx\b|dispense|script/.test(p),
    offline: 'I can inspect prescription status, verify whether the medication requires pharmacist review, and flag expired orders.',
    proposed_action: 'Open prescription queue',
    requires_confirmation: false,
    confidence: 0.84
  },
  QUEUE_STATUS: {
    match: (p) => /queue|waiting|triage|walk.?in/.test(p),
    offline: 'I can show waiting patients, triage status, and which visits still need vitals or doctor assignment.',
    proposed_action: 'Open triage queue',
    requires_confirmation: false,
    confidence: 0.82
  },
  PATIENT_LOOKUP: {
    match: (p) => /patient|customer|nrc/.test(p),
    offline: 'I can search patient records by name, NRC, or phone number and show the latest visits and prescriptions.',
    proposed_action: 'Open patient search',
    requires_confirmation: false,
    confidence: 0.82
  }
};

// Order matters where a message matches more than one. A sale is the only
// intent that moves stock and takes money, so it is tested first and its
// confirmation gate wins; expiry is a more specific reading than stock, so it
// is tested before it.
const ORDER = ['PREPARE_SALE', 'EXPIRY_CHECK', 'STOCK_LOOKUP', 'SALES_SUMMARY', 'PRESCRIPTION_CHECK', 'QUEUE_STATUS', 'PATIENT_LOOKUP'];

const classify = (prompt) => {
  const p = prompt.toLowerCase();
  for (const intent of ORDER) {
    if (INTENTS[intent].match(p)) return { intent, ...INTENTS[intent] };
  }
  // Greetings, thanks, and anything else a person says to an assistant. It is
  // not a failure to understand — it is a message with no workflow attached.
  return {
    intent: 'GENERAL',
    offline: null,
    proposed_action: null,
    requires_confirmation: false,
    confidence: 0.5
  };
};

// ---------------------------------------------------------------------------
// Live figures
// ---------------------------------------------------------------------------
// Every query below is tenant-scoped in its own WHERE clause and runs on the
// request's row-level-security connection, so the assistant can only read the
// pharmacy of the person asking. Each is capped: a model prompt is not the
// place to paste a whole catalogue, and a longer list costs tokens without
// making the answer better.

const LIST_LIMIT = 25;

const safely = async (label, read) => {
  try {
    return await read();
  } catch (err) {
    // A figure that cannot be read is left out of the context rather than
    // guessed at. The model is told only what was actually retrieved, so a
    // missing section makes it say it cannot see that, not invent it.
    console.error(`Assistant could not read ${label}:`, err.message);
    return null;
  }
};

const readStock = (tenantId) => safely('stock', async () => {
  const { rows } = await db.query(`
    SELECT p.name, p.selling_price, p.reorder_level, p.requires_prescription,
           COALESCE((SELECT SUM(b.quantity_on_hand) FROM product_batches b
                      WHERE b.product_id = p.product_id AND b.tenant_id = p.tenant_id), 0)::int AS on_hand
      FROM products p
     WHERE p.tenant_id = $1 AND p.state = 'ACTIVE'
     ORDER BY p.name
  `, [tenantId]);

  const low = rows.filter((r) => r.on_hand <= (r.reorder_level ?? 10));

  return {
    active_products: rows.length,
    total_units_on_hand: rows.reduce((n, r) => n + r.on_hand, 0),
    low_stock_count: low.length,
    low_stock: low.slice(0, LIST_LIMIT).map((r) => ({
      name: r.name, on_hand: r.on_hand, reorder_level: r.reorder_level ?? 10
    })),
    catalogue: rows.slice(0, 60).map((r) => ({
      name: r.name,
      on_hand: r.on_hand,
      price: Number(r.selling_price),
      prescription_only: r.requires_prescription
    }))
  };
});

const readExpiry = (tenantId) => safely('expiring batches', async () => {
  const { rows } = await db.query(`
    SELECT p.name AS product, b.batch_number, b.expiry_date, b.quantity_on_hand,
           (b.expiry_date < CURRENT_DATE) AS already_expired
      FROM product_batches b
      JOIN products p ON p.product_id = b.product_id AND p.tenant_id = b.tenant_id
      JOIN tenants t ON t.tenant_id = b.tenant_id
     WHERE b.tenant_id = $1
       AND b.quantity_on_hand > 0
       AND b.expiry_date <= CURRENT_DATE + (t.expiry_alert_days * INTERVAL '1 day')
     ORDER BY b.expiry_date ASC
     LIMIT $2
  `, [tenantId, LIST_LIMIT]);
  return { batches_in_alert_window: rows.length, batches: rows };
});

const readSales = (tenantId) => safely('sales', async () => {
  const today = await db.query(`
    SELECT COUNT(*)::int AS transactions, COALESCE(SUM(total), 0)::float AS takings
      FROM sales
     WHERE tenant_id = $1 AND status = 'COMPLETED' AND date_time::date = CURRENT_DATE
  `, [tenantId]);

  // sale_items carries no tenant of its own — it is scoped through the sale it
  // belongs to, so the tenant filter goes on `sales` and on `products`.
  const best = await db.query(`
    SELECT p.name, SUM(si.quantity)::int AS units
      FROM sale_items si
      JOIN sales s ON s.sale_id = si.sale_id
      JOIN products p ON p.product_id = si.product_id AND p.tenant_id = s.tenant_id
     WHERE s.tenant_id = $1 AND s.status = 'COMPLETED' AND s.date_time::date = CURRENT_DATE
     GROUP BY p.name
     ORDER BY units DESC
     LIMIT 5
  `, [tenantId]);

  return {
    today_transactions: today.rows[0].transactions,
    today_takings: today.rows[0].takings,
    today_best_sellers: best.rows
  };
});

const readQueue = (tenantId) => safely('queue', async () => {
  const { rows } = await db.query(`
    SELECT status, COUNT(*)::int AS n
      FROM visits
     WHERE tenant_id = $1 AND date = CURRENT_DATE
     GROUP BY status
  `, [tenantId]);
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return {
    waiting: byStatus.WAITING || 0,
    in_triage: byStatus.TRIAGE || 0,
    with_doctor: byStatus.IN_PROGRESS || 0,
    dispensing: byStatus.DISPENSING || 0,
    completed_today: byStatus.COMPLETED || 0
  };
});

const readPrescriptions = (tenantId) => safely('prescriptions', async () => {
  const { rows } = await db.query(`
    SELECT status, COUNT(*)::int AS n
      FROM prescriptions
     WHERE tenant_id = $1
     GROUP BY status
  `, [tenantId]);
  return { by_status: Object.fromEntries(rows.map((r) => [r.status, r.n])) };
});

const readPatients = (tenantId) => safely('patients', async () => {
  const { rows } = await db.query(
    'SELECT COUNT(*)::int AS n FROM customers WHERE tenant_id = $1',
    [tenantId]
  );
  return { registered_patients: rows[0].n };
});

const READERS = {
  stock: readStock,
  expiry: readExpiry,
  sales: readSales,
  queue: readQueue,
  prescriptions: readPrescriptions,
  patients: readPatients
};

// What each intent needs in order to answer well. A greeting gets the headline
// figures, so the assistant can open with something true about the shop right
// now instead of a bare "hello".
const CONTEXT_FOR = {
  STOCK_LOOKUP: ['stock', 'expiry'],
  EXPIRY_CHECK: ['expiry', 'stock'],
  PREPARE_SALE: ['stock', 'prescriptions'],
  SALES_SUMMARY: ['sales', 'stock'],
  PRESCRIPTION_CHECK: ['prescriptions', 'queue'],
  QUEUE_STATUS: ['queue', 'patients'],
  PATIENT_LOOKUP: ['patients', 'queue'],
  GENERAL: ['stock', 'sales', 'queue']
};

const gather = async (intent, tenantId) => {
  const wanted = CONTEXT_FOR[intent] || CONTEXT_FOR.GENERAL;
  const pairs = await Promise.all(wanted.map(async (key) => [key, await READERS[key](tenantId)]));
  return Object.fromEntries(pairs.filter(([, value]) => value !== null));
};

// ---------------------------------------------------------------------------
// The prompt
// ---------------------------------------------------------------------------
const SYSTEM = `You are the workflow assistant inside a Zambian pharmacy point-of-sale system, talking to pharmacy staff during their shift.

Rules, in order of importance:

1. Answer from the LIVE DATA block only. It is this pharmacy's real database, read moments ago. Never invent a product, patient, figure or batch that is not in it. If something is not there, say plainly that you cannot see it and name the screen where the staff member will find it.
2. Never give clinical advice. No dosing, no diagnosis, no judgement about whether a medicine suits a patient. You are an operations assistant for stock, sales, queues and prescriptions; clinical questions go to the pharmacist or the prescribing doctor.
3. You cannot perform actions. You say what is true and what the person should do next. Anything that moves stock or takes money is confirmed by a human at the till.
4. Be brief and concrete. Two or three sentences for most questions. Lead with the number or the name, then the recommendation.
5. Greetings and small talk get a short, warm reply that includes something genuinely useful about the state of the shop right now: takings so far, who is waiting, what needs reordering.
6. Plain text only. No markdown, no bullet characters, no headings. Prices are in Zambian kwacha, written as K followed by the amount.`;

exports.query = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const { tenantId, role, full_name: fullName, username } = req.user;
    const classified = classify(String(prompt));
    const context = await gather(classified.intent, tenantId);

    const answer = await ai.ask({
      system: SYSTEM,
      prompt: [
        `The person asking is ${fullName || username || 'a staff member'}, whose role is ${role || 'Staff'}.`,
        `Today is ${new Date().toISOString().slice(0, 10)}.`,
        '',
        "LIVE DATA (this pharmacy's own records, read just now):",
        JSON.stringify(context, null, 2),
        '',
        `Their message: ${prompt}`
      ].join('\n'),
      maxTokens: 500
    });

    // No model configured, or every provider failed. The deterministic sentence
    // is used instead: it is honest about what the assistant can do and never
    // claims a figure it did not read.
    const response = answer.available
      ? answer.text
      : classified.offline ||
        'The assistant service is unavailable, so I cannot answer that right now. The stock, sales, queue and prescription screens are all working normally.';

    res.json({
      message: 'Query processed',
      data: {
        intent: classified.intent,
        confidence: classified.confidence,
        response,
        proposed_action: classified.proposed_action,
        requires_confirmation: classified.requires_confirmation,
        // Which model answered, or that none did. The UI surfaces this so a
        // fallback sentence is never mistaken for a considered answer.
        source: answer.available ? answer.provider : 'offline',
        original_prompt: prompt
      }
    });
  } catch (error) {
    console.error('Agent controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
