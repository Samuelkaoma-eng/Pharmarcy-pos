const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login, controlHubLogin } = require('./helpers/login');

const REVIEW_TENANT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// Both suites below share one pool, so it is closed once at file scope rather
// than by whichever suite finishes first.
afterAll(async () => {
  await pool.end();
});

describe('Staff and role management', () => {
  let adminToken;
  let cashierToken;
  let createdUserId;
  const username = `nurse_${Date.now()}`;

  beforeAll(async () => {
    adminToken = await login('admin', SEED.centralTenantId);
    cashierToken = await login('cashier');
  });

  afterAll(async () => {
    if (createdUserId) await pool.query('DELETE FROM users WHERE user_id = $1', [createdUserId]);
  });

  it('lists the roles an administrator may assign', async () => {
    const res = await request(app)
      .get('/api/users/roles')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data).toContain('Cashier');
    // Platform authority is never grantable from inside a pharmacy.
    expect(res.body.data).not.toContain('SuperAdmin');
  });

  it('creates a staff account', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username, password: 'staff-password-1', full_name: 'Test Pharmacist', role: 'Pharmacist' });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.role).toEqual('Pharmacist');
    expect(res.body.data).not.toHaveProperty('password_hash');
    createdUserId = res.body.data.user_id;
  });

  it('refuses to grant SuperAdmin from inside a pharmacy', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: `bad_${Date.now()}`, password: 'staff-password-1', full_name: 'Escalation', role: 'SuperAdmin' });

    expect(res.statusCode).toEqual(400);
  });

  it('rejects a duplicate username within the same pharmacy', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username, password: 'staff-password-1', full_name: 'Clash', role: 'Cashier' });

    expect(res.statusCode).toEqual(409);
  });

  it('changes a staff role', async () => {
    const res = await request(app)
      .put(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'Cashier' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.role).toEqual('Cashier');
  });

  it('stops an administrator locking themselves out', async () => {
    const profile = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .put(`/api/users/${profile.body.data.user_id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false });

    expect(res.statusCode).toEqual(400);
  });

  it('does not let a cashier create staff', async () => {
    const res = await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ username: `x_${Date.now()}`, password: 'staff-password-1', full_name: 'X', role: 'Cashier' });

    expect(res.statusCode).toEqual(403);
  });

  it('does not reach into another pharmacy staff list', async () => {
    const riversideToken = await login('riverside_cashier');
    const res = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${riversideToken}`);

    const ids = res.body.data.map((u) => u.user_id);
    expect(ids).not.toContain(createdUserId);
  });

  it('lets a member set their own profile picture', async () => {
    const res = await request(app)
      .put('/api/profile/avatar')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ avatar_url: 'https://example.com/avatar.png' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.avatar_url).toEqual('https://example.com/avatar.png');
  });
});

describe('Onboarding document review', () => {
  let superAdminToken;
  let documentId;

  beforeAll(async () => {
    superAdminToken = (await controlHubLogin('superadmin')).body.data.token;
  });

  afterAll(async () => {
    await pool.query(
      "UPDATE onboarding_documents SET status = 'PENDING', reviewed_by_id = NULL, reviewed_at = NULL, review_notes = NULL WHERE tenant_id = $1",
      [REVIEW_TENANT]
    );
  });

  it('lists the documents submitted with an application', async () => {
    const res = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/documents`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toEqual(200);
    // The seeded application carries the full ZAMRA set. Asserted as a
    // minimum, because another suite may have uploaded against this tenant.
    expect(res.body.data.length).toBeGreaterThanOrEqual(7);
    expect(res.body.data.map((d) => d.document_type)).toEqual(
      expect.arrayContaining(['PACRA_CERTIFICATE', 'PHARMACIST_PRACTISING', 'ZAMRA_INSPECTION'])
    );
    documentId = res.body.data[0].document_id;
  });

  it('reports the pharmacy as not ready while documents are pending', async () => {
    const res = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/readiness`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.body.data.ready_to_activate).toBe(false);
    expect(res.body.data.pending).toBeGreaterThan(0);
  });

  it('records who verified a document and when', async () => {
    const res = await request(app)
      .patch(`/api/controlhub/documents/${documentId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'VERIFIED', review_notes: 'Licence number matches the register' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('VERIFIED');
    expect(res.body.data.reviewed_by_id).toBeTruthy();
    expect(res.body.data.reviewed_at).toBeTruthy();
  });

  it('rejects a review status it does not recognise', async () => {
    const res = await request(app)
      .patch(`/api/controlhub/documents/${documentId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'MAYBE' });

    expect(res.statusCode).toEqual(400);
  });

  it('reports readiness only once every document is verified', async () => {
    const all = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/documents`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    for (const doc of all.body.data) {
      await request(app)
        .patch(`/api/controlhub/documents/${doc.document_id}/review`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: 'VERIFIED' });
    }

    const res = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/readiness`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.body.data.ready_to_activate).toBe(true);
    expect(res.body.data.pending).toEqual(0);
  });

  it('keeps documents away from pharmacy staff', async () => {
    const adminToken = await login('admin', SEED.centralTenantId);

    const res = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/documents`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(403);
  });
});
