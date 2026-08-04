// Who changed what, when, and from where.
//
// This module deliberately holds no database handle of its own. Every caller
// passes the executor it is already using — the open transaction client where
// there is one — which is what keeps an entry tied to the change it describes.
//
// stock_movements already accounted for stock and approval_requests for
// platform changes, but nothing covered the rest. A price could be edited, a
// prescription verified, an account given a new role or a drawer counted
// short, and the only trace was the new value sitting in its column with no
// record of what it had been or who put it there.
//
// The rule that gives an entry its value: it is written with the same executor
// as the change it describes. Pass the open transaction client and a rolled
// back change leaves no audit entry claiming it happened.

// The actions worth recording. Enumerated rather than free text so the log can
// be read by machine and so a typo cannot quietly create a category nobody
// searches for.
const ACTIONS = {
  PRICE_CHANGED: 'PRICE_CHANGED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DISCONTINUED: 'PRODUCT_DISCONTINUED',
  VAT_TREATMENT_CHANGED: 'VAT_TREATMENT_CHANGED',
  STOCK_ADJUSTED: 'STOCK_ADJUSTED',
  PRESCRIPTION_VERIFIED: 'PRESCRIPTION_VERIFIED',
  TILL_CLOSED: 'TILL_CLOSED',
  ROLE_CHANGED: 'ROLE_CHANGED',
  USER_DEACTIVATED: 'USER_DEACTIVATED',
  USER_REACTIVATED: 'USER_REACTIVATED'
};

const actorFrom = (req) => ({
  actorId: req?.user?.userId || null,
  actorUsername: req?.user?.username || null,
  actorRole: req?.user?.role || null,
  tenantId: req?.user?.tenantId || null,
  ip: req?.ip || req?.socket?.remoteAddress || null
});

/**
 * Record one change.
 *
 * `executor` is the pg client of the transaction making the change, or the db
 * module for a change that is a single statement. Passing the transaction is
 * what keeps the log honest.
 *
 * Recording never fails a request on its own. An audit write that throws is
 * logged to the console and swallowed, because refusing a legitimate price
 * change because the trail could not be written would be the wrong trade — but
 * a write inside a transaction that later rolls back disappears with it, which
 * is the behaviour we actually want.
 */
const record = async (
  executor,
  req,
  { action, entityType, entityId = null, entityLabel = null, before = null, after = null, reason = null }
) => {
  const who = actorFrom(req);

  try {
    await executor.query(
      `INSERT INTO audit_log
         (tenant_id, actor_id, actor_username, actor_role, action,
          entity_type, entity_id, entity_label, before_value, after_value, reason, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        who.tenantId,
        who.actorId,
        who.actorUsername,
        who.actorRole,
        action,
        entityType,
        entityId,
        entityLabel,
        before === null ? null : JSON.stringify(before),
        after === null ? null : JSON.stringify(after),
        reason,
        who.ip
      ]
    );
  } catch (err) {
    console.error('Audit write failed:', err.message, action, entityType, entityId);
  }
};

/**
 * Compare two rows across the fields given and record only what actually
 * changed. A save that alters nothing produces no entry, so the trail stays
 * worth reading rather than filling with no-op edits.
 *
 * Returns true when something was recorded.
 */
const recordChange = async (executor, req, { action, entityType, entityId, entityLabel, fields, before, after, reason }) => {
  const changedBefore = {};
  const changedAfter = {};

  for (const field of fields) {
    const was = before?.[field];
    const now = after?.[field];
    // Compared as strings so a NUMERIC coming back as '12.00' against a posted
    // 12 does not read as a change that never happened.
    if (String(was ?? '') !== String(now ?? '')) {
      changedBefore[field] = was ?? null;
      changedAfter[field] = now ?? null;
    }
  }

  if (Object.keys(changedAfter).length === 0) return false;

  await record(executor, req, {
    action,
    entityType,
    entityId,
    entityLabel,
    before: changedBefore,
    after: changedAfter,
    reason
  });
  return true;
};

module.exports = { record, recordChange, ACTIONS };
