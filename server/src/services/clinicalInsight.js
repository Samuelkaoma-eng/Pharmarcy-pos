const db = require('../config/db');

// Case-based lookup over the pharmacy's own clinical history.
//
// What this does: given the vitals and complaint recorded for a patient now, it
// finds past visits at the same pharmacy whose vitals and complaint were
// similar, and reports what was assessed and dispensed then.
//
// What this is NOT: a diagnosis. Nothing here computes what is wrong with
// anyone. It answers "what has been recorded before for presentations like
// this", which is a question about the record, not about the patient. Every
// response carries the number of past cases it drew on, because an answer from
// three records and an answer from three hundred deserve different weight — and
// with a small history the honest answer is that there is not enough to say.
//
// Scoped to one pharmacy. One clinic's history is not another's to read.

// The scale each vital is compared on, so a heart rate 20 bpm away and a
// temperature 20°C away are not treated as equally distant.
const VITAL_SCALES = {
  systolic: 25,
  diastolic: 15,
  heartRate: 20,
  temperature: 1.5,
  spo2: 4
};

// Enough history for a comparison to mean anything. Below this the service
// says so rather than generalising from a handful of visits.
const MIN_HISTORY = 5;

const num = (value) => {
  if (value === null || value === undefined) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
};

// "128/84" -> { systolic: 128, diastolic: 84 }
const parseBp = (bp) => {
  if (!bp) return { systolic: null, diastolic: null };
  const parts = String(bp).split('/');
  return { systolic: num(parts[0]), diastolic: num(parts[1]) };
};

const normalise = (vitals = {}) => {
  const { systolic, diastolic } = parseBp(vitals.bp);
  return {
    systolic,
    diastolic,
    heartRate: num(vitals.heart_rate ?? vitals.heartRate),
    temperature: num(vitals.temperature),
    spo2: num(vitals.spo2)
  };
};

const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'has', 'had', 'was', 'been', 'complains', 'of',
  'patient', 'a', 'an', 'to', 'in', 'on', 'is', 'mild', 'severe'
]);

const keywords = (text) =>
  new Set(
    String(text || '')
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  );

// Overlap of two keyword sets, 0 to 1.
const overlap = (a, b) => {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
};

// 0 to 1, where 1 is an exact match on everything that could be compared.
// Vitals that were not recorded on either side are skipped rather than counted
// as a mismatch — a missing measurement is not a difference.
const similarity = (now, past, nowWords, pastWords) => {
  let total = 0;
  let compared = 0;

  for (const [field, scale] of Object.entries(VITAL_SCALES)) {
    if (now[field] === null || past[field] === null) continue;
    const distance = Math.abs(now[field] - past[field]) / scale;
    total += Math.max(0, 1 - distance);
    compared += 1;
  }

  const vitalScore = compared > 0 ? total / compared : null;
  const wordScore = overlap(nowWords, pastWords);

  // Where both signals exist the complaint carries a little more weight than
  // the numbers: two people with the same blood pressure and different
  // complaints are not similar cases.
  if (vitalScore === null) return { score: wordScore, compared, basis: 'complaint only' };
  if (nowWords.size === 0) return { score: vitalScore, compared, basis: 'vitals only' };
  return { score: vitalScore * 0.45 + wordScore * 0.55, compared, basis: 'vitals and complaint' };
};

/**
 * Past visits whose recorded presentation resembles the one described.
 * Returns what was assessed and what was dispensed, with counts.
 */
