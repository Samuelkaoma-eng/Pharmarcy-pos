const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login, controlHubLogin } = require('./helpers/login');

describe('Tenant onboarding and ControlHub review', () => {
  let superAdminToken;
  let registeredTenantId;
  const adminUsername = `owner_${Date.now()}`;

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
        phone: '+260970001111',
        admin_username: adminUsername,
        admin_password: 'onboarding-pass-123'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.status).toEqual('REGISTERED');
    registeredTenantId = res.body.data.tenant_id;
  });

  it('creates an administrator alongside the pharmacy', async () => {
    // Without this the pharmacy would be approved with nobody able to sign in.
    const users = await pool.query('SELECT username, role FROM users WHERE tenant_id = $1', [
      registeredTenantId
    ]);

    expect(users.rows.length).toEqual(1);
    expect(users.rows[0].username).toEqual(adminUsername);
    expect(users.rows[0].role).toEqual('Admin');
  });

  it('refuses a registration with no administrator credentials', async () => {
    const res = await request(app)
      .post('/api/onboarding/register')
      .send({ name: 'No Admin Pharmacy', owner_email: 'nobody@example.zm' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/administrator/i);
  });

  it('refuses a weak administrator password', async () => {
    const res = await request(app)
      .post('/api/onboarding/register')
      .send({
        name: 'Weak Password Pharmacy',
        owner_email: 'weak@example.zm',
        admin_username: 'weakadmin',
        admin_password: 'short'
      });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/at least 8/i);
  });

  it('keeps the new administrator out until the pharmacy is approved', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: adminUsername,
        password: 'onboarding-pass-123',
        tenantId: registeredTenantId
      });

    expect(res.statusCode).toEqual(403);
    expect(res.body.error).toMatch(/not active yet/i);
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

  it('lets the new administrator sign in once approved', async () => {
    // This closes the loop: register, review, activate, then trade.
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: adminUsername,
        password: 'onboarding-pass-123',
        tenantId: registeredTenantId
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.user.role).toEqual('Admin');
    expect(res.body.data.user.tenantId).toEqual(registeredTenantId);
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
