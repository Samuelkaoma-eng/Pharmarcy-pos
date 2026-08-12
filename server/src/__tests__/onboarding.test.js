const request = require('supertest');
const app = require('../app');
const { pool, closeAll } = require('./helpers/adminDb');
const { SEED, login, controlHubLogin } = require('./helpers/login');
const { REQUIRED_TYPES } = require('../services/onboardingReadiness');
const portal = require('../services/onboardingPortal');
const { URL } = require('url');

// Pulls the token back out of a link the way the applicant's browser would.
const tokenFromLink = (link) => new URL(link).searchParams.get('token');

describe('Tenant onboarding and ControlHub review', () => {
  let superAdminToken;
  let registeredTenantId;
  let onboardingUploadToken;
  let uploadedDocumentId;
  let zamraDocumentId;
  const adminUsername = `owner_${Date.now()}`;

  beforeAll(async () => {
    const res = await controlHubLogin('superadmin');
    superAdminToken = res.body.data.token;
  });

  afterAll(async () => {
    if (registeredTenantId) {
      await pool.query('DELETE FROM tenants WHERE tenant_id = $1', [registeredTenantId]);
    }
    await closeAll();
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
    expect(res.body.data.onboarding_upload_token).toBeTruthy();
    registeredTenantId = res.body.data.tenant_id;
    onboardingUploadToken = res.body.data.onboarding_upload_token;
  });

  // The pharmacy files its own paperwork, so registration has to hand back the
  // means to do it. A live deployment would email this; there is no mail
  // transport here, so it is returned and shown on screen instead — labelled as
  // a simulation, with a link that genuinely works.
  it('answers a registration with the link the owner would be emailed', async () => {
    const res = await request(app)
      .post('/api/onboarding/register')
      .send({
        name: 'Link Check Pharmacy',
        owner_email: 'links@example.zm',
        admin_username: `links_${Date.now()}`,
        admin_password: 'onboarding-pass-123'
      });

    expect(res.statusCode).toEqual(201);
    const { notification, onboarding_link: link, tenant_id: tenantId } = res.body.data;

    expect(link).toContain(`/onboarding/${tenantId}`);
    expect(notification.simulated).toBe(true);
    expect(notification.to).toEqual('links@example.zm');
    expect(notification.cta_link).toEqual(link);
    // The token in the link is what authorises the upload, so the link is
    // useless without it.
    expect(tokenFromLink(link)).toBeTruthy();

    await pool.query('DELETE FROM tenants WHERE tenant_id = $1', [tenantId]);
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

  // The deployed build published links to `http://localhost:3000`, which resolve
  // to the reader's own machine. The in-app button still worked because it is
  // reduced to a path before being followed, so the only broken copy was the one
  // an applicant would actually receive — which is why this is pinned here.
  describe('the host written into the emailed link', () => {
    const saved = { app: process.env.APP_URL, railway: process.env.RAILWAY_PUBLIC_DOMAIN };

    afterEach(() => {
      if (saved.app === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = saved.app;
      if (saved.railway === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
      else process.env.RAILWAY_PUBLIC_DOMAIN = saved.railway;
    });

    it('uses APP_URL when the client is served from somewhere else', () => {
      process.env.APP_URL = 'https://pharmacy.example.zm/';
      // The trailing slash is stripped, or the link would carry a double slash.
      expect(portal.portalLink('t1', 'tok')).toEqual(
        'https://pharmacy.example.zm/onboarding/t1?token=tok'
      );
    });

    it('falls back to the platform domain, so a deployment needs no configuration', () => {
      delete process.env.APP_URL;
      process.env.RAILWAY_PUBLIC_DOMAIN = 'g-16-pharmarcypos.up.railway.app';

      const link = portal.portalLink('t1', 'tok');
      expect(link).toEqual('https://g-16-pharmarcypos.up.railway.app/onboarding/t1?token=tok');
      expect(link).not.toContain('localhost');
      expect(portal.signInLink()).not.toContain('localhost');
    });

    it('only falls back to localhost when nothing says otherwise', () => {
      delete process.env.APP_URL;
      delete process.env.RAILWAY_PUBLIC_DOMAIN;
      expect(portal.portalLink('t1', 'tok')).toContain('http://localhost:3000');
    });
  });

  it('lets the applicant upload onboarding documents before ControlHub review', async () => {
    const res = await request(app)
      .post(`/api/onboarding/${registeredTenantId}/documents`)
      .set('Authorization', `Bearer ${onboardingUploadToken}`)
      .field('document_type', 'PACRA_CERTIFICATE')
      .attach('file', Buffer.from('%PDF-1.4 applicant paperwork'), {
        filename: 'pacra.pdf',
        contentType: 'application/pdf'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.document_type).toEqual('PACRA_CERTIFICATE');
    expect(res.body.data.status).toEqual('PENDING');
    uploadedDocumentId = res.body.data.document_id;
  });

  it('does not let ControlHub add documents for an applicant', async () => {
    const res = await request(app)
      .post(`/api/controlhub/tenants/${registeredTenantId}/documents`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .field('document_type', 'TPIN_CERTIFICATE')
      .attach('file', Buffer.from('%PDF-1.4 controlhub paperwork'), {
        filename: 'tpin.pdf',
        contentType: 'application/pdf'
      });

    expect(res.statusCode).toEqual(404);
  });

  it('lets ControlHub open a document uploaded by the applicant', async () => {
    const res = await request(app)
      .get(`/api/controlhub/documents/${uploadedDocumentId}/file`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.text || res.body.toString()).toContain('%PDF-1.4 applicant paperwork');
  });

  it('shows the applicant their own application through the link', async () => {
    const res = await request(app)
      .get(`/api/onboarding/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${onboardingUploadToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.tenant.tenant_id).toEqual(registeredTenantId);
    expect(res.body.data.required_types).toEqual(REQUIRED_TYPES);
    expect(res.body.data.documents.map((d) => d.document_type)).toEqual(['PACRA_CERTIFICATE']);
    expect(res.body.data.can_upload).toBe(true);
    // Where the file sits on the server is the server's business.
    expect(res.body.data.documents[0].stored_path).toBeUndefined();
  });

  it('refuses the application page to a caller with no link token', async () => {
    const res = await request(app).get(`/api/onboarding/${registeredTenantId}/status`);
    expect(res.statusCode).toEqual(401);
  });

  // The link is the whole of the applicant's authority, so one pharmacy's link
  // must not open another's application.
  it('refuses a link token minted for a different pharmacy', async () => {
    const otherToken = portal.mintToken(SEED.centralTenantId);

    const res = await request(app)
      .get(`/api/onboarding/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.statusCode).toEqual(403);
  });

  // An ordinary sign-in token is not a licence to file paperwork against an
  // application, however valid it is as a session.
  it('refuses an ordinary session token on the onboarding routes', async () => {
    const cashierToken = await login('cashier');

    const res = await request(app)
      .get(`/api/onboarding/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(403);
  });

  // Filing a replacement supersedes what was there. Without this a document the
  // reviewer rejected would sit on the record for ever, and readiness — which
  // refuses activation while anything is rejected — could never be satisfied
  // however many corrected copies the applicant sent.
  it('replaces a document rather than filing a second copy of it', async () => {
    const res = await request(app)
      .post(`/api/onboarding/${registeredTenantId}/documents`)
      .set('Authorization', `Bearer ${onboardingUploadToken}`)
      .field('document_type', 'PACRA_CERTIFICATE')
      .attach('file', Buffer.from('%PDF-1.4 corrected paperwork'), {
        filename: 'pacra-v2.pdf',
        contentType: 'application/pdf'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.document_id).not.toEqual(uploadedDocumentId);

    const rows = await pool.query(
      "SELECT document_id FROM onboarding_documents WHERE tenant_id = $1 AND document_type = 'PACRA_CERTIFICATE'",
      [registeredTenantId]
    );
    expect(rows.rows.length).toEqual(1);

    uploadedDocumentId = res.body.data.document_id;
  });

  // A pharmacy that has filed nothing must not be able to trade. Readiness used
  // to be reported to the operator and enforced nowhere, so this activation
  // succeeded against an empty document set (DEF-055).
  it('refuses to activate a pharmacy that has filed no paperwork', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/required documents are not verified/i);

    const after = await pool.query('SELECT status FROM tenants WHERE tenant_id = $1', [
      registeredTenantId
    ]);
    expect(after.rows[0].status).not.toEqual('ACTIVE');
  });

  it('still refuses while a single document is left unverified', async () => {
    await request(app)
      .patch(`/api/controlhub/documents/${uploadedDocumentId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'VERIFIED' });

    // Six of seven verified is not six-sevenths admitted. It is refused.
    const types = REQUIRED_TYPES.slice(1, REQUIRED_TYPES.length - 1);
    for (const t of types) {
      await pool.query(
        `INSERT INTO onboarding_documents (tenant_id, document_type, file_name, status)
         VALUES ($1, $2, $3, 'VERIFIED')`,
        [registeredTenantId, t, `${t.toLowerCase()}.pdf`]
      );
    }

    const res = await request(app)
      .put(`/api/controlhub/tenants/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/ZAMRA_INSPECTION/);
  });

  // The rest of this describe walks the decline half of the flow: the applicant
  // files the last document, the reviewer refuses it in writing, the pharmacy is
  // told what to replace, replaces it, and is then approved.
  it('lets the applicant file the last outstanding document', async () => {
    const res = await request(app)
      .post(`/api/onboarding/${registeredTenantId}/documents`)
      .set('Authorization', `Bearer ${onboardingUploadToken}`)
      .field('document_type', 'ZAMRA_INSPECTION')
      .attach('file', Buffer.from('%PDF-1.4 inspection report'), {
        filename: 'zamra.pdf',
        contentType: 'application/pdf'
      });

    expect(res.statusCode).toEqual(201);
    zamraDocumentId = res.body.data.document_id;
  });

  it('records the reviewer reason when a document is rejected', async () => {
    const res = await request(app)
      .patch(`/api/controlhub/documents/${zamraDocumentId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'REJECTED', review_notes: 'The inspection report is unsigned.' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('REJECTED');
    expect(res.body.data.review_notes).toEqual('The inspection report is unsigned.');
  });

  it('refuses activation while a document stands rejected', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.statusCode).toEqual(400);
  });

  // A decline the applicant cannot act on is a dead end. The message names the
  // document and repeats the reviewer's sentence, and carries a working link
  // back to the same page.
  let declineLinkToken;
  it('declines the application and says which document to replace', async () => {
    const res = await request(app)
      .put(`/api/controlhub/tenants/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'REJECTED' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('REJECTED');

    const { notification } = res.body.data;
    expect(notification.simulated).toBe(true);
    expect(notification.to).toEqual('owner@testpharmacy.zm');
    expect(notification.body.join('\n')).toContain('ZAMRA_INSPECTION');
    expect(notification.body.join('\n')).toContain('The inspection report is unsigned.');
    expect(notification.cta_link).toContain(`/onboarding/${registeredTenantId}`);

    declineLinkToken = tokenFromLink(notification.cta_link);
  });

  it('lets the declined applicant resubmit, which returns them to the queue', async () => {
    const res = await request(app)
      .post(`/api/onboarding/${registeredTenantId}/documents`)
      .set('Authorization', `Bearer ${declineLinkToken}`)
      .field('document_type', 'ZAMRA_INSPECTION')
      .attach('file', Buffer.from('%PDF-1.4 signed inspection report'), {
        filename: 'zamra-signed.pdf',
        contentType: 'application/pdf'
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.returned_to_review).toBe(true);
    zamraDocumentId = res.body.data.document_id;

    // The rejected copy is gone, so nothing is left blocking activation but the
    // review of the replacement.
    const status = await request(app)
      .get(`/api/onboarding/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${declineLinkToken}`);
    expect(status.body.data.tenant.status).toEqual('UNDER_REVIEW');
    expect(status.body.data.readiness.rejected).toEqual(0);

    const queue = await request(app)
      .get('/api/controlhub/onboarding')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(queue.body.data.map((t) => t.tenant_id)).toContain(registeredTenantId);
  });

  it('lets the SuperAdmin activate the tenant once every document is verified', async () => {
    await request(app)
      .patch(`/api/controlhub/documents/${zamraDocumentId}/review`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'VERIFIED' });

    const res = await request(app)
      .put(`/api/controlhub/tenants/${registeredTenantId}/status`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .send({ status: 'ACTIVE' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('ACTIVE');

    // Approval points the pharmacy at sign-in rather than back at the
    // application, and names the administrator it nominated.
    const { notification } = res.body.data;
    expect(notification.subject).toMatch(/approved/i);
    expect(notification.cta_link).toMatch(/\/login$/);
    expect(notification.body.join('\n')).toContain(adminUsername);
  });

  it('stops accepting uploads once the pharmacy is approved', async () => {
    const res = await request(app)
      .post(`/api/onboarding/${registeredTenantId}/documents`)
      .set('Authorization', `Bearer ${onboardingUploadToken}`)
      .field('document_type', 'PACRA_CERTIFICATE')
      .attach('file', Buffer.from('%PDF-1.4 too late'), {
        filename: 'late.pdf',
        contentType: 'application/pdf'
      });

    expect(res.statusCode).toEqual(404);
  });

  it('drops the tenant off the onboarding queue once active', async () => {
    const res = await request(app)
      .get('/api/controlhub/onboarding')
      .set('Authorization', `Bearer ${superAdminToken}`);

    const ids = res.body.data.map((t) => t.tenant_id);
    expect(ids).not.toContain(registeredTenantId);
  });

  // Registration never asks for a licence number, so a pharmacy onboarded
  // through it has none. The directory filtered the platform tenant out with
  // `license_number <> 'PLATFORM-000'`, which is NULL — not true — for exactly
  // those pharmacies, so an approved applicant was activated and then left off
  // the sign-in screen entirely.
  it('shows the newly approved pharmacy on the sign-in screen', async () => {
    const licence = await pool.query('SELECT license_number FROM tenants WHERE tenant_id = $1', [
      registeredTenantId
    ]);
    expect(licence.rows[0].license_number).toBeNull();

    const res = await request(app).get('/api/tenants/directory');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.map((t) => t.tenant_id)).toContain(registeredTenantId);
    // The platform tenant still never appears: staff do not sign in to it.
    expect(res.body.data.map((t) => t.tenant_id)).not.toContain(SEED.platformTenantId);
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
