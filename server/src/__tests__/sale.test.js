const request = require('supertest');
const app = require('../app');
const { closeAll } = require('./helpers/adminDb');

describe('Pharmacy POS Backend Automated Test Suite', () => {
  let authToken;

  afterAll(async () => {
    await closeAll();
  });

  it('GET /api/health should return ok status with database connectivity', async () => {
    const res = await request(app).get('/api/health');
    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });

  it('POST /api/auth/login should authenticate valid user and return token', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'password123' });
    
    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBeTruthy();
    expect(res.body.data).toHaveProperty('token');
    authToken = res.body.data.token;
  });

  it('GET /api/products should list inventory items for authenticated user', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.success).toBeTruthy();
    expect(Array.isArray(res.body.data)).toBeTruthy();
  });

  it('POST /api/sales should process a valid sale checkout', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentType: 'cash',
        items: [
          { productId: '55555555-5555-5555-5555-555555555501', quantity: 2 } // Paracetamol
        ]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.success).toBeTruthy();
    expect(res.body.data).toHaveProperty('receipt_number');
  });

  it('POST /api/sales should block prescription drugs when prescriptionId is missing', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        paymentType: 'cash',
        items: [
          { productId: '55555555-5555-5555-5555-555555555502', quantity: 1 } // Amoxicillin requires prescription
        ]
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('PRESCRIPTION REQUIRED');
  });

  it('POST /api/agent/query should respond to natural language POS queries', async () => {
    const res = await request(app)
      .post('/api/agent/query')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ prompt: 'Check stock levels for medications' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.intent).toEqual('STOCK_LOOKUP');
    expect(res.body.data.requires_confirmation).toBe(false);
  });

  it('POST /api/agent/query should require confirmation for sale preparation', async () => {
    const res = await request(app)
      .post('/api/agent/query')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ prompt: 'Prepare a sale for paracetamol' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.intent).toEqual('PREPARE_SALE');
    expect(res.body.data.requires_confirmation).toBe(true);
  });
});
