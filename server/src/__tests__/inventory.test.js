const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

describe('Inventory receiving, dispensing and alerts', () => {
  let pharmacistToken;
  let cashierToken;

  beforeAll(async () => {
    pharmacistToken = await login('pharmacist');
    cashierToken = await login('cashier');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('receives a new batch and records the movement', async () => {
    const receive = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        productId: SEED.ibuprofen,
        batchNumber: `BATCH-TEST-${Date.now()}`,
        expiryDate: '2028-09-30',
        quantity: 40,
        notes: 'Automated test delivery'
      });

    expect(receive.statusCode).toEqual(200);

    const movements = await request(app)
      .get(`/api/inventory/movements/${SEED.ibuprofen}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(movements.statusCode).toEqual(200);
    const received = movements.body.data.filter((m) => m.movement_type === 'RECEIVE');
    expect(received.length).toBeGreaterThan(0);
    expect(received.some((m) => m.quantity === 40)).toBe(true);
  });

  it('records a dispense as a negative movement', async () => {
    const dispense = await request(app)
      .post('/api/inventory/dispense')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        productId: SEED.paracetamol,
        batchId: SEED.paracetamolBatch,
        quantity: 5,
        notes: 'Automated test dispense'
      });

    expect(dispense.statusCode).toEqual(200);

    const movements = await request(app)
      .get(`/api/inventory/movements/${SEED.paracetamol}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    const dispensed = movements.body.data.filter((m) => m.movement_type === 'DISPENSE');
    expect(dispensed.some((m) => m.quantity === -5)).toBe(true);
  });

  it('reduces quantity on hand when stock is dispensed', async () => {
    const before = await pool.query('SELECT quantity_on_hand FROM product_batches WHERE batch_id = $1', [
      SEED.paracetamolBatch
    ]);

    await request(app)
      .post('/api/inventory/dispense')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ productId: SEED.paracetamol, batchId: SEED.paracetamolBatch, quantity: 3 });

    const after = await pool.query('SELECT quantity_on_hand FROM product_batches WHERE batch_id = $1', [
      SEED.paracetamolBatch
    ]);

    expect(after.rows[0].quantity_on_hand).toEqual(before.rows[0].quantity_on_hand - 3);
  });

  it('does not let a cashier receive stock', async () => {
    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        productId: SEED.ibuprofen,
        batchNumber: 'CASHIER-SHOULD-FAIL',
        expiryDate: '2028-01-01',
        quantity: 10
      });

    expect(res.statusCode).toEqual(403);
  });

  it('surfaces the expired cough syrup batch in expiry alerts', async () => {
    const res = await request(app)
      .get('/api/products/expiry-alerts')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    const batchNumbers = res.body.data.map((b) => b.batch_number);
    expect(batchNumbers).toContain('BATCH-COUGH-EXPIRED');
  });

  it('lists low stock without error', async () => {
    const res = await request(app)
      .get('/api/products/low-stock')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
