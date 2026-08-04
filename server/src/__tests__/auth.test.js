const request = require('supertest');
const app = require('../app');
const { closeAll } = require('./helpers/adminDb');
const { SEED, controlHubLogin } = require('./helpers/login');

describe('Authentication and ControlHub access control', () => {
  afterAll(async () => {
    await closeAll();
  });

  it('rejects a login with no credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.statusCode).toEqual(400);
  });

  it('rejects a login with a wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'not-the-password' });

    expect(res.statusCode).toEqual(401);
  });

  it('refuses an ambiguous username shared by two pharmacies', async () => {
    // 'admin' exists in both Central Care and Riverside. Without a tenant the
    // server must not silently pick one.
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: SEED.password });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/multiple pharmacies/i);
  });

  it('logs the correct admin in when the tenant is named', async () => {
    const central = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: SEED.password, tenantId: SEED.centralTenantId });

    const riverside = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: SEED.password, tenantId: SEED.riversideTenantId });

    expect(central.statusCode).toEqual(200);
    expect(riverside.statusCode).toEqual(200);
    expect(central.body.data.user.tenantId).toEqual(SEED.centralTenantId);
    expect(riverside.body.data.user.tenantId).toEqual(SEED.riversideTenantId);
    expect(central.body.data.user.id).not.toEqual(riverside.body.data.user.id);
  });

  it('issues a token to a genuine SuperAdmin at the ControlHub', async () => {
    const res = await controlHubLogin('superadmin');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.user.role).toEqual('SuperAdmin');
  });

  it('does not let a tenant Admin log in to the ControlHub', async () => {
    // A pharmacy administrator must never be promoted to platform authority.
    const res = await controlHubLogin('admin');

    expect(res.statusCode).toEqual(401);
    expect(res.body.error).toMatch(/Invalid ControlHub credentials/i);
  });

  it('publishes a pharmacy directory for the login picker', async () => {
    const res = await request(app).get('/api/tenants/directory');

    expect(res.statusCode).toEqual(200);
    const ids = res.body.data.map((t) => t.tenant_id);
    expect(ids).toContain(SEED.centralTenantId);
    expect(ids).toContain(SEED.riversideTenantId);

    // The platform tenant is not a pharmacy and must stay off the picker.
    expect(ids).not.toContain(SEED.platformTenantId);

    // Only non-sensitive fields are published.
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['name', 'tenant_id']);
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    const res = await request(app).get('/api/products');
    expect(res.statusCode).toEqual(401);
  });

  it('rejects a malformed bearer token', async () => {
    const res = await request(app)
      .get('/api/products')
      .set('Authorization', 'Bearer not-a-real-token');

    expect(res.statusCode).toEqual(401);
  });

  it('returns 404 for an unknown endpoint outside the API', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.statusCode).toEqual(404);
    expect(res.body.error).toEqual('NOT_FOUND');
  });

  it('challenges an unknown API path before revealing that it is missing', async () => {
    // Everything under /api sits behind authenticate, so an unauthenticated
    // probe is turned away rather than told which endpoints exist.
    const res = await request(app).get('/api/does-not-exist');
    expect(res.statusCode).toEqual(401);
  });

  // The signing key has a fallback so a fresh checkout runs, and that fallback
  // is committed here — anyone reading the repository could forge a token for
  // any role with it. Production must refuse to start rather than sign with it.
  //
  // Checked in a child process because the refusal happens when the module is
  // loaded, and this suite already has it loaded under NODE_ENV=test.
  describe('the committed signing fallback is refused in production', () => {
    const { execFileSync } = require('child_process');
    const path = require('path');
    const serverRoot = path.join(__dirname, '../..');

    const loadAuthWith = (env) =>
      execFileSync(process.execPath, ['-e', "require('./src/middleware/auth')"], {
        cwd: serverRoot,
        env: { ...process.env, ...env },
        stdio: 'pipe'
      });

    it('refuses to start in production with no JWT_SECRET set', () => {
      let message = '';
      try {
        loadAuthWith({ NODE_ENV: 'production', JWT_SECRET: '' });
        throw new Error('it started, which means it signed with the public fallback');
      } catch (err) {
        message = String(err.stderr || err.message);
      }
      expect(message).toMatch(/JWT_SECRET must be set in production/);
    });

    it('starts in production once a real JWT_SECRET is supplied', () => {
      expect(() =>
        loadAuthWith({ NODE_ENV: 'production', JWT_SECRET: 'a-real-secret-value' })
      ).not.toThrow();
    });

    it('still runs on the fallback outside production, so a fresh checkout works', () => {
      expect(() => loadAuthWith({ NODE_ENV: 'development', JWT_SECRET: '' })).not.toThrow();
    });
  });
});
