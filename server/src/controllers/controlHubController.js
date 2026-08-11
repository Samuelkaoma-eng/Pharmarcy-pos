const bcrypt = require('bcryptjs');
const db = require('../config/db');
const readiness = require('../services/onboardingReadiness');
const portal = require('../services/onboardingPortal');

const TENANT_STATUSES = ['REGISTERED', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ACTIVE', 'REJECTED'];

// The statuses that are a decision rather than a stage, and so are worth
// telling the applicant about.
const DECIDED = ['APPROVED', 'ACTIVE', 'REJECTED'];

// Builds the message the pharmacy's owner would be emailed when their
// application is decided. There is no mail transport here, so it is returned to
// the reviewer's screen, which renders it as the preview it is — the link
// inside is real and opens exactly what the emailed one would open.
const decisionNotification = async (tenant) => {
  if (!DECIDED.includes(tenant.status)) return null;

  // A decline has to say what was wrong with the paperwork, or the applicant has
  // nothing to act on.
  let rejectedDocuments = [];
  if (tenant.status === 'REJECTED') {
    const docs = await db.query(
      "SELECT document_type, review_notes FROM onboarding_documents WHERE tenant_id = $1 AND status = 'REJECTED'",
      [tenant.tenant_id]
    );
    rejectedDocuments = docs.rows;
  }

  // An approved pharmacy signs in as its administrator, so name them.
  let adminUsername = null;
  if (tenant.status !== 'REJECTED') {
    const admin = await db.query(
      "SELECT username FROM users WHERE tenant_id = $1 AND role = 'Admin' ORDER BY created_at ASC LIMIT 1",
      [tenant.tenant_id]
    );
    adminUsername = admin.rows[0]?.username || null;
  }

  return portal.decisionEmail(tenant, {
    // A declined applicant needs a working link back to their own page. An
    // approved one does not: they sign in from now on.
    token: tenant.status === 'REJECTED' ? portal.mintToken(tenant.tenant_id) : null,
    adminUsername,
    rejectedDocuments
  });
};

exports.getTenants = async (req, res) => {
  try {
    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(`
      SELECT t.*, (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.tenant_id) as users_count
      FROM tenants t
      ORDER BY t.name ASC
    `);
    res.json({ message: 'Tenants retrieved', data: result.rows });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTenant = async (req, res) => {
  try {
    const { id } = req.params;
    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query('SELECT * FROM tenants WHERE tenant_id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

    res.json({ message: 'Tenant retrieved', data: result.rows[0] });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateTenantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!db.isDbAvailable()) return db.unavailable(res);

    if (!TENANT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${TENANT_STATUSES.join(', ')}` });
    }

    // Activation is the moment a pharmacy becomes able to dispense: it appears
    // in the sign-in directory and its staff can trade. It is refused while any
    // required document is unverified, rejected or still awaiting review.
    // Readiness used to be reported to the operator and enforced nowhere, so a
    // pharmacy could be activated with no paperwork at all (DEF-055).
    if (status === 'ACTIVE') {
      const blocked = await readiness.blockingReason(id);
      if (blocked) return res.status(400).json({ error: blocked });
    }

    const result = await db.query('UPDATE tenants SET status = $1 WHERE tenant_id = $2 RETURNING *', [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });

    const tenant = result.rows[0];

    res.json({
      message: 'Tenant status updated',
      data: { ...tenant, notification: await decisionNotification(tenant) }
    });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getOnboarding = async (req, res) => {
  try {
    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await db.query(
      "SELECT * FROM tenants WHERE status IN ('REGISTERED', 'SUBMITTED', 'UNDER_REVIEW') ORDER BY created_at ASC"
    );
    res.json({ message: 'Onboarding applications retrieved', data: result.rows });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.registerTenant = async (req, res) => {
  try {
    const { name, owner_email, phone, admin_username, admin_password } = req.body;

    if (!name || !owner_email) {
      return res.status(400).json({ error: 'Pharmacy name and owner email are required' });
    }
    if (!admin_username || !admin_password) {
      return res.status(400).json({ error: 'An administrator username and password are required' });
    }
    if (admin_password.length < 8) {
      return res.status(400).json({ error: 'Administrator password must be at least 8 characters' });
    }

    if (!db.isDbAvailable()) return db.unavailable(res);

    // The pharmacy and its first administrator are created together. Without
    // the administrator an approved pharmacy would have nobody able to sign
    // in. The owner chooses the password here, so no secret is generated or
    // returned in the response.
    //
    // This runs before the pharmacy exists, so there is no tenant to scope the
    // connection to and row-level security would refuse both inserts. It is
    // declared as an auth lookup, which reaches tenants and users and no other
    // table — a registration cannot touch a patient record or anybody's stock.
    const tenant = await db.withAuthLookup(async () => {
      const client = await db.connect();
      try {
        await client.query('BEGIN');

        const tenantRes = await client.query(
          'INSERT INTO tenants (name, owner_email, phone, status) VALUES ($1, $2, $3, $4) RETURNING *',
          [name, owner_email, phone, 'REGISTERED']
        );
        const created = tenantRes.rows[0];

        const passwordHash = await bcrypt.hash(admin_password, 10);
        await client.query(
          'INSERT INTO users (tenant_id, username, password_hash, full_name, role) VALUES ($1, $2, $3, $4, $5)',
          [created.tenant_id, admin_username, passwordHash, `${name} Administrator`, 'Admin']
        );

        await client.query('COMMIT');
        return created;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });

    // The pharmacy files its own compliance paperwork, so what registration
    // hands back is the means to do it: a token scoped to this application
    // alone, and the link a live deployment would have emailed to the owner.
    const onboarding_upload_token = portal.mintToken(tenant.tenant_id);

    return res.status(201).json({
      message: 'Pharmacy registered and awaiting review',
      data: {
        ...tenant,
        admin_username,
        onboarding_upload_token,
        onboarding_link: portal.portalLink(tenant.tenant_id, onboarding_upload_token),
        notification: portal.applicationReceivedEmail(tenant, onboarding_upload_token)
      }
    });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTenantSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT tenant_id, name, status, expiry_alert_days, low_stock_alerts,
              require_customer_on_sale, allow_public_registration, require_till_session
       FROM tenants WHERE tenant_id = $1`,
      [id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant settings retrieved', data: result.rows[0] });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Operational settings are platform-controlled, so only the ControlHub may
// change them. A pharmacy reads them through its own config endpoint.
exports.updateTenantSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      expiry_alert_days, low_stock_alerts, require_customer_on_sale,
      allow_public_registration, require_till_session
    } = req.body;

    if (expiry_alert_days !== undefined && (expiry_alert_days < 7 || expiry_alert_days > 365)) {
      return res.status(400).json({ error: 'Expiry alert window must be between 7 and 365 days' });
    }

    const result = await db.query(
      `UPDATE tenants SET
         expiry_alert_days = COALESCE($1, expiry_alert_days),
         low_stock_alerts = COALESCE($2, low_stock_alerts),
         require_customer_on_sale = COALESCE($3, require_customer_on_sale),
         allow_public_registration = COALESCE($4, allow_public_registration),
         require_till_session = COALESCE($5, require_till_session)
       WHERE tenant_id = $6
       RETURNING tenant_id, name, expiry_alert_days, low_stock_alerts,
                 require_customer_on_sale, allow_public_registration, require_till_session`,
      [expiry_alert_days, low_stock_alerts, require_customer_on_sale, allow_public_registration, require_till_session, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant settings updated', data: result.rows[0] });
  } catch (error) {
    console.error('ControlHub controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
