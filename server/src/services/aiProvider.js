const Anthropic = require('@anthropic-ai/sdk');
const { GoogleGenAI } = require('@google/genai');

// One place that talks to a language model, so no controller has to know which
// provider answered or what to do when none can.
//
// Claude is the primary and Gemini the fallback, matching the pattern proven in
// the sibling Smart Farmer project. The rule that matters is the same one the
// drug interaction check follows: when no provider can answer, this reports
// that it could not answer. It never returns an empty or invented result that a
// caller could mistake for a real one.

const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

const claudeKey = () => (process.env.ANTHROPIC_API_KEY || '').trim();
const geminiKey = () => (process.env.GEMINI_API_KEY || '').trim();

const claudeEnabled = () => claudeKey().length > 0;
const geminiEnabled = () => geminiKey().length > 0;

const isConfigured = () => claudeEnabled() || geminiEnabled();

const providers = () => {
  const names = [];
  if (claudeEnabled()) names.push(`claude (${CLAUDE_MODEL})`);
  if (geminiEnabled()) names.push(`gemini (${GEMINI_MODEL})`);
  return names;
};

const askClaude = async ({ system, prompt, maxTokens }) => {
  const client = new Anthropic({ apiKey: claudeKey() });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }]
  });

  // A safety classifier may decline. That is a successful HTTP call with an
  // empty body, so it has to be checked before the content is read.
  if (response.stop_reason === 'refusal') {
    throw new Error('The model declined to answer this request');
  }

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

  if (!text) throw new Error('The model returned no text');
  return text;
};

const askGemini = async ({ system, prompt, maxTokens }) => {
  const client = new GoogleGenAI({ apiKey: geminiKey() });

  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: system,
      maxOutputTokens: maxTokens
    }
  });

  const text = (response.text || '').trim();
  if (!text) throw new Error('The model returned no text');
  return text;
};

/**
 * Ask the configured model a question.
 *
 * Resolves to `{ available: true, provider, text }` on success, or
 * `{ available: false, reason }` when nothing could answer. It never throws and
 * never fabricates: a caller that receives `available: false` must say so
 * rather than presenting a guess as an answer.
 */
const ask = async ({ system, prompt, maxTokens = 1024 }) => {
  if (!isConfigured()) {
    return {
      available: false,
      reason: 'No language model is configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.'
    };
  }

  const failures = [];

  if (claudeEnabled()) {
    try {
      return { available: true, provider: 'claude', model: CLAUDE_MODEL, text: await askClaude({ system, prompt, maxTokens }) };
    } catch (err) {
      // Logged, not surfaced verbatim: an upstream error message can carry
      // request detail that does not belong in a pharmacy's UI.
      console.error('Claude request failed:', err.message);
      failures.push(`claude: ${err.message}`);
    }
  }

  if (geminiEnabled()) {
    try {
      return { available: true, provider: 'gemini', model: GEMINI_MODEL, text: await askGemini({ system, prompt, maxTokens }) };
    } catch (err) {
      console.error('Gemini request failed:', err.message);
      failures.push(`gemini: ${err.message}`);
    }
  }

  return {
    available: false,
    reason: 'Every configured language model failed to answer.',
    failures
  };
};

/**
 * As `ask`, but the model is instructed to answer with JSON and the reply is
 * parsed. A reply that does not parse is treated as no answer rather than
 * being passed along half-understood.
 */
const askJson = async ({ system, prompt, maxTokens = 1024 }) => {
  const result = await ask({
    system: `${system}\n\nReply with a single JSON object and nothing else. No prose, no markdown fences.`,
    prompt,
    maxTokens
  });

  if (!result.available) return result;

  // Models occasionally wrap JSON in a fenced block despite instructions.
  const cleaned = result.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

  try {
    return { ...result, data: JSON.parse(cleaned) };
  } catch {
    console.error('Model reply was not valid JSON:', cleaned.slice(0, 200));
    return { available: false, reason: 'The model did not return usable JSON.' };
  }
};

module.exports = { ask, askJson, isConfigured, providers, CLAUDE_MODEL, GEMINI_MODEL };
