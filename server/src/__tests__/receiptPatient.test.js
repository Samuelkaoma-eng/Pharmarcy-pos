const request = require('supertest');
const app = require('../app');
const { pool } = require('../config/db');
const { SEED, login } = require('./helpers/login');

afterAll(async () => {
  await pool.end();
});

// The receipt is a document the patient carries out of the pharmacy, so the
// name printed on it has to be the name recorded against the sale. The create
// response carried no customer field at all, so every receipt read
// "Counter sale" — including over a sale whose customer_id was set and whose
// bill had already been split with an insurer.
describe('A completed sale carries the patient it was recorded against', () => {
  let cashierToken;

  beforeAll(async () => {
    cashierToken = await login('cashier');
  });

  const sell = (body) =>
    request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        paymentType: 'cash',
        items: [{ productId: SEED.paracetamol, quantity: 1 }],
        ...body
      });

  it('returns the recorded patient name when a patient was named', async () => {
    const res = await sell({ customerId: SEED.patientChipego });

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.customer_id).toEqual(SEED.patientChipego);
    expect(res.body.data.customer_name).toEqual('Chipego Mukimba');
  });

  it('returns no name for a walk-in, so the receipt reads as a counter sale', async () => {
    const res = await sell({});

    expect(res.statusCode).toEqual(201);
    expect(res.body.data.customer_id).toBeNull();
    expect(res.body.data.customer_name).toBeNull();
  });

  it('names the patient on the insured sale the defect was reported against', async () => {
    const res = await sell({
      paymentType: 'insurance',
      customerId: SEED.patientChipego,
      items: [{ productId: SEED.paracetamol, quantity: 4 }]
    });

    expect(res.statusCode).toEqual(201);
    // The split is applied and the patient is still named: the two facts the
    // receipt has to state together.
    expect(Number(res.body.data.scheme_covered)).toBeGreaterThan(0);
    expect(res.body.data.customer_name).toEqual('Chipego Mukimba');
  });

  it('refuses a patient belonging to another pharmacy', async () => {
    // The name is read tenant-scoped, so a sale can no longer be attributed to
    // a patient this pharmacy does not hold.
    const res = await sell({ customerId: SEED.riversidePatient });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toContain('Patient not found');
  });
});
