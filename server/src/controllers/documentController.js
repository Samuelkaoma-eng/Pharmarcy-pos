const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../config/db');

// Uploaded paperwork lives outside the source tree so it is never served as
// static content and never committed.
const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

// Held in the service rather than here, because the activation guard enforces
// the same list and the two must never drift apart.
const { REQUIRED_TYPES, readinessFor } = require('../services/onboardingReadiness');

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

exports.uploadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { document_type } = req.body;

    if (!req.file) return res.status(400).json({ error: 'No file was received' });
    if (!REQUIRED_TYPES.includes(document_type)) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: `document_type must be one of: ${REQUIRED_TYPES.join(', ')}` });
    }

    const tenant = await db.query('SELECT 1 FROM tenants WHERE tenant_id = $1', [id]);
    if (tenant.rows.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Pharmacy not found' });
    }

    const result = await db.query(
      `INSERT INTO onboarding_documents (tenant_id, document_type, file_name, stored_path, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, document_type, req.file.originalname, req.file.path, req.file.mimetype, req.file.size]
    );

    res.status(201).json({ success: true, message: 'Document uploaded', data: result.rows[0] });
  } catch (error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

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
