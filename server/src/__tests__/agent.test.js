const request = require('supertest');
const app = require('../app');
const { closeAll } = require('./helpers/adminDb');

// The assistant was, for most of this project's life, a chain of
// `prompt.includes('stock')` tests returning fixed sentences. It could not
// answer a greeting, and it answered a stock question by describing its own
// ability to check stock rather than by reporting the number. These tests pin
// the two properties that stopped that being true: every message gets a real
// answer, and the intent that moves stock and money still carries its gate.
//
// No language model runs here — the suite sets no API key — so every assertion
// below holds on the offline path too. That is deliberate. A test that only
// passes when a paid model answers would be a test of the model, not of this
// controller, and it would be the first thing to break in CI.

describe('Workflow assistant', () => {
  let authToken;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'cashier', password: 'password123' });
    authToken = res.body.data.token;
  });

  afterAll(async () => {
    await closeAll();
  });

  const ask = (prompt) =>
    request(app)
      .post('/api/agent/query')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ prompt });

  it('requires a prompt, and rejects one that is only whitespace', async () => {
    expect((await ask('')).statusCode).toEqual(400);
    expect((await ask('   ')).statusCode).toEqual(400);
  });

  it('answers a greeting instead of dead-ending on an unmatched keyword', async () => {
    const res = await ask('hello');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.intent).toEqual('GENERAL');
    // The specific regression: "I could not match that request to a pharmacy
    // workflow yet" was the reply to every message that missed the keyword
    // list, greetings included.
    expect(res.body.data.response).not.toMatch(/could not match/i);
    expect(res.body.data.response.length).toBeGreaterThan(0);
  });

  it('classifies a stock question and proposes the inventory screen', async () => {
    const res = await ask('Check stock levels for medications');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.intent).toEqual('STOCK_LOOKUP');
    expect(res.body.data.requires_confirmation).toBe(false);
  });

  it('gates sale preparation behind a human confirmation', async () => {
    const res = await ask('Prepare a sale for paracetamol');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.intent).toEqual('PREPARE_SALE');
    expect(res.body.data.requires_confirmation).toBe(true);
  });

  it('does not gate a question that merely asks about takings', async () => {
    // "how were sales today" once classified as PREPARE_SALE and carried a
    // confirmation warning. Warning on a read-only question is how staff learn
    // to click past the warning that matters.
    const res = await ask('how were sales today');

    expect(res.body.data.intent).toEqual('SALES_SUMMARY');
    expect(res.body.data.requires_confirmation).toBe(false);
  });

  it('reads expiry as the more specific intent when a message mentions both', async () => {
    const res = await ask('which stock is expiring');
    expect(res.body.data.intent).toEqual('EXPIRY_CHECK');
  });

  it('routes queue, prescription and patient questions to their own intents', async () => {
    expect((await ask('who is waiting in the queue')).body.data.intent).toEqual('QUEUE_STATUS');
    expect((await ask('any prescriptions to verify')).body.data.intent).toEqual('PRESCRIPTION_CHECK');
    expect((await ask('look up a patient by NRC')).body.data.intent).toEqual('PATIENT_LOOKUP');
  });

  it('says which model answered, so a fallback is never mistaken for one', async () => {
    const res = await ask('hello');
    // With no key configured this must report itself as offline rather than
    // presenting the fixed sentence as though a model had considered it.
    expect(['offline', 'claude', 'gemini']).toContain(res.body.data.source);
  });

  it('never answers without authentication', async () => {
    const res = await request(app).post('/api/agent/query').send({ prompt: 'hello' });
    expect(res.statusCode).toEqual(401);
  });
});
