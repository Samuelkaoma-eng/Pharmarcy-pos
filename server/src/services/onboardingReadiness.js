const db = require('../config/db');

// The paperwork ZAMRA requires before a pharmacy may dispense. All seven must be
// present and verified; a pharmacy cannot be admitted by submitting one
// certificate and nothing else.
const REQUIRED_TYPES = [
  'PACRA_CERTIFICATE',
  'TPIN_CERTIFICATE',
  'PHARMACIST_PRACTISING',
  'PHARMACIST_ID',
  'PREMISES_PROOF',
  'PREMISES_FLOOR_PLAN',
  'ZAMRA_INSPECTION'
];

// Computes the same answer for the onboarding screen and for the activation
// guard, so the figure an operator is shown is the figure that is enforced.
// Accepts an optional transaction client so the guard can run inside the same
// transaction that would apply the change.
const readinessFor = async (tenantId, client) => {
  const run = client ? (text, params) => client.query(text, params) : db.query;

  const counts = await run(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
       COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
       COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
     FROM onboarding_documents WHERE tenant_id = $1`,
    [tenantId]
  );

  const present = await run(
    "SELECT DISTINCT document_type FROM onboarding_documents WHERE tenant_id = $1 AND status = 'VERIFIED'",
    [tenantId]
  );

  const verifiedTypes = present.rows.map((r) => r.document_type);
  const missing = REQUIRED_TYPES.filter((t) => !verifiedTypes.includes(t));
  const row = counts.rows[0];

  return {
    ...row,
    required: REQUIRED_TYPES.length,
    missing,
    ready_to_activate: missing.length === 0 && row.pending === 0 && row.rejected === 0
  };
};

// Returns null when activation may proceed, or a sentence explaining what is
// outstanding. Callers refuse on anything non-null.
//
// This is the enforcement the architecture document claims for factor F5. It was
// previously reported by the onboarding screen and checked nowhere, so a
// pharmacy could be set ACTIVE with no paperwork at all and would immediately
// appear in the sign-in directory and be able to trade (DEF-055).
const blockingReason = async (tenantId, client) => {
  const r = await readinessFor(tenantId, client);
  if (r.ready_to_activate) return null;

  if (r.missing.length > 0) {
    return `Cannot activate: ${r.missing.length} of ${r.required} required documents are not verified (${r.missing.join(', ')})`;
  }
  if (r.rejected > 0) {
    return `Cannot activate: ${r.rejected} document(s) were rejected and must be replaced`;
  }
  return `Cannot activate: ${r.pending} document(s) are still awaiting review`;
};

module.exports = { REQUIRED_TYPES, readinessFor, blockingReason };
