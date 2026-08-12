const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');
const portal = require('../services/onboardingPortal');

// Uploaded paperwork lives outside the source tree so it is never served as
// static content and never committed.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

// Held in the service rather than here, because the activation guard enforces
// the same list and the two must never drift apart.
const { REQUIRED_TYPES, readinessFor } = require('../services/onboardingReadiness');

// The statuses in which an application is still the applicant's to change.
// REJECTED belongs here: a decline is a request for better paperwork, not a
// door closed — the applicant is told which documents failed and replaces them,
// which returns the application to the queue. Only an approved pharmacy is
// finished with this route; after that it has staff accounts and a workspace.
const APPLICANT_EDITABLE = ['REGISTERED', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED'];

// Compliance paperwork is scanned documents and photographs, nothing else.
// Anything executable must not be accepted, let alone handed back later.
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Never trust the client's filename on disk: it is kept for display only.
    const ext = path.extname(file.originalname).slice(0, 10).replace(/[^.a-zA-Z0-9]/g, '');
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2, 10)}${ext}`);
  }
});

exports.upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPEG, PNG or WebP files are accepted'));
    }
    cb(null, true);
  }
});

exports.getRequiredTypes = (req, res) => {
  res.json({ success: true, message: 'Required document types', data: REQUIRED_TYPES });
};

// The applicant arrives holding a link, not a session — they have no account
// until their pharmacy is approved. The token in that link is the whole of
// their authority, so it is verified here and then put on the connection as the
// tenant scope, which is what keeps it to their own application and nothing
// else.
exports.requireOnboardingToken = async (req, res, next) => {
  // Accept the token from the Authorization header or from the query string,
  // because the second is how it arrives when a browser follows an emailed link.
  const authHeader = req.headers.authorization;
  const supplied = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.query.token;

  if (!supplied) {
    return res.status(401).json({ error: 'An onboarding link token is required' });
  }

  let decoded;
  try {
    decoded = portal.verifyToken(supplied, req.params.id);
  } catch (err) {
    // Wrong pharmacy is a refusal; expired or unreadable is a challenge.
    const status = /does not belong/.test(err.message) ? 403 : 401;
    return res.status(status).json({ error: err.message });
  }

  try {
    await db.setTenantScope({ tenantId: decoded.tenantId, platformAdmin: false });
    req.onboardingApplicant = true;
    // Kept on the request so the upload handler can put the tenant back on a
    // connection if the request scope does not survive the file parse. See
    // `withRequestScope` below.
    req.onboardingTenantId = decoded.tenantId;
    return next();
  } catch (err) {
    console.error('Could not scope an onboarding request:', err.message);
    return res.status(503).json({
      error: 'DATABASE_UNAVAILABLE',
      message: 'The database is not reachable, so this request cannot be answered.'
    });
  }
};

// What the emailed link opens: the applicant's own view of their application.
// It is the same set of facts the ControlHub reviewer sees for this pharmacy —
// which documents are filed, which were verified, and what the reviewer wrote
// on the ones that were not — because the applicant cannot act on a decline
// they are not shown.
exports.getOnboardingStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const tenantRes = await db.query(
      'SELECT tenant_id, name, status, owner_email, phone FROM tenants WHERE tenant_id = $1',
      [id]
    );
    if (tenantRes.rows.length === 0) return res.status(404).json({ error: 'Pharmacy not found' });

    // stored_path is deliberately not selected: the applicant is told what they
    // filed and how it was judged, not where it sits on the server's disk.
    const docsRes = await db.query(
      `SELECT document_id, document_type, file_name, status, review_notes, uploaded_at, reviewed_at
         FROM onboarding_documents
        WHERE tenant_id = $1
        ORDER BY uploaded_at ASC`,
      [id]
    );

    const readiness = await readinessFor(id);

    res.json({
      message: 'Onboarding status retrieved',
      data: {
        tenant: tenantRes.rows[0],
        required_types: REQUIRED_TYPES,
        documents: docsRes.rows,
        readiness,
        // Uploads close once the pharmacy is approved, so the page can say so
        // rather than offering a button the server would refuse.
        can_upload: APPLICANT_EDITABLE.includes(tenantRes.rows[0].status)
      }
    });
  } catch (error) {
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// The tenant lives on the request's database connection, and the connection is
// found through an AsyncLocalStorage store established by `dbContext`. Every
// other route reaches its first query directly from a middleware, so the store
// is plainly still there. This one does not: multer consumes the request stream
// first, and whether an async store survives that depends on the Node version
// underneath — which is not the same locally as it is on the deployment.
//
// When it does not survive, `db.query` finds no scope and quietly falls back to
// an unscoped pooled connection. That connection carries no `app.tenant_id`, so
// row-level security answers every read with nothing: the pharmacy's own row
// becomes invisible to it and the upload is refused as "Pharmacy not found"
// while the very same row is being served to the status page beside it. No
// error is raised, because from the database's point of view nothing went
// wrong — a query with no tenant returning no rows is the policy working.
//
// So the store is re-established rather than assumed. This is a no-op wherever
// it already survived, and it logs when it did not, because a scope going
// missing is worth knowing about rather than silently repairing.
const withRequestScope = (handler) => async (req, res) => {
  if (db.currentScope()) return handler(req, res);

  console.warn(
    'The request scope did not survive the file upload; re-establishing it for tenant',
    req.onboardingTenantId
  );

  return db.runInScope(async () => {
    const scope = db.currentScope();
    try {
      await db.setTenantScope({ tenantId: req.onboardingTenantId, platformAdmin: false });
      return await handler(req, res);
    } finally {
      // This scope is not the one `dbContext` will release on response close,
      // so it has to give its own connection back.
      await db.releaseScope(scope).catch(() => {});
    }
  });
};

const handleUpload = async (req, res) => {
  try {
    const { id } = req.params;
    const { document_type } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No file was received' });
    if (!REQUIRED_TYPES.includes(document_type)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `document_type must be one of: ${REQUIRED_TYPES.join(', ')}` });
    }

    // Paperwork may only be filed while the application is still the
    // applicant's to change. An approved pharmacy has a workspace and staff
    // accounts, and must not have its compliance record rewritten through a
    // link that predates them.
    const tenant = await db.query(
      'SELECT status FROM tenants WHERE tenant_id = $1 AND status = ANY($2)',
      [id, APPLICANT_EDITABLE]
    );
    if (tenant.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Pharmacy not found, or its application is already approved' });
    }

    // One current document per type. Filing a replacement supersedes what was
    // there rather than sitting alongside it — without this, a document the
    // reviewer rejected stays on the record for ever and readiness, which
    // refuses to activate while anything is rejected, could never be satisfied
    // no matter what the applicant sent afterwards.
    const superseded = await db.query(
      'DELETE FROM onboarding_documents WHERE tenant_id = $1 AND document_type = $2 RETURNING stored_path',
      [id, document_type]
    );

    const result = await db.query(
      `INSERT INTO onboarding_documents (tenant_id, document_type, file_name, stored_path, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, document_type, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
    );

    // Only after the row is safely replaced, and never the file just written.
    for (const row of superseded.rows) {
      if (row.stored_path && row.stored_path !== req.file.path) fs.unlink(row.stored_path, () => {});
    }

    // A declined application that receives fresh paperwork goes back into the
    // ControlHub queue. Otherwise the applicant does everything the decline
    // asked of them and nobody is ever told.
    let resubmitted = false;
    if (tenant.rows[0].status === 'REJECTED') {
      await db.query("UPDATE tenants SET status = 'UNDER_REVIEW' WHERE tenant_id = $1", [id]);
      resubmitted = true;
    }

    res.status(201).json({
      success: true,
      message: resubmitted ? 'Document uploaded and the application returned for review' : 'Document uploaded',
      data: { ...result.rows[0], returned_to_review: resubmitted }
    });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Exported so the repair can be tested directly: reproducing a lost scope
