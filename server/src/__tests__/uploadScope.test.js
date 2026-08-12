const request = require('supertest');
const app = require('../app');
const db = require('../config/db');
const documentController = require('../controllers/documentController');
const { pool, closeAll } = require('./helpers/adminDb');

// The upload was refused as "Pharmacy not found" on the deployment while the
// status page beside it served that very pharmacy. The cause was not the data:
// it was the request's tenant scope not surviving multer's parse of the file,
// after which `db.query` falls back to an unscoped connection and row-level
// security correctly answers with nothing.
//
// Reproducing that through HTTP is not possible here, because the middleware
// that establishes the scope always runs and the store survives on this Node
// version. So the mechanism is exercised directly instead.
describe('an onboarding upload whose request scope is missing', () => {
  let tenantId;

  beforeAll(async () => {
    const res = await request(app).post('/api/onboarding/register').send({
      name: `Scope Pharmacy ${Date.now()}`,
      owner_email: 'scope@example.zm',
      admin_username: `scope_${Date.now()}`,
      admin_password: 'scope-pass-1234'
    });
    tenantId = res.body.data.tenant_id;
  });

  afterAll(async () => {
    if (tenantId) await pool.query('DELETE FROM tenants WHERE tenant_id = $1', [tenantId]);
    await closeAll();
  }, 30000);

  const readTenant = () =>
    db.query('SELECT status FROM tenants WHERE tenant_id = $1 AND status = ANY($2)', [
      tenantId,
      ['REGISTERED', 'SUBMITTED', 'UNDER_REVIEW', 'REJECTED']
    ]);

  // This is the defect itself, stated as a fact about the database rather than
  // about the upload: with no tenant on the connection, the pharmacy's own row
  // is invisible. It is why the handler reported the pharmacy missing.
  it('finds no pharmacy at all when it runs with no scope', async () => {
    expect(db.currentScope()).toBeUndefined();
    const rows = await readTenant();
    expect(rows.rows.length).toEqual(0);
  });

  it('finds it again once the repair re-establishes the scope', async () => {
    let found = null;
    const handler = async () => { found = await readTenant(); };

    await documentController.withRequestScope(handler)(
      { onboardingTenantId: tenantId },
      {}
    );

    expect(found.rows.length).toEqual(1);
    expect(found.rows[0].status).toEqual('REGISTERED');
  });

  it('leaves the handler alone when the scope was never lost', async () => {
    let sawScope = false;
    const handler = async () => { sawScope = Boolean(db.currentScope()); };

    await db.runInScope(async () => {
      await documentController.withRequestScope(handler)({ onboardingTenantId: tenantId }, {});
    });

    expect(sawScope).toBe(true);
  });
});
