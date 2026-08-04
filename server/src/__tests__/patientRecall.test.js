const request = require('supertest');
const app = require('../app');
const { closeAll } = require('./helpers/adminDb');
const { SEED, login } = require('./helpers/login');

// Recall keeps a real list of patients due back. The reminders are simulated,
// and these tests pin the properties that keep the simulation from being
// mistaken for a message anyone actually received.
describe('Patient recall and simulated reminders', () => {
  let pharmacistToken;
  let cashierToken;
  let riversideAdminToken;

  beforeAll(async () => {
    pharmacistToken = await login('pharmacist');
    cashierToken = await login('cashier');
    riversideAdminToken = await login('admin', SEED.riversideTenantId);
  });

  afterAll(async () => {
    await closeAll();
  });

  const schedule = async (overrides = {}) => {
    const res = await request(app)
      .post('/api/recalls')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        customerId: SEED.patientChipego,
        reason: 'blood pressure review',
        dueDate: '2026-09-01',
        ...overrides
      });
    return res;
  };

  describe('Status', () => {
    it('states plainly that nothing is sent and no gateway exists', async () => {
      const res = await request(app)
        .get('/api/recalls/status')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.simulated).toBe(true);
      expect(res.body.data.gateway_configured).toBe(false);
      expect(res.body.data.notice).toMatch(/No message was sent/i);
    });
  });

  describe('Scheduling', () => {
    it('schedules a recall for a patient', async () => {
      const res = await schedule();

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.status).toEqual('SCHEDULED');
      expect(res.body.data.reason).toMatch(/blood pressure/);
      // Nothing is composed until someone asks for it.
      expect(res.body.data.simulated_message_ref).toBeNull();
    });

    it('will not schedule for another pharmacy\'s patient', async () => {
      const res = await request(app)
        .post('/api/recalls')
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'review', dueDate: '2026-09-01' });

      expect(res.statusCode).toEqual(404);
    });

    it('is not open to a cashier', async () => {
      const res = await request(app)
        .post('/api/recalls')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'review', dueDate: '2026-09-01' });

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('The simulated reminder', () => {
    it('composes a marked reminder without sending anything', async () => {
      const created = await schedule({ reason: 'diabetes check' });

      const res = await request(app)
        .post(`/api/recalls/${created.body.data.recall_id}/remind`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(201);
      // Every artefact is marked, the way SIMFIS marks its own.
      expect(res.body.data.reference).toMatch(/^SIMSMS-/);
      expect(res.body.data.simulated).toBe(true);
      expect(res.body.data.notice).toMatch(/not a registered sender/i);
      expect(res.body.message).toMatch(/nothing was sent/i);
      // The body is a recognisable reminder, so what is being simulated is clear.
      expect(res.body.data.body).toMatch(/diabetes check/);
      expect(res.body.data.body).toMatch(/Central Care/);
      expect(res.body.data.recall.status).toEqual('REMINDED');
    });

    it('does not compose the same reminder twice', async () => {
      const created = await schedule();
      const id = created.body.data.recall_id;

      await request(app)
        .post(`/api/recalls/${id}/remind`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      const again = await request(app)
        .post(`/api/recalls/${id}/remind`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(again.statusCode).toEqual(409);
    });

    it('refuses when the patient has no number, rather than pretending', async () => {
      // A patient with no phone could not be reached by a real campaign, so
      // the simulation must fail the same way instead of reporting success.
      const patient = await request(app)
        .post('/api/patients')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ name: 'No Phone Patient' });

      const created = await schedule({ customerId: patient.body.data.customer_id });

      const res = await request(app)
        .post(`/api/recalls/${created.body.data.recall_id}/remind`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/no phone number/i);
    });

    it('does not compose a reminder for another pharmacy\'s recall', async () => {
      const created = await schedule();

      const res = await request(app)
        .post(`/api/recalls/${created.body.data.recall_id}/remind`)
        .set('Authorization', `Bearer ${riversideAdminToken}`);

      expect(res.statusCode).toEqual(404);
    });
  });

  describe('The list', () => {
    it('flags an overdue recall', async () => {
      await schedule({ reason: 'overdue follow-up', dueDate: '2020-01-01' });

      const res = await request(app)
        .get('/api/recalls')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);
      const overdue = res.body.data.find((r) => r.reason === 'overdue follow-up');
      expect(overdue.overdue).toBe(true);
    });

    it('does not show another pharmacy\'s recalls', async () => {
      await schedule({ reason: 'central only' });

      const res = await request(app)
        .get('/api/recalls')
        .set('Authorization', `Bearer ${riversideAdminToken}`);

      expect(res.body.data.every((r) => r.reason !== 'central only')).toBe(true);
    });
  });
});
