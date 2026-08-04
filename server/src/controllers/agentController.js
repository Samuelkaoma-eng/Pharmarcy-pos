const ai = require('../services/aiProvider');

const SYSTEM_PROMPT = [
  'You are the pharmacy workflow assistant for PharmaPOS, a point-of-sale',
  'system used by pharmacies in Zambia. You help staff with stock questions,',
  'drug expiry checks, patient lookup, prescription status, triage queue',
  'status, sale preparation, and general pharmacy workflow guidance.',
  '',
  'Be helpful, concise, and professional. When greeted, respond naturally.',
  'When asked about pharmacy operations, give actionable guidance. Never',
  'invent stock levels, patient data, or prescription details — direct the',
  'user to check the relevant section of the system.',
  '',
  'Keep responses under 3 sentences unless the question needs more detail.'
].join('\n');

exports.query = async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const p = prompt.toLowerCase();
    let result = null;

    if (p.includes('stock') || p.includes('how many') || p.includes('inventory')) {
      result = {
        intent: 'STOCK_LOOKUP',
        confidence: 0.88,
        response: 'I can check stock levels, reorder thresholds, and expiring batches for the selected medication.',
        proposed_action: 'Open inventory and filter matching products',
        requires_confirmation: false
      };
    } else if (p.includes('expire') || p.includes('expiry')) {
      result = {
        intent: 'EXPIRY_CHECK',
        confidence: 0.86,
        response: 'I can review batches expiring within the configured alert window and surface stock that should be quarantined or discounted.',
        proposed_action: 'Open expiring-batches view',
        requires_confirmation: false
      };
    } else if (p.includes('sale') || p.includes('sell')) {
      result = {
        intent: 'PREPARE_SALE',
        confidence: 0.8,
        response: 'I can prepare a checkout draft, but the cashier must confirm product, quantity, prescription, and payment before stock is reduced.',
        proposed_action: 'Create checkout draft',
        requires_confirmation: true
      };
    } else if (p.includes('patient') || p.includes('customer')) {
      result = {
        intent: 'PATIENT_LOOKUP',
        confidence: 0.82,
        response: 'I can search patient records by name, NRC, or phone number and show the latest visits and prescriptions.',
        proposed_action: 'Open patient search',
        requires_confirmation: false
      };
    } else if (p.includes('prescription')) {
      result = {
        intent: 'PRESCRIPTION_CHECK',
        confidence: 0.84,
        response: 'I can inspect prescription status, verify whether the medication requires pharmacist review, and flag expired orders.',
        proposed_action: 'Open prescription queue',
        requires_confirmation: false
      };
    } else if (p.includes('queue') || p.includes('waiting')) {
      result = {
        intent: 'QUEUE_STATUS',
        confidence: 0.82,
        response: 'I can show waiting patients, triage status, and which visits still need vitals or doctor assignment.',
        proposed_action: 'Open triage queue',
        requires_confirmation: false
      };
    }

    if (result) {
      return res.json({
        message: 'Query processed',
        data: { ...result, original_prompt: prompt }
      });
    }

    const aiResult = await ai.ask({
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 512
    });

    if (aiResult.available) {
      return res.json({
        message: 'Query processed',
        data: {
          intent: 'AI_RESPONSE',
          confidence: 0.9,
          response: aiResult.text,
          proposed_action: null,
          requires_confirmation: false,
          original_prompt: prompt
        }
      });
    }

    res.json({
      message: 'Query processed',
      data: {
        intent: 'UNKNOWN',
        confidence: 0.35,
        response: 'I can help with stock checks, expiry reviews, patient lookup, prescription status, queue status, and sale preparation. Try asking about one of those topics.',
        proposed_action: null,
        requires_confirmation: false,
        original_prompt: prompt
      }
    });
  } catch (error) {
    console.error('Agent controller error:', error.message);
    res.status(500).json({ error: 'Server error' });
  }
};
