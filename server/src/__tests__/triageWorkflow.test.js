const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

// The clinic flow: reception registers an arrival, triage takes vitals, a
// doctor is assigned and writes up the consultation, the patient goes to the
// counter, and the sale closes the visit. Each station is staffed by whoever
// is entitled to it, and the visit cannot skip ahead.
describe('Triage as a clinic workflow', () => {
  let adminToken;
  let pharmacistToken;
  let cashierToken;
  let doctorToken;
  let riversideAdminToken;

  beforeAll(async () => {
    adminToken = await login('admin', SEED.centralTenantId);
    pharmacistToken = await login('pharmacist');
    cashierToken = await login('cashier');
    doctorToken = await login('doctor');
    riversideAdminToken = await login('admin', SEED.riversideTenantId);
  });

  afterAll(async () => {
    await pool.end();
  });

  const openVisit = async (reason = 'Automated test visit') => {
    const res = await request(app)
      .post('/api/visits')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ customerId: SEED.patientChipego, reason });
    return res.body.data.visit_id;
  };

  const statusOf = async (visitId) => {
    const res = await pool.query('SELECT status FROM visits WHERE visit_id = $1', [visitId]);
    return res.rows[0].status;
  };

  describe('Reception', () => {
    it('registers an arrival as WAITING with a queue number', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Headache' });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.status).toEqual('WAITING');
      expect(res.body.data.queue_number).toBeGreaterThan(0);
    });
  });

  // The queue screen has to be able to show who is routable and what has
  // already been measured. Both were missing from the API, which is why the
  // screen invented one and mis-reported the other (DEF-045, DEF-046).
  describe('What the queue screen needs', () => {
    it('lists the pharmacy prescribers and says which can be routed to', async () => {
      const res = await request(app)
        .get('/api/doctors')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);

      const phiri = res.body.data.find((d) => d.doctor_id === SEED.doctorPhiri);
      const banda = res.body.data.find((d) => d.doctor_id === SEED.doctorBanda);

      // Dr Phiri holds an account here; Dr Banda is a referring paediatrician
      // with no login, so a patient cannot be routed to them.
      expect(phiri.has_account).toBe(true);
      expect(banda.has_account).toBe(false);
    });

    it('keeps one pharmacy prescribers out of another pharmacy list', async () => {
      const res = await request(app)
        .get('/api/doctors')
        .set('Authorization', `Bearer ${riversideAdminToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.map((d) => d.doctor_id)).not.toContain(SEED.doctorPhiri);
    });

    it('carries the latest vitals on the queue row once they are taken', async () => {
      const visitId = await openVisit('Queue vitals check');

      const before = await request(app)
        .get('/api/visits/queue')
        .set('Authorization', `Bearer ${pharmacistToken}`);
      expect(before.body.data.find((v) => v.visit_id === visitId).latest_vitals).toBeNull();

      await request(app)
        .post(`/api/visits/${visitId}/vitals`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ bp: '118/76', heartRate: '66', temperature: '36.8', spo2: '99', weight: '61' });

      const after = await request(app)
        .get('/api/visits/queue')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      const row = after.body.data.find((v) => v.visit_id === visitId);
      // Without this the screen cannot tell a triaged patient from an
      // untouched one, and reports every visit as awaiting vitals.
      expect(row.latest_vitals).not.toBeNull();
      expect(row.latest_vitals.bp).toEqual('118/76');
      expect(row.vitals_count).toEqual(1);
    });
  });

  describe('Triage', () => {
    it('moves a waiting visit into TRIAGE when vitals are recorded', async () => {
      const visitId = await openVisit();
      expect(await statusOf(visitId)).toEqual('WAITING');

      const res = await request(app)
        .post(`/api/visits/${visitId}/vitals`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ bp: '128/84', heartRate: '78', temperature: '37.4', spo2: '97%', weight: '70kg' });

      expect(res.statusCode).toEqual(200);
      // Recording vitals IS the triage step — it must not need a separate
      // status update that someone can forget.
      expect(await statusOf(visitId)).toEqual('TRIAGE');
    });

    it('does not let a cashier take vitals', async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .post(`/api/visits/${visitId}/vitals`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ bp: '120/80' });

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('Assignment', () => {
    it('routes a patient to a prescriber who works here', async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .patch(`/api/visits/${visitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ doctorId: SEED.doctorPhiri });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toEqual('IN_PROGRESS');
    });

    it('refuses to route a patient to a doctor with no account here', async () => {
      const visitId = await openVisit();

      // Dr. Banda is a referring paediatrician: her prescriptions are honoured
      // but she has no login, so nothing can be routed to her.
      const res = await request(app)
        .patch(`/api/visits/${visitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ doctorId: SEED.doctorBanda });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/no account/i);
    });

    it('does not let a cashier assign a doctor', async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .patch(`/api/visits/${visitId}/assign`)
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ doctorId: SEED.doctorPhiri });

      expect(res.statusCode).toEqual(403);
    });
  });

  describe("A doctor's own queue", () => {
    it('shows a doctor only their own patients', async () => {
      const visitId = await openVisit();
      await request(app)
        .patch(`/api/visits/${visitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ doctorId: SEED.doctorPhiri });

      const res = await request(app)
        .get('/api/visits/queue?mine=true')
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.statusCode).toEqual(200);
      expect(res.body.scoped_to_me).toBe(true);
      expect(res.body.data.every((v) => v.doctor_id === SEED.doctorPhiri)).toBe(true);
      expect(res.body.data.some((v) => v.visit_id === visitId)).toBe(true);
    });

    it('refuses a personal queue to someone who is not a prescriber', async () => {
      const res = await request(app)
        .get('/api/visits/queue?mine=true')
        .set('Authorization', `Bearer ${cashierToken}`);

      expect(res.statusCode).toEqual(403);
    });
  });

  describe('Consultation and hand-off', () => {
    it('records the assessment and sends the patient to the counter', async () => {
      const visitId = await openVisit();
      await request(app)
        .patch(`/api/visits/${visitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ doctorId: SEED.doctorPhiri });

      const res = await request(app)
        .patch(`/api/visits/${visitId}/assessment`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ assessment: 'Tension headache, advise rest and analgesia' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.status).toEqual('DISPENSING');
      expect(res.body.data.assessment).toMatch(/Tension headache/);
    });

    it('cannot assess a visit nobody has been assigned to', async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .patch(`/api/visits/${visitId}/assessment`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ assessment: 'Should not be possible' });

      expect(res.statusCode).toEqual(409);
    });
  });

  describe('The visit cannot skip ahead', () => {
    it('refuses to send a freshly arrived patient straight to the counter', async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .patch(`/api/visits/${visitId}/status`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ status: 'DISPENSING' });

      expect(res.statusCode).toEqual(409);
      expect(await statusOf(visitId)).toEqual('WAITING');
    });

    it('does not reopen a cancelled visit', async () => {
      const visitId = await openVisit();
      await request(app)
        .patch(`/api/visits/${visitId}/status`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ status: 'CANCELLED' });

      const res = await request(app)
        .patch(`/api/visits/${visitId}/status`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.statusCode).toEqual(409);
    });

    it('refuses a status it does not recognise', async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .patch(`/api/visits/${visitId}/status`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ status: 'HAVING_A_THINK' });

      expect(res.statusCode).toEqual(400);
    });
  });

  describe('Tenant isolation', () => {
    it("does not report a status change on another pharmacy's visit", async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .patch(`/api/visits/${visitId}/status`)
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.statusCode).toEqual(404);
      expect(await statusOf(visitId)).not.toEqual('CANCELLED');
    });

    it("does not open a visit for another pharmacy's patient", async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Should not be possible' });

      expect(res.statusCode).toEqual(404);
    });
  });

  describe('The sale closes the loop', () => {
    it('records the visit on the sale so walk-in to till is traceable', async () => {
      const visitId = await openVisit();
      await request(app)
        .patch(`/api/visits/${visitId}/assign`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ doctorId: SEED.doctorPhiri });
      await request(app)
        .patch(`/api/visits/${visitId}/assessment`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ assessment: 'Mild analgesia' });

      const sale = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          paymentType: 'cash',
          customerId: SEED.patientChipego,
          visitId,
          items: [{ productId: SEED.paracetamol, quantity: 1 }]
        });

      expect(sale.statusCode).toEqual(201);

      const stored = await pool.query('SELECT visit_id FROM sales WHERE sale_id = $1', [sale.body.data.sale_id]);
      expect(stored.rows[0].visit_id).toEqual(visitId);
    });

    it("refuses a sale naming another pharmacy's visit", async () => {
      const visitId = await openVisit();

      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({
          paymentType: 'cash',
          visitId,
          items: [{ productId: SEED.riversideProduct, quantity: 1 }]
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toMatch(/Visit not found/i);
    });
  });
});
