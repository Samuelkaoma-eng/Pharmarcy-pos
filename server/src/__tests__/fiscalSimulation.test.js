const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

// SIMFIS is a teaching model of fiscalisation. These tests assert two things:
// that it is unmistakably marked as simulated, and that the signature actually
// detects tampering — which is the property real fiscalisation exists for and
// the only reason simulating it teaches anything.

describe('Simulated fiscalisation (SIMFIS)', () => {
  let cashierToken;
  let saleId;

  beforeAll(async () => {
    cashierToken = await login('cashier');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('states plainly that it is not an approved provider', async () => {
    const res = await request(app)
      .get('/api/fiscal/status')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.simulated).toBe(true);
    expect(res.body.data.approved_provider).toBe(false);
    expect(res.body.data.notice).toMatch(/not a ZRA Smart Invoice/i);
  });

  it('fiscalises a sale and marks every value as simulated', async () => {
    const sale = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 2 }] });

    expect(sale.statusCode).toEqual(201);
    saleId = sale.body.data.sale_id;

    const res = await request(app)
      .post(`/api/fiscal/sales/${saleId}/fiscalise`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.simulated).toBe(true);
    // The reference must never be able to pass as a genuine one.
    expect(res.body.data.reference).toMatch(/^SIMFIS-/);
    expect(res.body.data.device_id).toMatch(/^SIMFIS-DEV-/);
    expect(res.body.data.qr_payload).toMatch(/^SIMFIS\|/);
    expect(res.body.data.notice).toMatch(/academic demonstration/i);
  });

  it('keeps the simulated reference out of the genuine Smart Invoice field', async () => {
    // A simulated value must be structurally incapable of occupying the column
    // that holds a real reference issued by an approved system.
    const row = await pool.query(
      'SELECT smart_invoice_ref, simulated_fiscal_ref FROM sales WHERE sale_id = $1',
      [saleId]
    );

    expect(row.rows[0].smart_invoice_ref).toBeNull();
    expect(row.rows[0].simulated_fiscal_ref).toMatch(/^SIMFIS-/);
  });

  it('assigns a sequential fiscal counter', async () => {
    const second = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 1 }] });

    const res = await request(app)
      .post(`/api/fiscal/sales/${second.body.data.sale_id}/fiscalise`)
      .set('Authorization', `Bearer ${cashierToken}`);

    // Gaps in the sequence are what make missing invoices detectable.
    expect(res.body.data.fiscal_counter).toBeGreaterThan(1);
  });

  it('refuses to fiscalise the same sale twice', async () => {
    const res = await request(app)
      .post(`/api/fiscal/sales/${saleId}/fiscalise`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(409);
  });

  it('verifies an untouched sale', async () => {
    const res = await request(app)
      .get(`/api/fiscal/sales/${saleId}/verify`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.matches).toBe(true);
  });

  it('detects a total altered after fiscalisation', async () => {
    // This is the entire point. Change the figure the signature covers and the
    // signature no longer holds.
    await pool.query('UPDATE sales SET total = total + 500 WHERE sale_id = $1', [saleId]);

    const res = await request(app)
      .get(`/api/fiscal/sales/${saleId}/verify`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.body.data.matches).toBe(false);
    expect(res.body.message).toMatch(/altered after it was fiscalised/i);
  });

  it('does not fiscalise another pharmacy sale', async () => {
    const riversideToken = await login('riverside_cashier');

    const res = await request(app)
      .post(`/api/fiscal/sales/${saleId}/fiscalise`)
      .set('Authorization', `Bearer ${riversideToken}`);

    expect(res.statusCode).toEqual(404);
  });
});
