const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { generateToken } = require('../middleware/auth');
const refreshTokens = require('../services/refreshTokens');

// The refresh token is written here and nowhere else, and never appears in a
// response body. That is the whole reason for the cookie: JavaScript — and so
// any cross-site scripting — cannot read it.
const REFRESH_COOKIE = 'pos_refresh';
// Scoped to the auth routes, so it is not attached to the hundred other API
// calls that have no use for it.
const REFRESH_PATH = '/api/auth';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  // The client is served from the same origin through the dev proxy, so Lax is
  // enough and no cross-site exemption is needed. Secure follows the
  // environment: a cookie marked Secure is dropped over plain http, which would
  // silently break local development.
  secure: process.env.NODE_ENV === 'production',
  path: REFRESH_PATH,
  maxAge: refreshTokens.TTL_DAYS * 24 * 60 * 60 * 1000
});

const setRefreshCookie = (res, raw) => res.cookie(REFRESH_COOKIE, raw, cookieOptions());

const clearRefreshCookie = (res) =>
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });

const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE] || null;

const clientIp = (req) => req.ip || req.socket?.remoteAddress || null;

exports.login = async (req, res) => {
  try {
    const { username, password, tenantId } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Usernames are only unique per tenant, so an unscoped lookup could match
    // several tenants. Scope when the caller names a tenant, otherwise require
    // one as soon as the username is ambiguous.
    //
    // This is one of the few reads that genuinely cannot be tenant-scoped: it
    // is what establishes the tenant. Row-level security would otherwise return
    // nothing here, so the lookup is made inside the declared auth window,
    // which reaches the identity tables and nothing else.
    const result = await db.withAuthLookup(() =>
      tenantId
        ? db.query('SELECT * FROM users WHERE username = $1 AND tenant_id = $2', [username, tenantId])
        : db.query('SELECT * FROM users WHERE username = $1', [username])
    );

    if (result.rows.length > 1) {
      return res.status(400).json({ error: 'Username exists in multiple pharmacies. Please supply tenantId.' });
    }

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // A pharmacy that has registered but not yet been approved must not be able
    // to trade, so its staff cannot sign in until the ControlHub activates it.
    const tenantRes = await db.withAuthLookup(() =>
      db.query('SELECT status, name FROM tenants WHERE tenant_id = $1', [user.tenant_id])
    );
    const tenant = tenantRes.rows[0];

    if (!tenant || tenant.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'This pharmacy is not active yet. Sign-in opens once the application has been approved.'
      });
    }

    const payload = { userId: user.user_id, tenantId: user.tenant_id, role: user.role, username: user.username };
    const token = generateToken(payload);

    // A new chain per sign-in, so signing out on one terminal leaves the others
    // working. The raw value goes out only in the Set-Cookie header.
    const raw = await refreshTokens.issue({
      userId: user.user_id,
      tenantId: user.tenant_id,
      ip: clientIp(req),
      userAgent: req.get('user-agent')
    });
    setRefreshCookie(res, raw);

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          tenantId: user.tenant_id
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during authentication' });
  }
};

exports.controlHubLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // ControlHub is platform-wide, so only a real SuperAdmin may enter. A tenant
    // Admin must never be promoted here: that would hand one pharmacy's
    // administrator authority over every other tenant on the platform.
    const result = await db.withAuthLookup(() =>
      db.query('SELECT * FROM users WHERE username = $1 AND role = $2', [username, 'SuperAdmin'])
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid ControlHub credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid ControlHub credentials' });
    }

    const payload = { userId: user.user_id, tenantId: user.tenant_id, role: 'SuperAdmin', username: user.username };
    const token = generateToken(payload);

    // Platform operators get a revocable session too. If anything, more so.
    const raw = await refreshTokens.issue({
      userId: user.user_id,
      tenantId: user.tenant_id,
      ip: clientIp(req),
      userAgent: req.get('user-agent')
    });
    setRefreshCookie(res, raw);

    return res.json({
      success: true,
      message: 'ControlHub login successful',
      data: {
        token,
        user: { id: user.user_id, username: user.username, role: 'SuperAdmin' }
      }
    });
  } catch (error) {
    console.error('ControlHub login error:', error);
    res.status(500).json({ error: 'Server error during ControlHub authentication' });
  }
};

// Exchanges the refresh cookie for a new access token and rotates the cookie.
// The response body carries only the access token and the user; the refresh
// value leaves solely in the Set-Cookie header.
exports.refresh = async (req, res) => {
  try {
    const { user, next } = await refreshTokens.rotate({
      raw: readRefreshCookie(req),
      ip: clientIp(req),
      userAgent: req.get('user-agent')
    });

    const token = generateToken({
      userId: user.user_id,
      tenantId: user.tenant_id,
      role: user.role,
      username: user.username
    });

    setRefreshCookie(res, next);

    return res.json({
      success: true,
      message: 'Token refreshed',
      data: {
        token,
        user: {
          id: user.user_id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          tenantId: user.tenant_id
        }
      }
    });
  } catch (error) {
    if (error.code === refreshTokens.RACED) {
      // Another request rotated a moment ago and this caller now holds a newer
      // cookie. 409 rather than 401 so the client retries instead of tearing
      // the session down over a double-click.
      return res.status(409).json({ error: 'This session was refreshed concurrently — retry' });
    }

    if (error.code === refreshTokens.REJECTED) {
      // Unknown, expired, revoked or replayed all answer identically. The
      // distinctions are only useful to somebody probing.
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Session expired — sign in again' });
    }

    console.error('Refresh error:', error.message);
    return res.status(500).json({ error: 'Could not refresh the session' });
  }
};

// Ends the session on the server, which clearing localStorage never did: before
// this, a copied token stayed valid until it expired.
//
// Always succeeds. Signing out with an already-dead cookie should still leave
// the caller signed out, not hand them an error they can do nothing about.
exports.logout = async (req, res) => {
  try {
    const family = await refreshTokens.familyForToken(readRefreshCookie(req));
    if (family) await refreshTokens.revokeFamilyById(family);
  } catch (error) {
    console.error('Logout error:', error.message);
  }
  clearRefreshCookie(res);
  return res.json({ success: true, message: 'Signed out' });
};

exports.getProfile = async (req, res) => {
  try {
    const { userId } = req.user;
    const result = await db.query('SELECT user_id, tenant_id, username, full_name, role, created_at FROM users WHERE user_id = $1', [userId]);
    const user = result.rows[0];

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, message: 'Profile retrieved', data: user });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Server error fetching profile' });
  }
};
