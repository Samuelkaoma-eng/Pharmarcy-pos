const request = require('supertest');
const app = require('../app');
const { pool, closeAll } = require('./helpers/adminDb');
const { SEED } = require('./helpers/login');

// The refresh token was a stateless JWT valid for seven days. Nothing could
// revoke it, so signing out cleared the browser and left the token working, and
// a copied one kept working for a week.
//
// What is worth testing is the behaviour that makes theft survivable: that a
// token is single-use, that presenting a spent one kills the whole chain rather
// than just that link, and that signing out actually ends the session.

const COOKIE = 'pos_refresh';

// supertest gives back the raw Set-Cookie headers; this pulls out the value.
const refreshCookieFrom = (res) => {
  const raw = res.headers['set-cookie'] || [];
  const found = raw.find((c) => c.startsWith(`${COOKIE}=`));
  if (!found) return null;
  const value = found.split(';')[0].split('=').slice(1).join('=');
  return value === '' ? null : value;
};

const signIn = () =>
  request(app)
    .post('/api/auth/login')
    .send({ username: 'cashier', password: SEED.password, tenantId: SEED.centralTenantId });

const refreshWith = (cookie) =>
  request(app).post('/api/auth/refresh').set('Cookie', `${COOKIE}=${cookie}`);

describe('Refresh token rotation', () => {
  afterAll(async () => {
    await pool.query('DELETE FROM refresh_tokens');
    await closeAll();
  });

  it('issues the refresh token as an HttpOnly cookie, never in the body', async () => {
    const res = await signIn();

    expect(res.statusCode).toEqual(200);
    const header = (res.headers['set-cookie'] || []).find((c) => c.startsWith(`${COOKIE}=`));

    expect(header).toBeDefined();
    // The point of the cookie: script — and therefore any cross-site scripting
    // — cannot read it.
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    // It must not also be handed back where script can reach it.
    expect(JSON.stringify(res.body)).not.toContain(refreshCookieFrom(res));
    expect(res.body.data.refreshToken).toBeUndefined();
  });

  it('stores only a hash, so the table is useless to whoever reads it', async () => {
    const res = await signIn();
    const raw = refreshCookieFrom(res);

    const stored = await pool.query('SELECT token_hash FROM refresh_tokens WHERE token_hash = $1', [
      require('crypto').createHash('sha256').update(raw).digest('hex')
    ]);
    expect(stored.rows.length).toEqual(1);

    const plaintext = await pool.query('SELECT 1 FROM refresh_tokens WHERE token_hash = $1', [raw]);
    expect(plaintext.rows.length).toEqual(0);
  });

  it('rotates: each refresh returns a new access token and a different cookie', async () => {
    const first = refreshCookieFrom(await signIn());

    const rotated = await refreshWith(first);
    expect(rotated.statusCode).toEqual(200);
    expect(rotated.body.data.token).toBeTruthy();

    const second = refreshCookieFrom(rotated);
    expect(second).toBeTruthy();
    expect(second).not.toEqual(first);
  });

  it('refuses to reuse a spent token, and revokes the whole chain', async () => {
    const first = refreshCookieFrom(await signIn());
    const second = refreshCookieFrom(await refreshWith(first));

    // Replaying the spent link. Either the thief or the real user is doing
    // this and it is unknowable which, so the chain dies.
    const replay = await refreshWith(first);
    expect(replay.statusCode).toEqual(401);

    // The successor the legitimate holder had is now dead too.
    const afterReplay = await refreshWith(second);
    expect(afterReplay.statusCode).toEqual(401);
  });

  it('refuses a token that was never issued, without saying why', async () => {
    const res = await refreshWith('a'.repeat(64));
    expect(res.statusCode).toEqual(401);
    // Unknown, expired, revoked and replayed all answer identically.
    expect(res.body.error).toMatch(/sign in again/i);
  });

  it('refuses a refresh with no cookie at all', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.statusCode).toEqual(401);
  });

  it('ends the session on sign-out, rather than only in the browser', async () => {
    const cookie = refreshCookieFrom(await signIn());

    const out = await request(app).post('/api/auth/logout').set('Cookie', `${COOKIE}=${cookie}`);
    expect(out.statusCode).toEqual(200);

    // This is what clearing localStorage never did.
    const after = await refreshWith(cookie);
    expect(after.statusCode).toEqual(401);
  });

  it('signs out cleanly even with a dead cookie', async () => {
    const res = await request(app).post('/api/auth/logout').set('Cookie', `${COOKIE}=${'b'.repeat(64)}`);
    // Signing out with an already-dead session should still leave the caller
    // signed out, not hand them an error they can do nothing about.
    expect(res.statusCode).toEqual(200);
  });

  it('gives each sign-in its own chain, so one sign-out leaves the other working', async () => {
    const counter = refreshCookieFrom(await signIn());
    const backOffice = refreshCookieFrom(await signIn());

    await request(app).post('/api/auth/logout').set('Cookie', `${COOKIE}=${counter}`);

    // The second terminal is a different family and must be unaffected.
    const other = await refreshWith(backOffice);
    expect(other.statusCode).toEqual(200);
  });

  it('will not let a deactivated account refresh its way back in', async () => {
    const cookie = refreshCookieFrom(await signIn());

    await pool.query('UPDATE users SET is_active = FALSE WHERE username = $1 AND tenant_id = $2', [
      'cashier',
      SEED.centralTenantId
    ]);

    try {
      const res = await refreshWith(cookie);
      expect(res.statusCode).toEqual(401);
    } finally {
      await pool.query('UPDATE users SET is_active = TRUE WHERE username = $1 AND tenant_id = $2', [
        'cashier',
        SEED.centralTenantId
      ]);
    }
  });

  it('sets security headers on every response', async () => {
    const res = await request(app).get('/api/health');
    // Helmet. Cheap, and previously absent entirely.
    expect(res.headers['x-content-type-options']).toEqual('nosniff');
    expect(res.headers['x-frame-options']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
