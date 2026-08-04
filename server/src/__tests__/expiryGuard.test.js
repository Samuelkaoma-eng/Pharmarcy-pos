const request = require('supertest');
const app = require('../app');
const { pool, closeAll } = require('./helpers/adminDb');
const { SEED, login } = require('./helpers/login');

describe('Checkout expiry guard', () => {
  let cashierToken;

  beforeAll(async () => {
    cashierToken = await login('cashier');
  });

  afterAll(async () => {
    await closeAll();
  });

  it('refuses a named batch that has expired', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        items: [{ productId: SEED.coughSyrup, batchId: SEED.expiredCoughBatch, quantity: 1 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/EXPIRED STOCK/);
  });

  it('refuses the product when every tracked batch has expired', async () => {
    // No batch named, so the guard falls back to what is sellable and finds
    // nothing in date.
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.coughSyrup, quantity: 1 }] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/EXPIRED STOCK/);
  });

  it('writes no sale record when the expiry guard rejects', async () => {
    const before = await pool.query('SELECT COUNT(*)::int AS n FROM sales WHERE tenant_id = $1', [
      SEED.centralTenantId
    ]);

    await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.coughSyrup, quantity: 1 }] });

    const after = await pool.query('SELECT COUNT(*)::int AS n FROM sales WHERE tenant_id = $1', [
      SEED.centralTenantId
    ]);

    expect(after.rows[0].n).toEqual(before.rows[0].n);
  });

  it('still sells stock that is in date', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 1 }] });

    expect(res.statusCode).toEqual(201);
  });

  it('picks the in-date batch automatically when none is named', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 2 }] });

    expect(res.statusCode).toEqual(201);

    const items = await pool.query(
      'SELECT batch_id FROM sale_items WHERE sale_id = $1',
      [res.body.data.sale_id]
    );

    // First-expired-first-out should have resolved the seeded batch.
    expect(items.rows[0].batch_id).toEqual(SEED.paracetamolBatch);
  });

  it('refuses to dispense more than the pharmacy holds', async () => {
    // Without this guard the sale succeeded and drove quantity_on_hand
    // negative, which showed up on the dashboard as "-2 remaining".
    // Summed across every in-date batch, since other suites may have received
    // more stock for this product before this one runs.
    const before = await pool.query(
      `SELECT COALESCE(SUM(quantity_on_hand), 0)::int AS held
       FROM product_batches
       WHERE product_id = $1 AND expiry_date >= CURRENT_DATE AND quantity_on_hand > 0`,
      [SEED.paracetamol]
    );
    const held = before.rows[0].held;

    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: held + 50 }] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/INSUFFICIENT STOCK/);

    const after = await pool.query(
      `SELECT COALESCE(SUM(quantity_on_hand), 0)::int AS held
       FROM product_batches
       WHERE product_id = $1 AND expiry_date >= CURRENT_DATE AND quantity_on_hand > 0`,
      [SEED.paracetamol]
    );
    expect(after.rows[0].held).toEqual(held);
  });

  it('refuses an over-sized draw on a named batch', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        items: [{ productId: SEED.paracetamol, batchId: SEED.paracetamolBatch, quantity: 9999 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/INSUFFICIENT STOCK/);
  });

  it('rejects a batch belonging to a different product', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        items: [{ productId: SEED.paracetamol, batchId: SEED.expiredCoughBatch, quantity: 1 }]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/Batch not found/i);
  });
});
