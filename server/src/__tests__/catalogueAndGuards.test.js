const request = require('supertest');
const app = require('../app');
const { pool, closeAll } = require('./helpers/adminDb');
const { SEED, login } = require('./helpers/login');

// Covers DEF-034 to DEF-037 and LIM-001/LIM-002. Each case fails without the
// fix it pins, which is the bar this project sets before a defect is closed.
describe('Catalogue fields and the guards that read them', () => {
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

  const addProduct = (body) =>
    request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send(body);

  describe('VAT treatment is settable, not just storable (DEF-034)', () => {
    it('defaults a new product to zero-rated, as a medicine should be', async () => {
      const res = await addProduct({
        name: `Test Medicine ${Date.now()}`,
        selling_price: 50,
        category: 'Test'
      });

      expect(res.statusCode).toEqual(201);
      expect(res.body.data.vat_treatment).toEqual('ZERO_RATED');
    });

    it('accepts a standard-rated sundry and charges 16% on it at the till', async () => {
      const created = await addProduct({
        name: `Test Sundry ${Date.now()}`,
        selling_price: 100,
        category: 'Sundries',
        vat_treatment: 'STANDARD'
      });

      expect(created.statusCode).toEqual(201);
      expect(created.body.data.vat_treatment).toEqual('STANDARD');

      const sale = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          paymentType: 'cash',
          items: [{ productId: created.body.data.product_id, quantity: 1 }]
        });

      expect(sale.statusCode).toEqual(201);
      expect(sale.body.data.subtotal).toEqual('100.00');
      expect(sale.body.data.tax_amount).toEqual('16.00');
    });

    it('refuses a VAT treatment it does not recognise', async () => {
      const res = await addProduct({
        name: `Test Bad VAT ${Date.now()}`,
        selling_price: 10,
        vat_treatment: 'SEVENTEEN_PERCENT'
      });

      expect(res.statusCode).toEqual(400);
    });
  });

  describe('Stock on hand agrees with what the till enforces (DEF-038)', () => {
    it('never reports negative stock, and matches the batch quantities', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${pharmacistToken}`);

      expect(res.statusCode).toEqual(200);

      const negative = res.body.data.filter((p) => p.quantity_on_hand < 0);
      expect(negative).toEqual([]);

      // Amoxicillin has a seeded batch but no seeded RECEIVE movement, so
      // summing the ledger reported zero and then went negative on a dispense.
      const amox = res.body.data.find((p) => p.product_id === SEED.amoxicillin);
      const batches = await pool.query(
        'SELECT COALESCE(SUM(quantity_on_hand), 0)::int AS held FROM product_batches WHERE product_id = $1',
        [SEED.amoxicillin]
      );

      expect(amox.quantity_on_hand).toEqual(batches.rows[0].held);
    });
  });

  describe('A partial product update leaves the rest alone (DEF-035)', () => {
    let productId;
    let originalName;

    beforeAll(async () => {
      originalName = `Test Editable ${Date.now()}`;
      const created = await addProduct({ name: originalName, selling_price: 30, category: 'Test' });
      productId = created.body.data.product_id;
    });

    it('changes only the price when only a price is sent', async () => {
      const res = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ selling_price: 45 });

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.name).toEqual(originalName);
      expect(parseFloat(res.body.data.selling_price)).toEqual(45);
    });

    it('does not reinstate a discontinued line when state is omitted', async () => {
      await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ state: 'DISCONTINUED' });

      const res = await request(app)
        .put(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ selling_price: 50 });

      expect(res.body.data.state).toEqual('DISCONTINUED');
    });
  });

  describe('The prescription guard reads the prescription (DEF-037, LIM-001)', () => {
    let verifiedId;
    let pendingId;
    let lapsedId;
    let otherControlledId;

    const writePrescription = async (body) => {
      const res = await request(app)
        .post('/api/prescriptions')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ customerId: SEED.patientChipego, doctorId: SEED.doctorPhiri, ...body });
      return res.body.data.prescription_id;
    };

    const verify = (id) =>
      request(app)
        .patch(`/api/prescriptions/${id}/verify`)
        .set('Authorization', `Bearer ${pharmacistToken}`);

    const sell = (body) =>
      request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({ paymentType: 'cash', customerId: SEED.patientChipego, ...body });

    beforeAll(async () => {
      const controlled = await addProduct({
        name: `Test Controlled ${Date.now()}`,
        selling_price: 80,
        requires_prescription: true
      });
      otherControlledId = controlled.body.data.product_id;

      verifiedId = await writePrescription({
        validUntil: '2030-01-01',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'Twice daily', quantity: 4 }]
      });
      await verify(verifiedId);

      pendingId = await writePrescription({
        validUntil: '2030-01-01',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'Twice daily', quantity: 4 }]
      });

      lapsedId = await writePrescription({
        validUntil: '2020-01-01',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'Twice daily', quantity: 4 }]
      });
      await verify(lapsedId);
    });

    it('allows the prescribed medicine up to the prescribed quantity', async () => {
      const res = await sell({
        prescriptionId: verifiedId,
        items: [{ productId: SEED.amoxicillin, quantity: 4 }]
      });

      expect(res.statusCode).toEqual(201);
    });

    it('refuses a prescription a pharmacist has not verified', async () => {
      const res = await sell({
        prescriptionId: pendingId,
        items: [{ productId: SEED.amoxicillin, quantity: 1 }]
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('PRESCRIPTION NOT VERIFIED');
    });

    it('refuses a prescription that has lapsed', async () => {
      const res = await sell({
        prescriptionId: lapsedId,
        items: [{ productId: SEED.amoxicillin, quantity: 1 }]
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('PRESCRIPTION EXPIRED');
    });

    it('will not let a prescription already dispensed be used again', async () => {
      // verifiedId was consumed by the sale above, which set it DISPENSED.
      const res = await sell({
        prescriptionId: verifiedId,
        items: [{ productId: SEED.amoxicillin, quantity: 1 }]
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('PRESCRIPTION NOT VERIFIED');
    });

    it('refuses a controlled medicine the prescription does not list', async () => {
      const fresh = await writePrescription({
        validUntil: '2030-01-01',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'One daily', quantity: 3 }]
      });
      await verify(fresh);

      const res = await sell({
        prescriptionId: fresh,
        items: [{ productId: otherControlledId, quantity: 1 }]
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('NOT PRESCRIBED');
    });

    it('refuses more than was prescribed', async () => {
      const fresh = await writePrescription({
        validUntil: '2030-01-01',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'One daily', quantity: 2 }]
      });
      await verify(fresh);

      const res = await sell({
        prescriptionId: fresh,
        items: [{ productId: SEED.amoxicillin, quantity: 9 }]
      });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('EXCEEDS PRESCRIPTION');
    });

    it('refuses a prescription belonging to another pharmacy', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({
          paymentType: 'cash',
          prescriptionId: verifiedId,
          items: [{ productId: SEED.riversideProduct, quantity: 1 }]
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('Prescription not found');
    });
  });

  describe('Dispensing does not log a movement it did not make (LIM-002)', () => {
    const countMovements = async () => {
      const res = await pool.query(
        'SELECT COUNT(*)::int AS n FROM stock_movements WHERE product_id = $1',
        [SEED.paracetamol]
      );
      return res.rows[0].n;
    };

    it('refuses a batch that is not this product\'s and records nothing', async () => {
      const before = await countMovements();

      const res = await request(app)
        .post('/api/inventory/dispense')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          productId: SEED.paracetamol,
          batchId: '66666666-6666-6666-6666-666666669999',
          quantity: 2
        });

      expect(res.statusCode).toEqual(400);
      expect(await countMovements()).toEqual(before);
    });

    it('refuses to dispense more than the batch holds', async () => {
      const res = await request(app)
        .post('/api/inventory/dispense')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          productId: SEED.paracetamol,
          batchId: SEED.paracetamolBatch,
          quantity: 100000
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('INSUFFICIENT STOCK');
    });

    it('refuses to dispense from an expired batch', async () => {
      const res = await request(app)
        .post('/api/inventory/dispense')
        .set('Authorization', `Bearer ${cashierToken}`)
        .send({
          productId: SEED.coughSyrup,
          batchId: SEED.expiredCoughBatch,
          quantity: 1
        });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('EXPIRED STOCK');
    });
  });

  describe('Triage reports what actually happened (DEF-036)', () => {
    const centralVisit = '88888888-8888-8888-8888-888888888802';

    it('refuses a status it does not recognise', async () => {
      const res = await request(app)
        .patch(`/api/visits/${centralVisit}/status`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ status: 'HAVING_A_THINK' });

      expect(res.statusCode).toEqual(400);
    });

    it('does not report a status change on another pharmacy\'s visit', async () => {
      const res = await request(app)
        .patch(`/api/visits/${centralVisit}/status`)
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({ status: 'CANCELLED' });

      expect(res.statusCode).toEqual(404);

      const check = await pool.query('SELECT status FROM visits WHERE visit_id = $1', [centralVisit]);
      expect(check.rows[0].status).not.toEqual('CANCELLED');
    });

    it('does not open a visit for another pharmacy\'s patient', async () => {
      const res = await request(app)
        .post('/api/visits')
        .set('Authorization', `Bearer ${riversideAdminToken}`)
        .send({ customerId: SEED.patientChipego, reason: 'Should not be possible' });

      expect(res.statusCode).toEqual(404);
    });
  });
});
