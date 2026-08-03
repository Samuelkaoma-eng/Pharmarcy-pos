const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login, controlHubLogin } = require('./helpers/login');

describe('Tenant onboarding and ControlHub review', () => {
  let superAdminToken;
  let registeredTenantId;

  beforeAll(async () => {
    const res = await controlHubLogin('superadmin');
    superAdminToken = res.body.data.token;
  });

  afterAll(async () => {
    if (registeredTenantId) {
      await pool.query('DELETE FROM tenants WHERE tenant_id = $1', [registeredTenantId]);
    }
    await pool.end();
  });

  it('accepts a public registration and files it as REGISTERED', async () => {
    const res = await request(app)
      .post('/api/onboarding/register')
      .send({
        name: `Test Pharmacy ${Date.now()}`,
        owner_email: 'owner@testpharmacy.zm',
        phone: '+260970001111'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('REGISTERED');
    registeredTenantId = res.body.data.tenant_id;
  });

  it('shows the new application in the ControlHub onboarding queue', async () => {
    const res = await request(app)
      .get('/api/controlhub/onboarding')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toEqual(200);
    const ids = res.body.data.map((t) => t.tenant_id);
    expect(ids).toContain(registeredTenantId);
  });

  it('lets the SuperAdmin activate the tenant', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('ACTIVE');
  });

  it('drops the tenant off the onboarding queue once active', async () => {
    const res = await request(app)
      .get('/api/controlhub/onboarding')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const ids = res.body.data.map((t) => t.tenant_id);
    expect(ids).not.toContain(registeredTenantId);
  });

  it('lists every tenant with a user count for the SuperAdmin', async () => {
    const res = await request(app)
      .get('/api/controlhub/tenants')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toEqual(200);
    const ids = res.body.data.map((t) => t.tenant_id);
    expect(ids).toContain(SEED.centralTenantId);
    expect(ids).toContain(SEED.riversideTenantId);
  });

  it('returns 404 for a tenant that does not exist', async () => {
    const res = await request(app)
      .get('/api/controlhub/tenants/88888888-8888-8888-8888-888888888888')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toEqual(404);
  });

  it('keeps the onboarding queue away from tenant staff', async () => {
    const cashierToken = await login('cashier');

    const res = await request(app)
      .get('/api/controlhub/onboarding')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(403);
  });
});
