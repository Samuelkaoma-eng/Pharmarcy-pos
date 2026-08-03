const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login, controlHubLogin } = require('./helpers/login');

describe('Two-tier customisation: ControlHub settings and tenant branding', () => {
  let superAdminToken;
  let adminToken;
  let cashierToken;

  beforeAll(async () => {
    const ch = await controlHubLogin('superadmin');
    superAdminToken = ch.body.data.token;
    adminToken = await login('admin', SEED.centralTenantId);
    cashierToken = await login('cashier');
  });

  afterAll(async () => {
    // Restore the seeded window so other suites are unaffected.
    await pool.query('UPDATE tenants SET expiry_alert_days = 90 WHERE tenant_id = $1', [SEED.centralTenantId]);
    await pool.end();
  });

  it('lets the ControlHub read a pharmacy operational settings', async () => {
    const res = await request(app)
      .get(`/api/controlhub/tenants/${SEED.centralTenantId}/settings`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveProperty('expiry_alert_days');
    expect(res.body.data).toHaveProperty('low_stock_alerts');
    expect(res.body.data).toHaveProperty('allow_public_registration');
  });

  it('lets the ControlHub change them', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${SEED.centralTenantId}/settings`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ expiry_alert_days: 30, require_customer_on_sale: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.expiry_alert_days).toEqual(30);
    expect(res.body.data.require_customer_on_sale).toBe(true);
  });

  it('rejects an out-of-range alert window', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${SEED.centralTenantId}/settings`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ expiry_alert_days: 4000 });

    expect(res.statusCode).toEqual(400);
  });

  it('applies the alert window to the expiry report', async () => {
    // The seeded ibuprofen batch expires in 2027, so a 30 day window excludes
    // it while the expired cough syrup still shows.
    await request(app)
      .put(`/api/controlhub/tenants/${SEED.centralTenantId}/settings`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ expiry_alert_days: 30 });

    const narrow = await request(app)
      .get('/api/products/expiry-alerts')
      .set('Authorization', `Bearer ${cashierToken}`);

    const narrowBatches = narrow.body.data.map((b) => b.batch_number);
    expect(narrowBatches).toContain('BATCH-COUGH-EXPIRED');
    expect(narrowBatches).not.toContain('BATCH-IBU-2026-C');

    await request(app)
      .put(`/api/controlhub/tenants/${SEED.centralTenantId}/settings`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ expiry_alert_days: 365 });

    const wide = await request(app)
      .get('/api/products/expiry-alerts')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(wide.body.data.length).toBeGreaterThanOrEqual(narrow.body.data.length);
  });

  it('does not let a pharmacy admin reach the ControlHub settings', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${SEED.centralTenantId}/settings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ expiry_alert_days: 200 });

    expect(res.statusCode).toEqual(403);
  });

  it('lets a pharmacy admin change its own branding', async () => {
    const res = await request(app)
      .put('/api/tenants/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Central Care Pharmacy',
        theme_color: '#7c3aed',
        currency_symbol: 'K',
        address: '123 Great East Road, Lusaka, Zambia'
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.theme_color).toEqual('#7c3aed');
  });

  it('surfaces branding and the read-only settings on the tenant config', async () => {
    const res = await request(app)
      .get('/api/tenants/config')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toHaveProperty('theme_color');
    expect(res.body.data).toHaveProperty('expiry_alert_days');
  });

  it('does not let a cashier change branding', async () => {
    const res = await request(app)
      .put('/api/tenants/config')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Hijacked Pharmacy', theme_color: '#000000' });

    expect(res.statusCode).toEqual(403);
  });
});
