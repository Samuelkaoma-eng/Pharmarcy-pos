const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

// The insight service answers "what has this pharmacy recorded before for
// presentations like this". These tests pin the properties that keep it from
// becoming something it must not be: a diagnosis, a claim made from too little
// history, or a window into another pharmacy's records.
describe('Clinical insight', () => {
  let pharmacistToken;
  let cashierToken;
  let riversideAdminToken;
  let adminToken;
  let doctorToken;

  beforeAll(async () => {
    pharmacistToken = await login('pharmacist');
    cashierToken = await login('cashier');
    adminToken = await login('admin', SEED.centralTenantId);
    doctorToken = await login('doctor');
    riversideAdminToken = await login('admin', SEED.riversideTenantId);
  });

  afterAll(async () => {
    await pool.end();
  });

  // Walk a patient through the clinic so there is a completed visit with a
  // recorded assessment to compare against.
  const completeVisit = async (reason, assessment, vitals) => {
    const visit = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ customerId: SEED.patientChipego, reason });
    const visitId = visit.body.data.visit_id;

    await request(app)
      .post(`/api/visits/${visitId}/vitals`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send(vitals);

    await request(app)
      .patch(`/api/visits/${visitId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ doctorId: SEED.doctorPhiri });

    await request(app)
      .patch(`/api/visits/${visitId}/assessment`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ assessment });

    return visitId;
  };

  describe('Status', () => {
    it('reports plainly whether a language model is configured', async () => {
      const res = await request(app)
        .get('/api/insight/status')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);
      expect(typeof res.body.data.language_model_configured).toBe('boolean');
      expect(res.body.data.notice).toBeTruthy();
    });
  });

  describe('Similar presentations', () => {
    it('refuses to generalise from too little history', async () => {
      // Riverside has no clinical history at all, so the honest answer is that
      // there is not enough to compare against — not an empty match list that
      // reads as "nothing similar found".
      const visit = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({ customerId: SEED.riversidePatient, reason: 'Cough' });

      const res = await request(app)
        .get(`/api/insight/visits/${visit.body.data.visit_id}/similar`)
        .set('Authorization', `Bearer ${riversideAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.sufficient).toBe(false);
      expect(res.body.data.message).toMatch(/too few/i);
      expect(res.body.data.matches).toEqual([]);
    });

    it('finds past visits with a comparable presentation once there is history', async () => {
      const vitals = { bp: '126/82', heartRate: '88', temperature: '38.1', spo2: '96%' };

      for (let i = 0; i < 6; i += 1) {
        await completeVisit('Persistent cough and fever', 'Upper respiratory tract infection', vitals);
      }

      const current = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Persistent cough and fever' });
      const visitId = current.body.data.visit_id;

      await request(app)
        .post(`/api/visits/${visitId}/vitals`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send(vitals);

      const res = await request(app)
        .get(`/api/insight/visits/${visitId}/similar`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.sufficient).toBe(true);
      expect(res.body.data.matches.length).toBeGreaterThan(0);
      expect(res.body.data.matches[0].assessment).toMatch(/respiratory/i);
      // Every match must say how much of it was actually comparable.
      expect(res.body.data.matches[0].compared_on).toBeTruthy();
    });

    it('always states that it is not a diagnosis', async () => {
      const current = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Persistent cough and fever' });

      const res = await request(app)
        .get(`/api/insight/visits/${current.body.data.visit_id}/similar`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.body.data.disclaimer).toMatch(/not a diagnosis/i);
    });

    it('does not read another pharmacy\'s visit', async () => {
      const visit = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Cough' });

      const res = await request(app)
        .get(`/api/insight/visits/${visit.body.data.visit_id}/similar`)
        .set('Authorization', `Bearer ${riversideAdminToken}`);

      expect(res.statusCode).toEqual(404);
    });

    it('is not open to a cashier', async () => {
      const visit = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Cough' });

      const res = await request(app)
        .get(`/api/insight/visits/${visit.body.data.visit_id}/similar`)
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('Presentation trends', () => {
    it('reports trending complaints with the counts behind them', async () => {
      const res = await request(app)
        .get('/api/insight/trends')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);
      expect(Array.isArray(res.body.data.signals)).toBe(true);
      // A signal must carry the numbers it was derived from, so a pharmacist
      // can judge it rather than take it on trust.
      for (const signal of res.body.data.signals) {
        expect(signal.recent_cases).toBeGreaterThan(0);
        expect(signal).toHaveProperty('expected_from_baseline');
      }
      expect(res.body.data.disclaimer).toMatch(/not evidence of an outbreak/i);
    });
  });
});
