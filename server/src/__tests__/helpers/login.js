const request = require('supertest');
const app = require('../../app');

// Seeded identifiers shared across the suites. These mirror
// Docs/Elaboration/seed_data.sql.
const SEED = {
  centralTenantId: '11111111-1111-1111-1111-111111111111',
  riversideTenantId: '99999999-9999-9999-9999-999999999999',
  platformTenantId: '00000000-0000-0000-0000-0000000000ff',
  paracetamol: '55555555-5555-5555-5555-555555555501',
  amoxicillin: '55555555-5555-5555-5555-555555555502',
  ibuprofen: '55555555-5555-5555-5555-555555555503',
  coughSyrup: '55555555-5555-5555-5555-555555555504',
  riversideProduct: '55555555-5555-5555-5555-555555555901',
  paracetamolBatch: '66666666-6666-6666-6666-666666666601',
  expiredCoughBatch: '66666666-6666-6666-6666-666666666604',
  patientChipego: '33333333-3333-3333-3333-333333333301',
  doctorPhiri: '44444444-4444-4444-4444-444444444401',
  password: 'password123'
};

// Logs in a tenant user and returns the bearer token. tenantId is required
// wherever a username is shared between pharmacies (for example 'admin').
const login = async (username, tenantId) => {
  const body = { username, password: SEED.password };
  if (tenantId) body.tenantId = tenantId;

  const res = await request(app).post('/api/auth/login').send(body);
  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${username}: ${res.statusCode} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.token;
};

const controlHubLogin = async (username = 'superadmin') => {
  const res = await request(app)
    .post('/api/controlhub/login')
    .send({ username, password: SEED.password });
  return res;
};

module.exports = { SEED, login, controlHubLogin };