// through the HTTP layer is not possible, since the store is established by
// middleware that always runs.
exports.withRequestScope = withRequestScope;
exports.uploadDocument = withRequestScope(handleUpload);

// Streams the stored file back so a reviewer can actually read what they are
// being asked to verify.
exports.downloadDocument = async (req, res) => {
  try {
    const { documentId } = req.params;

    const result = await db.query(
      'SELECT file_name, stored_path, mime_type FROM onboarding_documents WHERE document_id = $1',
      [documentId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    if (!doc.stored_path || !fs.existsSync(doc.stored_path)) {
      return res.status(404).json({ error: 'No file was stored for this document' });
    }

    // Confine the read to the upload root: a stored_path is not a licence to
    // read anywhere on disk.
    const resolved = path.resolve(doc.stored_path);
    if (!resolved.startsWith(path.resolve(UPLOAD_ROOT))) {
      return res.status(400).json({ error: 'Refusing to serve a file outside the upload directory' });
    }

    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    // inline so a PDF opens in the reviewer's viewer rather than downloading.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.file_name)}"`);
    fs.createReadStream(resolved).pipe(res);
  } catch (error) {
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Compliance paperwork submitted with a pharmacy's application. Only platform
// staff read or judge these, so every handler here sits behind controlHubOnly.

exports.getDocuments = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT d.*, u.full_name AS reviewed_by_name
       FROM onboarding_documents d
       LEFT JOIN users u ON u.user_id = d.reviewed_by_id
       WHERE d.tenant_id = $1
       ORDER BY d.uploaded_at ASC`,
      [id]
    );
    res.json({ message: 'Documents retrieved', data: result.rows });
  } catch (error) {
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.reviewDocument = async (req, res) => {
  try {
    const { documentId } = req.params;
    const { status, review_notes } = req.body;
    const { userId } = req.user;

    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ error: 'Status must be VERIFIED or REJECTED' });
    }

    const result = await db.query(
      `UPDATE onboarding_documents
       SET status = $1, review_notes = $2, reviewed_by_id = $3, reviewed_at = NOW()
       WHERE document_id = $4
       RETURNING *`,
      [status, review_notes || null, userId, documentId]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
    res.json({ message: `Document ${status.toLowerCase()}`, data: result.rows[0] });
  } catch (error) {
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// What the onboarding screen shows an operator before they click approve. This
// is now the same computation the activation guard runs, so the figure shown
// and the figure enforced cannot disagree.
exports.getReadiness = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readinessFor(id);
    res.json({ message: 'Readiness retrieved', data });
  } catch (error) {
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
