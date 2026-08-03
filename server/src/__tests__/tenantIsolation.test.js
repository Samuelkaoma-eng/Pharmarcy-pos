const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

describe('Cross-tenant isolation', () => {
  let centralToken;
  let riversideToken;

  beforeAll(async () => {
    centralToken = await login('cashier');
    riversideToken = await login('riverside_cashier');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('shows each pharmacy only its own catalogue', async () => {
    const central = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${centralToken}`);

    const riverside = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${riversideToken}`);

    const centralIds = central.body.data.map((p) => p.product_id);
    const riversideIds = riverside.body.data.map((p) => p.product_id);

    expect(centralIds).toContain(SEED.paracetamol);
    expect(centralIds).not.toContain(SEED.riversideProduct);

    expect(riversideIds).toContain(SEED.riversideProduct);
    expect(riversideIds).not.toContain(SEED.paracetamol);
  });

  it('will not sell another pharmacy stock', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.riversideProduct, quantity: 1 }] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/Product not found/i);
  });

  it('will not receive stock against another pharmacy product', async () => {
    const adminToken = await login('admin', SEED.centralTenantId);

    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: SEED.riversideProduct,
        batchNumber: 'CROSS-TENANT-ATTEMPT',
        expiryDate: '2028-01-01',
        quantity: 10
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body.error).toMatch(/not found for this pharmacy/i);
  });

  it('hides another pharmacy sales history', async () => {
    // Central makes a sale, Riverside must not be able to see it.
    const sale = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 1 }] });

    expect(sale.statusCode).toEqual(201);
    const saleId = sale.body.data.sale_id;

    const riversideView = await request(app)
      .get(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${riversideToken}`);

    expect(riversideView.statusCode).toEqual(404);
  });

  it('keeps a tenant user out of ControlHub routes', async () => {
    const res = await request(app)
      .get('/api/controlhub/tenants')
      .set('Authorization', `Bearer ${centralToken}`);

    expect(res.statusCode).toEqual(403);
  });
});
