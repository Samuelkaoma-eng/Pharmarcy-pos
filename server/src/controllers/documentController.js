const db = require('../config/db');

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

// A pharmacy should not be activated while paperwork is outstanding, so the
// onboarding screen can show readiness before anyone clicks approve.
exports.getReadiness = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'VERIFIED')::int AS verified,
         COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
         COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending
       FROM onboarding_documents WHERE tenant_id = $1`,
      [id]
    );

    const counts = result.rows[0];
    res.json({
      message: 'Readiness retrieved',
      data: {
        ...counts,
        ready_to_activate: counts.total > 0 && counts.verified === counts.total
      }
    });
  } catch (error) {
    console.error('Document controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
