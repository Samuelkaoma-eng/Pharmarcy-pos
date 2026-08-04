const crypto = require('crypto');
const db = require('../config/db');

// Refresh tokens that can be ended.
//
// The old design was a stateless JWT valid for seven days. Nothing could revoke
// it, so signing out cleared the browser and left the token working, and a
// copied one kept working for a week. This replaces it with a stored, rotating
// chain modelled on the approach used in the Arcus Invest platform.
//
// Three properties carry the design:
//   * the raw value is never stored, only its SHA-256 hash;
//   * each sign-in opens its own family, so revoking one device leaves others;
//   * each refresh consumes the token presented and issues its successor.
//
// Rotation is what makes theft detectable. A thief and the real user cannot
// both keep using one chain, so whichever presents an already-spent token
// reveals the theft — and by then it is unknowable which party is which, so the
// whole family dies rather than the single replayed link.

// 32 bytes is far past guessing, which matters because this value alone carries
// a session.
const TOKEN_BYTES = 32;
const TTL_DAYS = parseInt(process.env.REFRESH_TTL_DAYS || '7', 10);

// Every unusable token answers the same way. Telling a caller *why* a token was
// refused is only useful to somebody probing.
const REJECTED = 'REFRESH_REJECTED';
// Not an attack: two requests refreshed together. The loser should retry with
// the cookie it now holds, not be signed out for double-clicking.
const RACED = 'REFRESH_RACED';

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

const newRawToken = () => crypto.randomBytes(TOKEN_BYTES).toString('hex');

const rejected = () => Object.assign(new Error('Refresh token rejected'), { code: REJECTED });
const raced = () => Object.assign(new Error('Refresh token was rotated concurrently'), { code: RACED });

const appendToFamily = async (executor, { userId, tenantId, familyId, ip, userAgent }) => {
  const raw = newRawToken();
  await executor.query(
    `INSERT INTO refresh_tokens (user_id, tenant_id, token_hash, family_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval, $6, $7)`,
    [userId, tenantId, hashToken(raw), familyId, String(TTL_DAYS), ip || null, userAgent || null]
  );
  return raw;
};

// Opens a new chain. Called on a fresh sign-in, so each device gets its own
// family and signing one out does not sign the others out.
const issue = async ({ userId, tenantId, ip, userAgent }) =>
  appendToFamily(db, { userId, tenantId, familyId: crypto.randomUUID(), ip, userAgent });

const revokeFamily = async (executor, familyId) => {
  await executor.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = $1 AND revoked_at IS NULL',
    [familyId]
  );
};

// Ends every chain a user holds. Used when an account is deactivated or its
// password changes, where leaving other devices signed in would be wrong.
const revokeAllForUser = async (userId) => {
  await db.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId]
  );
};

/**
 * Consume the presented token and return its owner plus a successor.
 *
 * The presented value is never usable again. Throws an error carrying
 * `code: REJECTED` for anything unusable, or `code: RACED` when another request
 * rotated the same link a moment earlier.
 */
const rotate = async ({ raw, ip, userAgent }) => {
  if (!raw) throw rejected();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const found = await client.query(
      `SELECT token_id, user_id, tenant_id, family_id, used_at, revoked_at,
              expires_at < NOW() AS has_expired
       FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(raw)]
    );

    if (found.rows.length === 0) {
      await client.query('ROLLBACK');
      throw rejected();
    }

    const row = found.rows[0];

    if (row.revoked_at || row.has_expired) {
      await client.query('ROLLBACK');
      throw rejected();
    }

    // Already spent when we read it: a replay of an older link, so the chain is
    // compromised and every token in it dies.
    if (row.used_at) {
      await revokeFamily(client, row.family_id);
      await client.query('COMMIT');
      throw rejected();
    }

    // Claim it conditionally, so two requests arriving together cannot both
    // succeed and fork the chain into two live successors.
    const claimed = await client.query(
      `UPDATE refresh_tokens SET used_at = NOW()
       WHERE token_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
      [row.token_id]
    );

    if (claimed.rowCount !== 1) {
      await client.query('ROLLBACK');
      throw raced();
    }

    const userRes = await client.query(
      'SELECT user_id, tenant_id, username, full_name, role, is_active FROM users WHERE user_id = $1',
      [row.user_id]
    );

    if (userRes.rows.length === 0) {
      await client.query('ROLLBACK');
      throw rejected();
    }

    const user = userRes.rows[0];

    // A deactivated account must not be able to refresh its way back in.
    if (user.is_active === false) {
      await revokeFamily(client, row.family_id);
      await client.query('COMMIT');
      throw rejected();
    }

    const next = await appendToFamily(client, {
      userId: row.user_id,
      tenantId: row.tenant_id,
      familyId: row.family_id,
      ip,
      userAgent
    });

    await client.query('COMMIT');
    return { user, next };
  } catch (err) {
    // A rejection that already committed its family revocation must not be
    // rolled back on the way out.
    if (err.code !== REJECTED && err.code !== RACED) {
      await client.query('ROLLBACK').catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
};

// Resolves the chain a raw token belongs to, for sign-out. It deliberately does
// not validate: signing out with a spent or expired token should still clear
// the session rather than fail.
const familyForToken = async (raw) => {
  if (!raw) return null;
  const res = await db.query('SELECT family_id FROM refresh_tokens WHERE token_hash = $1', [
    hashToken(raw)
  ]);
  return res.rows[0]?.family_id || null;
};

const revokeFamilyById = (familyId) => revokeFamily(db, familyId);

module.exports = {
  issue,
  rotate,
  revokeFamilyById,
  revokeAllForUser,
  familyForToken,
  hashToken,
  REJECTED,
  RACED,
  TTL_DAYS
};
