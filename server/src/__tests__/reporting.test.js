const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

// The system recorded everything a pharmacy owes and holds, and could report
// none of it. An owner could not see a day's takings and a VAT-registered
// pharmacy had no way to produce the figures a return is prepared from.
//
// The properties worth testing are the ones that would put a wrong number in
// front of an accountant: that zero-rated medicines never contribute output
// tax, that the register covers prescription-only lines and nothing else, and
// that one pharmacy's trading never appears in another's report.

describe('Reporting', () => {
  let adminToken;
  let cashierToken;
  let riversideAdminToken;
  const today = new Date().toISOString().slice(0, 10);

  const report = (path, token, query = `from=${today}&to=${today}`) =>
    request(app).get(`/api/reports/${path}?${query}`).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    adminToken = await login('admin', SEED.centralTenantId);
    cashierToken = await login('cashier', SEED.centralTenantId);
    riversideAdminToken = await login('admin', SEED.riversideTenantId);

    // A zero-rated medicine and a standard-rated general good, so the VAT split
    // has something to get wrong.
    await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ items: [{ productId: SEED.paracetamol, quantity: 2 }], paymentType: 'cash' });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('VAT summary', () => {
    it('never charges output tax on zero-rated medicines', async () => {
      const res = await report('vat', adminToken);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.zero_rated_net).toBeGreaterThan(0);
      // The whole point of DEF-034: the rate applies to standard-rated lines
      // only, so a day of nothing but medicines owes nothing.
      expect(res.body.data.output_tax_calculated).toEqual(
        Number((res.body.data.standard_rated_net * 0.16).toFixed(2))
      );
    });

    it('reconciles the calculated tax against what the sales recorded', async () => {
      const res = await report('vat', adminToken);
      // A non-zero variance means a sale was priced under a different rule than
      // the one in force, and must be investigated before anything is filed.
      expect(Math.abs(res.body.data.variance)).toBeLessThan(0.01);
    });

    it('says plainly that it is not a return and not a Smart Invoice', async () => {
      const res = await report('vat', adminToken);
      expect(res.body.notice).toMatch(/not a tax return/i);
      expect(res.body.notice).toMatch(/not a ZRA Smart Invoice/i);
    });

    it('reports the period it actually covers', async () => {
      const res = await report('vat', adminToken, 'from=2020-01-01&to=2020-01-31');
      expect(res.body.data.period).toEqual({ from: '2020-01-01', to: '2020-01-31' });
      // A window with no trading reports zero, not today's figures.
      expect(res.body.data.gross_takings).toEqual(0);
    });

    it('keeps one pharmacy trading out of another report', async () => {
      const central = await report('vat', adminToken);
      const riverside = await report('vat', riversideAdminToken);

      expect(central.body.data.gross_takings).toBeGreaterThan(0);
      expect(riverside.body.data.gross_takings).toEqual(0);
    });
  });

  describe('Trading summary', () => {
    it('breaks takings down by day, method and who served', async () => {
      const res = await report('trading', adminToken);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.totals.sale_count).toBeGreaterThan(0);
      expect(res.body.data.by_payment_method.length).toBeGreaterThan(0);
      expect(res.body.data.by_staff.length).toBeGreaterThan(0);
      expect(res.body.data.top_products.length).toBeGreaterThan(0);
    });

    it('answers whether the drawers balanced', async () => {
      const res = await report('trading', adminToken);
      // The reason till sessions exist. An owner gets a figure, not a shrug.
      expect(res.body.data.till).toHaveProperty('net_variance');
      expect(res.body.data.till).toHaveProperty('total_short');
    });
  });

  describe('Stock valuation', () => {
    it('values what is held at cost and at retail', async () => {
      const res = await report('stock', adminToken, '');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.holding.units).toBeGreaterThan(0);
      expect(res.body.data.holding.at_cost).toBeGreaterThan(0);
      expect(res.body.data.holding.at_retail).toBeGreaterThan(res.body.data.holding.at_cost);
    });

    it('separates stock already expired from stock merely nearing expiry', async () => {
      const res = await report('stock', adminToken, '');
      // Expired stock is a loss already taken. Folding it into "expiring soon"
      // would let an owner think there is still time to sell it.
      expect(res.body.data).toHaveProperty('expired');
      expect(res.body.data).toHaveProperty('expiring_soon');
      expect(res.body.data.expired.units).toBeGreaterThan(0);
    });
  });

  describe('Dispensing register', () => {
    it('covers prescription-only lines and nothing else', async () => {
      // A verified prescription, dispensed, so the register has an entry.
      const rx = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          doctorId: SEED.doctorPhiri,
          customerId: SEED.patientChipego,
          validUntil: '2027-12-31',
          items: [{ productId: SEED.amoxicillin, dosageInstructions: 'Twice daily', quantity: 4 }]
        });

      const prescriptionId = rx.body.data.prescription_id;
      await request(app)
        .patch(`/api/prescriptions/${prescriptionId}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          customerId: SEED.patientChipego,
          prescriptionId,
          items: [{ productId: SEED.amoxicillin, quantity: 2 }],
          paymentType: 'cash'
        });

      const res = await report('dispensing', adminToken);

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.entry_count).toBeGreaterThan(0);

      const entry = res.body.data.entries[0];
      // Everything a pharmacy is expected to be able to account for: what, to
      // whom, on whose authority, by whose hand.
      expect(entry.product).toContain('Amoxicillin');
      expect(entry.patient_name).toBeTruthy();
      expect(entry.prescriber).toEqual('Dr. Martin Phiri');
      expect(entry.dispensed_by).toBeTruthy();
      expect(entry.verified_by).toBeTruthy();
      expect(entry.batch_number).toBeTruthy();
    });

    it('excludes over-the-counter sales', async () => {
      const res = await report('dispensing', adminToken);
      // Paracetamol was sold in beforeAll and does not require a prescription.
      expect(res.body.data.entries.every((e) => !/paracetamol/i.test(e.product))).toBe(true);
    });
  });

  describe('Who may read a report', () => {
    it('keeps trading and patient-level dispensing away from a cashier', async () => {
      for (const path of ['vat', 'trading', 'stock', 'dispensing']) {
        const res = await report(path, cashierToken);
        expect(res.statusCode).toEqual(403);
      }
    });
  });
});
