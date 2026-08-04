const db = require('../config/db');
const ai = require('../services/aiProvider');
const { similarPresentations, presentationTrends } = require('../services/clinicalInsight');

// Clinical decision support, in the narrow sense the word support allows: it
// shows the clinician what this pharmacy has recorded before, and leaves the
// judgement to them. Nothing here diagnoses anyone.

exports.getStatus = (req, res) => {
  res.json({
    message: 'Insight service status',
    data: {
      language_model_configured: ai.isConfigured(),
      providers: ai.providers(),
      notice: ai.isConfigured()
        ? 'A language model is configured. It is used only to summarise records this system already holds.'
        : 'No language model is configured. Record lookup still works; only the plain-language summary is unavailable.'
    }
  });
};

// What was recorded before for presentations like this one.
exports.getSimilarPresentations = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { summarise } = req.query;

    if (!db.isDbAvailable()) return db.unavailable(res);

    const visit = await db.query(
      `SELECT v.visit_id, v.reason, v.assessment,
              vi.bp, vi.heart_rate, vi.temperature, vi.spo2
       FROM visits v
       LEFT JOIN LATERAL (
         SELECT bp, heart_rate, temperature, spo2 FROM vitals
         WHERE visit_id = v.visit_id ORDER BY created_at DESC LIMIT 1
       ) vi ON TRUE
       WHERE v.visit_id = $1 AND v.tenant_id = $2`,
      [id, tenantId]
    );
    if (visit.rows.length === 0) return res.status(404).json({ error: 'Visit not found' });

    const v = visit.rows[0];
    const result = await similarPresentations(tenantId, {
      vitals: { bp: v.bp, heart_rate: v.heart_rate, temperature: v.temperature, spo2: v.spo2 },
      reason: v.reason,
      excludeVisitId: v.visit_id
    });

    // The summary is optional and additive. It restates the records found; it
    // is never the source of them, and its absence does not change the answer.
    let summary = null;
    if (summarise === 'true' && result.sufficient && result.matches.length > 0) {
      const asked = await ai.ask({
        system:
          'You are summarising a pharmacy\'s own past clinical records for a clinician. ' +
          'Describe only what appears in the records given to you. Do not diagnose, do not ' +
          'recommend treatment, and do not add clinical knowledge of your own. If the records ' +
          'do not support a statement, do not make it. Two or three sentences.',
        prompt:
          `Current presentation: ${v.reason || 'not recorded'}.\n\n` +
          `Past records with a similar presentation at this pharmacy:\n` +
          result.matches
            .map(
              (m, i) =>
                `${i + 1}. Complaint: ${m.reason || 'not recorded'}. Assessed as: ${m.assessment}. ` +
                `Dispensed: ${m.dispensed.length ? m.dispensed.map((d) => `${d.product} x${d.quantity}`).join(', ') : 'nothing recorded'}.`
            )
            .join('\n'),
        maxTokens: 400
      });

      summary = asked.available
        ? { text: asked.text, provider: asked.provider }
        : { text: null, unavailable: asked.reason };
    }

    res.json({ message: 'Similar presentations retrieved', data: { ...result, summary } });
  } catch (error) {
    console.error('Insight controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// Complaints presenting unusually often lately.
exports.getTrends = async (req, res) => {
  try {
    const { tenantId } = req.user;
    if (!db.isDbAvailable()) return db.unavailable(res);

    const result = await presentationTrends(tenantId, {
      windowDays: parseInt(req.query.days, 10) || 14
    });

    res.json({ message: result.message, data: result });
  } catch (error) {
    console.error('Insight controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