const similarPresentations = async (tenantId, { vitals = {}, reason = '', excludeVisitId = null, limit = 5 } = {}) => {
  const history = await db.query(
    `SELECT v.visit_id, v.reason, v.assessment, v.date,
            vi.bp, vi.heart_rate, vi.temperature, vi.spo2
     FROM visits v
     LEFT JOIN LATERAL (
       SELECT bp, heart_rate, temperature, spo2
       FROM vitals
       WHERE visit_id = v.visit_id
       ORDER BY created_at DESC
       LIMIT 1
     ) vi ON TRUE
     WHERE v.tenant_id = $1
       AND v.assessment IS NOT NULL
       AND v.status IN ('DISPENSING','COMPLETED')
       AND ($2::uuid IS NULL OR v.visit_id <> $2::uuid)`,
    [tenantId, excludeVisitId]
  );

  if (history.rows.length < MIN_HISTORY) {
    return {
      sufficient: false,
      history_size: history.rows.length,
      minimum: MIN_HISTORY,
      message: `Only ${history.rows.length} past visit(s) carry a recorded assessment. That is too few to compare against; this pharmacy needs at least ${MIN_HISTORY}.`,
      matches: []
    };
  }

  const now = normalise(vitals);
  const nowWords = keywords(reason);

  const scored = history.rows
    .map((row) => {
      const { score, compared, basis } = similarity(
        now,
        normalise({ bp: row.bp, heart_rate: row.heart_rate, temperature: row.temperature, spo2: row.spo2 }),
        nowWords,
        keywords(row.reason)
      );
      return { row, score, compared, basis };
    })
    // Below this the "match" is noise, and presenting noise as a comparable
    // case is worse than returning nothing.
    .filter((m) => m.score > 0.35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // What was actually dispensed on those visits, so the answer is grounded in
  // the record rather than in what the model believes is usual.
  const visitIds = scored.map((m) => m.row.visit_id);
  let dispensed = [];
  if (visitIds.length > 0) {
    const res = await db.query(
      `SELECT v.visit_id, p.name AS product_name, SUM(si.quantity)::int AS quantity
       FROM visits v
       JOIN sales s ON s.visit_id = v.visit_id
       JOIN sale_items si ON si.sale_id = s.sale_id
       JOIN products p ON p.product_id = si.product_id
       WHERE v.visit_id = ANY($1::uuid[]) AND v.tenant_id = $2
       GROUP BY v.visit_id, p.name`,
      [visitIds, tenantId]
    );
    dispensed = res.rows;
  }

  return {
    sufficient: true,
    history_size: history.rows.length,
    matches: scored.map((m) => ({
      visit_id: m.row.visit_id,
      date: m.row.date,
      reason: m.row.reason,
      assessment: m.row.assessment,
      similarity: Number(m.score.toFixed(2)),
      compared_on: m.basis,
      vitals_compared: m.compared,
      dispensed: dispensed
        .filter((d) => d.visit_id === m.row.visit_id)
        .map((d) => ({ product: d.product_name, quantity: d.quantity }))
    })),
    disclaimer:
      'These are past records from this pharmacy whose recorded presentation resembled this one. They describe what was assessed and dispensed before. They are not a diagnosis and carry no clinical authority.'
  };
};

/**
 * A surveillance signal: complaints seen unusually often in the recent window
 * compared with the weeks before it. Deliberately arithmetic, not a model —
 * a spike in recorded complaints is a counting question.
 */
const presentationTrends = async (tenantId, { windowDays = 14, minimumCases = 3 } = {}) => {
  const res = await db.query(
    `SELECT v.reason, v.assessment,
            COUNT(*) FILTER (WHERE v.date >= CURRENT_DATE - ($2::int || ' days')::interval)::int AS recent,
            COUNT(*) FILTER (WHERE v.date <  CURRENT_DATE - ($2::int || ' days')::interval
                              AND v.date >= CURRENT_DATE - ($3::int || ' days')::interval)::int AS baseline
     FROM visits v
     WHERE v.tenant_id = $1
       AND v.date >= CURRENT_DATE - ($3::int || ' days')::interval
     GROUP BY v.reason, v.assessment`,
    [tenantId, windowDays, windowDays * 4]
  );

  // Group by complaint keyword rather than exact free text, since "persistent
  // cough" and "cough and fever" are the same signal to a public health eye.
  const buckets = new Map();
  for (const row of res.rows) {
    for (const word of keywords(`${row.reason || ''} ${row.assessment || ''}`)) {
      const bucket = buckets.get(word) || { term: word, recent: 0, baseline: 0 };
      bucket.recent += row.recent;
      bucket.baseline += row.baseline;
      buckets.set(word, bucket);
    }
  }

  const signals = [...buckets.values()]
    .filter((b) => b.recent >= minimumCases)
    .map((b) => {
      // The baseline covers three windows to the recent one's single window,
      // so it is averaged before comparison.
      const expected = b.baseline / 3;
      return {
        term: b.term,
        recent_cases: b.recent,
        expected_from_baseline: Number(expected.toFixed(1)),
        ratio: expected > 0 ? Number((b.recent / expected).toFixed(2)) : null
      };
    })
    .filter((b) => b.ratio === null || b.ratio >= 2)
    .sort((a, b) => (b.ratio || 99) - (a.ratio || 99));

  return {
    window_days: windowDays,
    signals,
    message: signals.length === 0
      ? 'No complaint is presenting unusually often compared with the preceding weeks.'
      : `${signals.length} complaint term(s) are presenting at least twice as often as the preceding weeks.`,
    disclaimer:
      'This counts words recorded on visits at this pharmacy. It is a prompt to look, not evidence of an outbreak, and it says nothing about causation.'
  };
};

module.exports = { similarPresentations, presentationTrends, MIN_HISTORY };
