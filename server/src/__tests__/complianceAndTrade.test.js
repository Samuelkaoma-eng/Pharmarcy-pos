const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login, controlHubLogin } = require('./helpers/login');

const REVIEW_TENANT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const SUNDRY = '55555555-5555-5555-5555-555555555506';
const SUPPLIER = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';
const MADISON = 'ffffffff-ffff-ffff-ffff-fffffffffff2';

afterAll(async () => {
  await pool.end();
});

describe('VAT is decided per product, not as one blanket rate', () => {
  let cashierToken;

  beforeAll(async () => {
    cashierToken = await login('cashier');
  });

  it('charges no VAT on a dispensed medicine', async () => {
    // Medicines fall under Group 6 of the Zambian VAT (Zero-Rating) Order.
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 2 }] });

    expect(res.statusCode).toEqual(201);
    expect(Number(res.body.data.tax_amount)).toEqual(0);
    // Paracetamol is 25.00, so the total must not carry a 16% uplift.
    expect(Number(res.body.data.total)).toEqual(50);
  });

  it('charges standard VAT on a sundry', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SUNDRY, quantity: 1 }] });

    expect(res.statusCode).toEqual(201);
    // 180.00 at 16%.
    expect(Number(res.body.data.tax_amount)).toBeCloseTo(28.8, 2);
    expect(Number(res.body.data.total)).toBeCloseTo(208.8, 2);
  });

  it('taxes only the standard-rated line in a mixed basket', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        items: [
          { productId: SEED.paracetamol, quantity: 1 },
          { productId: SUNDRY, quantity: 1 }
        ]
      });

    expect(res.statusCode).toEqual(201);
    expect(Number(res.body.data.subtotal)).toBeCloseTo(205, 2);
    expect(Number(res.body.data.tax_amount)).toBeCloseTo(28.8, 2);
  });

  it('records a Smart Invoice reference when one is supplied', async () => {
    // Recorded, never generated: this is not a ZRA approved provider.
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        smartInvoiceRef: 'SI-2026-000123',
        items: [{ productId: SEED.paracetamol, quantity: 1 }]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.smart_invoice_ref).toEqual('SI-2026-000123');
  });
});

describe('Insurance cover splits the bill', () => {
  let cashierToken;
  let adminToken;

  beforeAll(async () => {
    cashierToken = await login('cashier');
    adminToken = await login('admin', SEED.centralTenantId);
  });

  it('reports a covered patient', async () => {
    const res = await request(app)
      .get(`/api/insurance/coverage/${SEED.patientChipego}`)
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.name).toEqual('Madison Health');
    expect(Number(res.body.data.cover_percent)).toEqual(80);
  });

  it('reports no cover for a patient who has none', async () => {
    const res = await request(app)
      .get('/api/insurance/coverage/33333333-3333-3333-3333-333333333303')
      .set('Authorization', `Bearer ${cashierToken}`);

    expect(res.body.data).toBeNull();
  });

  it('splits a sale between the scheme and the patient', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'insurance',
        customerId: SEED.patientChipego,
        items: [{ productId: SEED.paracetamol, quantity: 4 }]
      });

    expect(res.statusCode).toEqual(201);
    // 4 x 25.00 = 100.00, zero-rated, 80% covered.
    expect(Number(res.body.data.scheme_covered)).toBeCloseTo(80, 2);
    expect(Number(res.body.data.patient_payable)).toBeCloseTo(20, 2);
  });

  it('leaves the patient paying everything when uncovered', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        customerId: '33333333-3333-3333-3333-333333333303',
        items: [{ productId: SEED.paracetamol, quantity: 1 }]
      });

    expect(Number(res.body.data.scheme_covered)).toEqual(0);
    expect(Number(res.body.data.patient_payable)).toBeCloseTo(25, 2);
  });

  it('will not enrol a patient into another pharmacy scheme', async () => {
    const riversideAdmin = await login('admin', SEED.riversideTenantId);

    const res = await request(app)
      .post('/api/insurance/memberships')
      .set('Authorization', `Bearer ${riversideAdmin}`)
      .send({ schemeId: MADISON, customerId: SEED.patientChipego, memberNumber: 'X-1' });

    expect(res.statusCode).toEqual(404);
  });

  it('does not let a cashier create a scheme', async () => {
    const res = await request(app)
      .post('/api/insurance/schemes')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ name: 'Rogue Scheme' });

    expect(res.statusCode).toEqual(403);
  });

  it('rejects an impossible cover percentage', async () => {
    const res = await request(app)
      .post('/api/insurance/schemes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Bad Scheme ${Date.now()}`, cover_percent: 140 });

    expect(res.statusCode).toEqual(400);
  });
});

