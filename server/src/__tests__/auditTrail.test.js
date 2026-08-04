const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

// stock_movements accounted for stock and approval_requests for platform
// changes, but nothing covered the rest. A price could be edited, a
// prescription verified, an account given a new role or a drawer counted
// short, and the only trace was the new value sitting in its column.
//
// What is worth testing is that an entry says what the value *was*, that it
// names who did it, that a change which rolls back leaves nothing behind, and
// that a save altering nothing does not fill the trail with noise.

describe('Audit trail', () => {
  let adminToken;
  let pharmacistToken;
  const today = new Date().toISOString().slice(0, 10);

  const trail = (query = '') =>
    request(app)
      .get(`/api/reports/audit?from=${today}&to=${today}${query}`)
      .set('Authorization', `Bearer ${adminToken}`);

  beforeAll(async () => {
    adminToken = await login('admin', SEED.centralTenantId);
    pharmacistToken = await login('pharmacist', SEED.centralTenantId);
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [SEED.centralTenantId]);
  });

  afterAll(async () => {
    await pool.query('DELETE FROM audit_log WHERE tenant_id = $1', [SEED.centralTenantId]);
    await pool.end();
  });

  it('records a price change with what it was and what it became', async () => {
    const before = await pool.query('SELECT selling_price FROM products WHERE product_id = $1', [
      SEED.ibuprofen
    ]);
    const was = parseFloat(before.rows[0].selling_price);

    const res = await request(app)
      .put(`/api/products/${SEED.ibuprofen}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ selling_price: was + 5 });

    expect(res.statusCode).toEqual(200);

    const entries = (await trail('&action=PRICE_CHANGED')).body.data.entries;
    const entry = entries.find((e) => e.entity_id === SEED.ibuprofen);

    // "The price is now 80.00" answers nothing on its own.
    expect(parseFloat(entry.before_value.selling_price)).toBeCloseTo(was, 2);
    expect(parseFloat(entry.after_value.selling_price)).toBeCloseTo(was + 5, 2);
    expect(entry.actor_username).toEqual('admin');
    expect(entry.actor_role).toEqual('Admin');
    expect(entry.entity_label).toBeTruthy();
  });

  it('records nothing when a save changes nothing', async () => {
    const beforeCount = (await trail('&action=PRICE_CHANGED')).body.data.entry_count;

    const current = await pool.query('SELECT selling_price FROM products WHERE product_id = $1', [
      SEED.ibuprofen
    ]);

    await request(app)
      .put(`/api/products/${SEED.ibuprofen}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ selling_price: parseFloat(current.rows[0].selling_price) });

    // A trail full of no-op edits is a trail nobody reads.
    expect((await trail('&action=PRICE_CHANGED')).body.data.entry_count).toEqual(beforeCount);
  });

  it('records a change of VAT treatment under its own verb', async () => {
    await request(app)
      .put(`/api/products/${SEED.ibuprofen}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vat_treatment: 'STANDARD' });

    const entries = (await trail('&action=VAT_TREATMENT_CHANGED')).body.data.entries;
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].after_value.vat_treatment).toEqual('STANDARD');

    await request(app)
      .put(`/api/products/${SEED.ibuprofen}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vat_treatment: 'ZERO_RATED' });
  });

  it('records who verified a prescription', async () => {
    const rx = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        doctorId: SEED.doctorPhiri,
        customerId: SEED.patientChipego,
        validUntil: '2027-12-31',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'Twice daily', quantity: 4 }]
      });

    await request(app)
      .patch(`/api/prescriptions/${rx.body.data.prescription_id}/verify`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({});

    const entries = (await trail('&action=PRESCRIPTION_VERIFIED')).body.data.entries;
    const entry = entries.find((e) => e.entity_id === rx.body.data.prescription_id);

    // The act that unlocks a controlled sale, attributed to the pharmacist who
    // made the judgement.
    expect(entry).toBeDefined();
    expect(entry.actor_username).toEqual('pharmacist');
  });

  it('records a stock adjustment together with the reason given', async () => {
    await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        productId: SEED.paracetamol,
        batchId: SEED.paracetamolBatch,
        quantityDifference: -3,
        notes: 'Damaged in transit'
      });

    const entries = (await trail('&action=STOCK_ADJUSTED')).body.data.entries;
    expect(entries.length).toBeGreaterThan(0);
    // An unexplained adjustment is indistinguishable from shrinkage.
    expect(entries[0].reason).toEqual('Damaged in transit');
    expect(entries[0].after_value.quantity_difference).toEqual(-3);
  });

  it('leaves no entry when the change it describes rolls back', async () => {
    const before = (await trail('&action=STOCK_ADJUSTED')).body.data.entry_count;

    // Refused inside the transaction: the adjustment would drive the batch
    // below zero, so the whole thing rolls back.
    const res = await request(app)
      .post('/api/inventory/adjust')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        productId: SEED.paracetamol,
        batchId: SEED.paracetamolBatch,
        quantityDifference: -999999,
        notes: 'Should not be recorded'
      });

    expect(res.statusCode).toEqual(400);

    // The entry is written with the transaction client, so it dies with it.
    // An audit log claiming a change that never happened is worse than none.
    expect((await trail('&action=STOCK_ADJUSTED')).body.data.entry_count).toEqual(before);
  });

  it('records a closed till with its variance', async () => {
    const cashierToken = await login('cashier', SEED.centralTenantId);

    const opened = await request(app)
      .post('/api/till/open')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ opening_float: 100 });

    await request(app)
      .post(`/api/till/sessions/${opened.body.data.till_session_id}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ closing_count: 90, closing_notes: 'Counted twice' });

    const entries = (await trail('&action=TILL_CLOSED')).body.data.entries;
    expect(entries.length).toBeGreaterThan(0);
    expect(Number(entries[0].after_value.variance)).toBeCloseTo(-10, 2);
    expect(entries[0].reason).toEqual('Counted twice');

    await pool.query('DELETE FROM till_sessions WHERE tenant_id = $1', [SEED.centralTenantId]);
  });

  it('keeps the trail away from anyone but an administrator', async () => {
    const res = await request(app)
      .get(`/api/reports/audit?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    // It names who did what, which is not something one member of staff
    // should be able to read about another.
    expect(res.statusCode).toEqual(403);
  });

  it('keeps one pharmacy trail out of another', async () => {
    const riversideAdmin = await login('admin', SEED.riversideTenantId);
    const res = await request(app)
      .get(`/api/reports/audit?from=${today}&to=${today}`)
      .set('Authorization', `Bearer ${riversideAdmin}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.entries.every((e) => e.entity_id !== SEED.ibuprofen)).toBe(true);
  });
});
