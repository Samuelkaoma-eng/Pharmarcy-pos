const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

// LIM-004. A sale used to belong to a cashier but not to a shift, so there was
// no float, no closing count and no cash variance: a drawer could be short and
// nothing in the system would say so.
//
// The properties worth testing are the ones a dishonest or careless shift would
// exploit — that expected cash cannot be declared by the person being counted,
// that non-cash settlements do not inflate what the drawer should hold, and
// that a short drawer is reported as short rather than rounded away.

describe('Till sessions', () => {
  let cashierToken;
  let adminToken;
  let pharmacistToken;
  let sessionId;

  const openTill = (token, body) =>
    request(app).post('/api/till/open').set('Authorization', `Bearer ${token}`).send(body);

  const ringUpSale = (token, body) =>
    request(app).post('/api/sales').set('Authorization', `Bearer ${token}`).send(body);

  beforeAll(async () => {
    cashierToken = await login('cashier', SEED.centralTenantId);
    adminToken = await login('admin', SEED.centralTenantId);
    pharmacistToken = await login('pharmacist', SEED.centralTenantId);

    // Start from a clean floor: a leftover open session from another suite
    // would make the first assertion meaningless.
    await pool.query('UPDATE sales SET till_session_id = NULL WHERE tenant_id = $1', [
      SEED.centralTenantId
    ]);
    await pool.query('DELETE FROM till_sessions WHERE tenant_id = $1', [SEED.centralTenantId]);
  });

  afterAll(async () => {
    await pool.query('UPDATE sales SET till_session_id = NULL WHERE tenant_id = $1', [
      SEED.centralTenantId
    ]);
    await pool.query('DELETE FROM till_sessions WHERE tenant_id = $1', [SEED.centralTenantId]);
    // Leave the policy off, which is the default, so no later suite inherits it.
    await pool.query('UPDATE tenants SET require_till_session = FALSE WHERE tenant_id = $1', [
      SEED.centralTenantId
    ]);
    await pool.end();
  });

  it('reports plainly that no till is open, rather than inventing one', async () => {
    const res = await request(app)
      .get('/api/till/current')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toBeNull();
  });

  it('refuses a negative opening float', async () => {
    const res = await openTill(cashierToken, { opening_float: -50 });
    expect(res.statusCode).toEqual(400);
  });

  it('opens a shift with a counted float', async () => {
    const res = await openTill(cashierToken, {
      opening_float: 200,
      opening_notes: 'Morning shift'
    });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.status).toEqual('OPEN');
    expect(parseFloat(res.body.data.opening_float)).toEqual(200);
    sessionId = res.body.data.till_session_id;
  });

  it('refuses a second open till for the same cashier', async () => {
    // Enforced by a partial unique index, so two simultaneous clicks cannot
    // both pass a check and both insert.
    const res = await openTill(cashierToken, { opening_float: 100 });
    expect(res.statusCode).toEqual(409);
  });

  it('binds a sale to the open shift', async () => {
    const res = await ringUpSale(cashierToken, {
      items: [{ productId: SEED.paracetamol, quantity: 2 }],
      paymentType: 'cash'
    });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.till_session_id).toEqual(sessionId);
  });

  it('adds cash takings to what the drawer should hold', async () => {
    const res = await request(app)
      .get('/api/till/current')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.sale_count).toEqual(1);
    expect(res.body.data.cash_taken).toBeGreaterThan(0);
    expect(res.body.data.expected_cash).toBeCloseTo(200 + res.body.data.cash_taken, 2);
  });

  it('does not count a card sale towards the cash drawer', async () => {
    const before = (
      await request(app).get('/api/till/current').set('Authorization', `Bearer ${cashierToken}`)
    ).body.data;

    const sale = await ringUpSale(cashierToken, {
      items: [{ productId: SEED.paracetamol, quantity: 1 }],
      paymentType: 'card'
    });
    expect(sale.statusCode).toEqual(201);

    const after = (
      await request(app).get('/api/till/current').set('Authorization', `Bearer ${cashierToken}`)
    ).body.data;

    // The sale is counted; the cash is not. Treating a card settlement as cash
    // would show a shortfall on an entirely honest shift.
    expect(after.sale_count).toEqual(before.sale_count + 1);
    expect(after.cash_taken).toBeCloseTo(before.cash_taken, 2);
    expect(after.total_taken).toBeGreaterThan(before.total_taken);
    expect(after.expected_cash).toBeCloseTo(before.expected_cash, 2);
  });

  it('will not let another cashier close someone else s till', async () => {
    const res = await request(app)
      .post(`/api/till/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ closing_count: 0 });

    expect(res.statusCode).toEqual(403);
  });

  it('computes expected cash itself and reports a short drawer', async () => {
    const current = (
      await request(app).get('/api/till/current').set('Authorization', `Bearer ${cashierToken}`)
    ).body.data;

    const expected = current.expected_cash;
    const counted = expected - 50;

    const res = await request(app)
      .post(`/api/till/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        closing_count: counted,
        closing_notes: 'Counted twice',
        // Supplied deliberately. If the server honoured this the variance would
        // come out at zero and the shortfall would vanish.
        expected_cash: counted,
        variance: 0
      });

    expect(res.statusCode).toEqual(200);
    expect(parseFloat(res.body.data.expected_cash)).toBeCloseTo(expected, 2);
    expect(parseFloat(res.body.data.variance)).toBeCloseTo(-50, 2);
    expect(res.body.data.status).toEqual('CLOSED');
  });

  it('will not close the same till twice', async () => {
    const res = await request(app)
      .post(`/api/till/sessions/${sessionId}/close`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ closing_count: 100 });

    expect(res.statusCode).toEqual(409);
  });

  it('keeps a closed shift readable, variance and all', async () => {
    const res = await request(app)
      .get(`/api/till/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('CLOSED');
    expect(parseFloat(res.body.data.variance)).toBeCloseTo(-50, 2);
    expect(res.body.data.sales.length).toEqual(2);
  });

  it('lets a supervisor see a shift they did not work', async () => {
    const res = await request(app)
      .get(`/api/till/sessions/${sessionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(parseFloat(res.body.data.variance)).toBeCloseTo(-50, 2);
  });

  it('shows a cashier only their own shifts', async () => {
    const supervisorFloat = await openTill(adminToken, { opening_float: 500 });
    expect(supervisorFloat.statusCode).toEqual(201);

    const mine = await request(app)
      .get('/api/till/sessions')
      .set('Authorization', `Bearer ${cashierToken}`);

    const ids = mine.body.data.map((s) => s.till_session_id);
    expect(ids).not.toContain(supervisorFloat.body.data.till_session_id);

    const floor = await request(app)
      .get('/api/till/sessions')
      .set('Authorization', `Bearer ${adminToken}`);

    const floorIds = floor.body.data.map((s) => s.till_session_id);
    expect(floorIds).toContain(supervisorFloat.body.data.till_session_id);
    expect(floorIds).toContain(sessionId);

    await pool.query('DELETE FROM till_sessions WHERE till_session_id = $1', [
      supervisorFloat.body.data.till_session_id
    ]);
  });

  describe('when the pharmacy requires till control', () => {
    beforeAll(async () => {
      await pool.query('UPDATE tenants SET require_till_session = TRUE WHERE tenant_id = $1', [
        SEED.centralTenantId
      ]);
    });

    afterAll(async () => {
      await pool.query('UPDATE tenants SET require_till_session = FALSE WHERE tenant_id = $1', [
        SEED.centralTenantId
      ]);
    });

    it('refuses a sale rung up outside any open shift, and leaves nothing behind', async () => {
      // Counted around the attempt rather than against a wall-clock window, so
      // sales written by other suites cannot be mistaken for this one.
      const count = async (table) =>
        (await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE tenant_id = $1`, [
          SEED.centralTenantId
        ])).rows[0].n;

      const salesBefore = await count('sales');
      const movementsBefore = await count('stock_movements');

      const res = await ringUpSale(cashierToken, {
        items: [{ productId: SEED.paracetamol, quantity: 1 }],
        paymentType: 'cash'
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/TILL SESSION/i);

      // The guard runs inside the transaction, so a refusal rolls back whole.
      expect(await count('sales')).toEqual(salesBefore);
      expect(await count('stock_movements')).toEqual(movementsBefore);
    });

    it('accepts the sale once a shift is open', async () => {
      const opened = await openTill(cashierToken, { opening_float: 0 });
      expect(opened.statusCode).toEqual(201);

      const res = await ringUpSale(cashierToken, {
        items: [{ productId: SEED.paracetamol, quantity: 1 }],
        paymentType: 'cash'
      });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.till_session_id).toEqual(opened.body.data.till_session_id);
    });
  });
});
