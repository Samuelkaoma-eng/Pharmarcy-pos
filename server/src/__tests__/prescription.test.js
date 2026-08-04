const request = require('supertest');
const app = require('../app');
const { closeAll } = require('./helpers/adminDb');
const { SEED, login } = require('./helpers/login');

describe('Prescription lifecycle', () => {
  let pharmacistToken;
  let cashierToken;
  let riversideAdminToken;
  let prescriptionId;

  beforeAll(async () => {
    pharmacistToken = await login('pharmacist');
    cashierToken = await login('cashier');
    // Riverside's Admin, not its cashier: the role guard would otherwise reject
    // the request before tenant scoping was ever exercised.
    riversideAdminToken = await login('admin', SEED.riversideTenantId);
  });

  afterAll(async () => {
    await closeAll();
  });

  it('creates a prescription with items', async () => {
    const res = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        doctorId: SEED.doctorPhiri,
        customerId: SEED.patientChipego,
        validUntil: '2027-01-01',
        notes: 'Automated test prescription',
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'One capsule twice daily', quantity: 10 }]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveProperty('prescription_id');
    prescriptionId = res.body.data.prescription_id;
  });

  // A pharmacist cannot verify what they cannot read. The review screen showed
  // a blank medicine column and an invented reference because none of this was
  // in the response (DEF-047).
  it('carries enough on the list for a prescription to be reviewed', async () => {
    const res = await request(app)
      .get('/api/prescriptions')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    const row = res.body.data.find((p) => p.prescription_id === prescriptionId);

    expect(row.patient_name).toBeTruthy();
    expect(row.doctor_name).toEqual('Dr. Martin Phiri');
    expect(row.item_summary).toContain('Amoxicillin');
    expect(row.item_count).toEqual(1);
    expect(row.has_lapsed).toBe(false);
  });

  it('shows the prescriber, the directions and the stock position on review', async () => {
    const res = await request(app)
      .get(`/api/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.doctor_name).toEqual('Dr. Martin Phiri');
    expect(res.body.data.patient_nrc).toBeDefined();

    const item = res.body.data.items[0];
    expect(item.product_name).toContain('Amoxicillin');
    expect(item.dosage_instructions).toEqual('One capsule twice daily');
    // Whether it can actually be dispensed, not only what was asked for.
    expect(Number(item.in_date_stock)).toBeGreaterThanOrEqual(0);
  });

  it('filters the list by status, so a tab means something', async () => {
    const res = await request(app)
      .get('/api/prescriptions?status=PENDING')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.every((p) => p.status === 'PENDING')).toBe(true);
  });

  it('returns the prescription with its items', async () => {
    const res = await request(app)
      .get(`/api/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('PENDING');
    expect(res.body.data.items.length).toEqual(1);
    expect(res.body.data.items[0].product_name).toMatch(/Amoxicillin/i);
  });

  it('does not let a cashier create a prescription', async () => {
    const res = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        doctorId: SEED.doctorPhiri,
        customerId: SEED.patientChipego,
        items: [{ productId: SEED.amoxicillin, dosageInstructions: 'test', quantity: 1 }]
      });

    expect(res.statusCode).toEqual(403);
  });

  it('lets a pharmacist verify the prescription', async () => {
    const res = await request(app)
      .patch(`/api/prescriptions/${prescriptionId}/verify`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.status).toEqual('VERIFIED');
    expect(res.body.data.verified_by_id).toBeTruthy();
  });

  it('does not verify another pharmacy prescription', async () => {
    // The row exists, but not for this tenant, so it must read as missing
    // rather than reporting a successful verification.
    const res = await request(app)
      .patch(`/api/prescriptions/${prescriptionId}/verify`)
      .set('Authorization', `Bearer ${riversideAdminToken}`);

    expect(res.statusCode).toEqual(404);
  });

  it('unlocks checkout of a prescription-only drug once a prescription is supplied', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        prescriptionId,
        customerId: SEED.patientChipego,
        items: [{ productId: SEED.amoxicillin, quantity: 2 }]
      });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data).toHaveProperty('receipt_number');
  });

  it('marks the prescription dispensed after that sale', async () => {
    const res = await request(app)
      .get(`/api/prescriptions/${prescriptionId}`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.body.data.status).toEqual('DISPENSED');
  });

  it('returns 404 when dispensing a prescription that does not exist', async () => {
    const res = await request(app)
      .patch('/api/prescriptions/88888888-8888-8888-8888-888888888888/dispense')
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.statusCode).toEqual(404);
  });
});