describe('Suppliers and purchase orders', () => {
  let pharmacistToken;
  let poId;
  let poItemId;

  beforeAll(async () => {
    pharmacistToken = await login('pharmacist');
  });

  it('lists the pharmacy suppliers', async () => {
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.map((s) => s.name)).toContain('Zambia Medical Stores Ltd');
  });

  it('raises a purchase order', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        supplierId: SUPPLIER,
        expectedDate: '2027-01-15',
        items: [{ productId: SEED.paracetamol, quantity: 100, unitCost: 12.5 }]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.status).toEqual('SENT');
    expect(res.body.data.po_number).toMatch(/^PO-/);
    poId = res.body.data.po_id;
  });

  it('refuses a purchase order against another pharmacy product', async () => {
    const res = await request(app)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplierId: SUPPLIER, items: [{ productId: SEED.riversideProduct, quantity: 5 }] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/Product not found/i);
  });

  it('returns the order with its lines', async () => {
    const res = await request(app)
      .get(`/api/purchase-orders/${poId}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.items.length).toEqual(1);
    poItemId = res.body.data.items[0].po_item_id;
  });

  it('will not receive more than was ordered', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ lines: [{ poItemId, quantity: 500, batchNumber: 'B-OVER', expiryDate: '2028-01-01' }] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/only 100 outstanding/i);
  });

  it('receives part of an order and leaves it partially received', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ lines: [{ poItemId, quantity: 40, batchNumber: 'B-PART-1', expiryDate: '2028-01-01' }] });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('PARTIALLY_RECEIVED');
  });

  it('stamps the supplier onto the batch and the movement', async () => {
    // This is the accountability trail: a recalled batch traces back to who
    // supplied it.
    const batch = await pool.query('SELECT supplier_id FROM product_batches WHERE batch_number = $1', ['B-PART-1']);
    expect(batch.rows[0].supplier_id).toEqual(SUPPLIER);

    const movement = await pool.query(
      "SELECT supplier_id FROM stock_movements WHERE notes LIKE 'Received against PO-%' ORDER BY created_at DESC LIMIT 1"
    );
    expect(movement.rows[0].supplier_id).toEqual(SUPPLIER);
  });

  it('closes the order once the balance arrives', async () => {
    const res = await request(app)
      .post(`/api/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ lines: [{ poItemId, quantity: 60, batchNumber: 'B-PART-2', expiryDate: '2028-01-01' }] });

    expect(res.body.data.status).toEqual('RECEIVED');
  });

  it('hides another pharmacy suppliers', async () => {
    const riversideToken = await login('riverside_cashier');
    const res = await request(app)
      .get('/api/suppliers')
      .set('Authorization', `Bearer ${riversideToken}`);

    expect(res.body.data.length).toEqual(0);
  });
});

describe('Drug directory', () => {
  let pharmacistToken;

  beforeAll(async () => {
    pharmacistToken = await login('pharmacist');
  });

  it('refuses a search that is too short to be meaningful', async () => {
    const res = await request(app)
      .get('/api/drugs/search?q=a')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(400);
  });

  it('never reports a clean basket when it could not screen one', async () => {
    // The NLM retired its free interaction API in January 2024. With no source
    // configured this must say so, not imply the basket is safe. A false
    // negative here is worse than having no check at all.
    const res = await request(app)
      .post('/api/drugs/interactions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ productIds: [SEED.paracetamol, SEED.amoxicillin] });

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.available).toBe(false);
    expect(res.body.message).toMatch(/could not be screened/i);
    expect(res.body.message).not.toMatch(/no known interactions/i);
    expect(res.body.data.reason).toMatch(/interaction data source/i);
  });

  it('treats a single-item basket as nothing to check', async () => {
    const res = await request(app)
      .post('/api/drugs/interactions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ productIds: [SEED.paracetamol] });

    expect(res.body.data.available).toBe(true);
    expect(res.body.data.interactions).toEqual([]);
  });
});

describe('Onboarding documents match what ZAMRA requires', () => {
  let superAdminToken;

  beforeAll(async () => {
    superAdminToken = (await controlHubLogin('superadmin')).body.data.token;
  });

  it('publishes the required document set', async () => {
    const res = await request(app)
      .get('/api/controlhub/documents/types')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.body.data).toEqual(
      expect.arrayContaining(['PACRA_CERTIFICATE', 'TPIN_CERTIFICATE', 'PHARMACIST_PRACTISING', 'ZAMRA_INSPECTION'])
    );
  });

  it('reports which required documents are still missing', async () => {
    const res = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/readiness`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.body.data.ready_to_activate).toBe(false);
    expect(res.body.data.missing.length).toEqual(7);
  });

  it('refuses an upload with an unrecognised document type', async () => {
    const res = await request(app)
      .post(`/api/controlhub/tenants/${REVIEW_TENANT}/documents`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .field('document_type', 'NOT_A_REAL_TYPE')
      .attach('file', Buffer.from('%PDF-1.4 test'), { filename: 'x.pdf', contentType: 'application/pdf' });

    expect(res.statusCode).toEqual(400);
  });

  it('stores an uploaded document and serves it back', async () => {
    const upload = await request(app)
      .post(`/api/controlhub/tenants/${REVIEW_TENANT}/documents`)
      .set('Authorization', `Bearer ${superAdminToken}`)
      .field('document_type', 'PACRA_CERTIFICATE')
      .attach('file', Buffer.from('%PDF-1.4 pacra'), { filename: 'pacra.pdf', contentType: 'application/pdf' });

    expect(upload.statusCode).toEqual(201);
    expect(upload.body.data.stored_path).toBeTruthy();
    expect(upload.body.data.size_bytes).toBeGreaterThan(0);

    // A reviewer has to be able to actually open it.
    const file = await request(app)
      .get(`/api/controlhub/documents/${upload.body.data.document_id}/file`)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(file.statusCode).toEqual(200);
    expect(file.headers['content-type']).toMatch(/pdf/);
    // A PDF comes back as a binary body, not text.
    expect(Buffer.from(file.body).toString()).toContain('pacra');
  });

  it('keeps stored documents away from pharmacy staff', async () => {
    const adminToken = await login('admin', SEED.centralTenantId);
    const res = await request(app)
      .get(`/api/controlhub/tenants/${REVIEW_TENANT}/documents`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toEqual(403);
  });
});
