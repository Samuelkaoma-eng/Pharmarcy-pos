const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login, controlHubLogin } = require('./helpers/login');

describe('Maker-checker approvals', () => {
  let makerToken;
  let checkerToken;
  let requestId;

  beforeAll(async () => {
    makerToken = (await controlHubLogin('superadmin')).body.data.token;
    checkerToken = (await controlHubLogin('superadmin2')).body.data.token;
  });

  afterAll(async () => {
    await pool.query('DELETE FROM approval_requests');
    await pool.query('UPDATE tenants SET status = $1 WHERE tenant_id = $2', ['ACTIVE', SEED.riversideTenantId]);
    await pool.end();
  });

  it('publishes the actions that may be routed for approval', async () => {
    const res = await request(app)
      .get('/api/controlhub/approvals/actions')
      .set('Authorization', `Bearer ${makerToken}`);

    expect(res.statusCode).toEqual(200);
    const actions = res.body.data.map((a) => a.action);
    expect(actions).toContain('SUSPEND_TENANT');
  });

  it('refuses an action it does not know how to apply', async () => {
    const res = await request(app)
      .post('/api/controlhub/approvals')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ action: 'DROP_EVERYTHING', payload: {}, reason: 'testing' });

    expect(res.statusCode).toEqual(400);
  });

  it('requires a reason so the approver can judge the request', async () => {
    const res = await request(app)
      .post('/api/controlhub/approvals')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ action: 'SUSPEND_TENANT', payload: { tenant_id: SEED.riversideTenantId } });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/reason/i);
  });

  it('records a suspension request as pending', async () => {
    const res = await request(app)
      .post('/api/controlhub/approvals')
      .set('Authorization', `Bearer ${makerToken}`)
      .send({
        action: 'SUSPEND_TENANT',
        payload: { tenant_id: SEED.riversideTenantId },
        reason: 'Licence lapsed pending renewal'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.status).toEqual('PENDING');
    requestId = res.body.data.request_id;
  });

  it('does not apply the action while the request is pending', async () => {
    const tenant = await pool.query('SELECT status FROM tenants WHERE tenant_id = $1', [
      SEED.riversideTenantId
    ]);
    expect(tenant.rows[0].status).toEqual('ACTIVE');
  });

  it('refuses to let the requester approve their own request', async () => {
    // This is the entire point of the mechanism.
    const res = await request(app)
      .patch(`/api/controlhub/approvals/${requestId}/decide`)
      .set('Authorization', `Bearer ${makerToken}`)
      .send({ decision: 'APPROVED' });

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toMatch(/different administrator/i);
  });

  it('leaves the action unapplied after the self-approval attempt', async () => {
    const tenant = await pool.query('SELECT status FROM tenants WHERE tenant_id = $1', [
      SEED.riversideTenantId
    ]);
    expect(tenant.rows[0].status).toEqual('ACTIVE');
  });

  it('applies the action when a second administrator approves', async () => {
    const res = await request(app)
      .patch(`/api/controlhub/approvals/${requestId}/decide`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({ decision: 'APPROVED', decision_notes: 'Confirmed with the regulator' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('APPROVED');

    const tenant = await pool.query('SELECT status FROM tenants WHERE tenant_id = $1', [
      SEED.riversideTenantId
    ]);
    expect(tenant.rows[0].status).toEqual('REJECTED');
  });

  it('will not decide the same request twice', async () => {
    const res = await request(app)
      .patch(`/api/controlhub/approvals/${requestId}/decide`)
      .set('Authorization', `Bearer ${checkerToken}`)
      .send({ decision: 'REJECTED' });

    expect(res.statusCode).toEqual(409);
  });

  it('keeps approvals away from pharmacy staff', async () => {
    const adminToken = await login('admin', SEED.centralTenantId);

    const res = await request(app)
      .get('/api/controlhub/approvals')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(403);
  });
});
