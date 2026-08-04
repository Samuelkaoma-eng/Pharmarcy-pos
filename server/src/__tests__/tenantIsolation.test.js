const request = require('supertest');
const app = require('../app');
const db = require('../config/db');
const { pool, closeAll } = require('./helpers/adminDb');
const { SEED, login } = require('./helpers/login');

// Runs `fn` the way a real request runs: a connection of its own, the tenant
// set on it from a verified claim, and the connection cleared and handed back
// afterwards. It is the same three calls middleware/dbContext.js and
// middleware/auth.js make, with Express taken out of the way so a test can
// issue the query a careless controller would have issued.
const asTenant = (tenantId, fn, { platformAdmin = false } = {}) =>
  db.runInScope(async () => {
    const scope = db.currentScope();
    try {
      await db.setTenantScope({ tenantId, platformAdmin });
      return await fn();
    } finally {
      await db.releaseScope(scope);
    }
  });

describe('Cross-tenant isolation', () => {
  let centralToken;
  let riversideToken;

  beforeAll(async () => {
    centralToken = await login('cashier');
    riversideToken = await login('riverside_cashier');
  });

  it('shows each pharmacy only its own catalogue', async () => {
    const central = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${centralToken}`);

    const riverside = await request(app)
      .get('/api/products')
      .set('Authorization', `Bearer ${riversideToken}`);

    const centralIds = central.body.data.map((p) => p.product_id);
    const riversideIds = riverside.body.data.map((p) => p.product_id);

    expect(centralIds).toContain(SEED.paracetamol);
    expect(centralIds).not.toContain(SEED.riversideProduct);

    expect(riversideIds).toContain(SEED.riversideProduct);
    expect(riversideIds).not.toContain(SEED.paracetamol);
  });

  it('will not sell another pharmacy stock', async () => {
    const res = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.riversideProduct, quantity: 1 }] });

    expect(res.statusCode).toEqual(400);
    expect(res.body.error).toMatch(/Product not found/i);
  });

  it('will not receive stock against another pharmacy product', async () => {
    const adminToken = await login('admin', SEED.centralTenantId);

    const res = await request(app)
      .post('/api/inventory/receive')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        productId: SEED.riversideProduct,
        batchNumber: 'CROSS-TENANT-ATTEMPT',
        expiryDate: '2028-01-01',
        quantity: 10
      });

    expect(res.statusCode).toEqual(404);
    expect(res.body.error).toMatch(/not found for this pharmacy/i);
  });

  it('hides another pharmacy sales history', async () => {
    // Central makes a sale, Riverside must not be able to see it.
    const sale = await request(app)
      .post('/api/sales')
      .set('Authorization', `Bearer ${centralToken}`)
      .send({ paymentType: 'cash', items: [{ productId: SEED.paracetamol, quantity: 1 }] });

    expect(sale.statusCode).toEqual(201);
    const saleId = sale.body.data.sale_id;

    const riversideView = await request(app)
      .get(`/api/sales/${saleId}`)
      .set('Authorization', `Bearer ${riversideToken}`);

    expect(riversideView.statusCode).toEqual(404);
  });

  it('keeps a tenant user out of ControlHub routes', async () => {
    const res = await request(app)
      .get('/api/controlhub/tenants')
      .set('Authorization', `Bearer ${centralToken}`);

    expect(res.statusCode).toEqual(403);
  });
});

// ---------------------------------------------------------------------------
// Row-level security (R-10)
// ---------------------------------------------------------------------------
// Everything above tests that the controllers scope their queries. These test
// that it would not matter if one of them stopped — which is the only thing
// that distinguishes row-level security actually enforcing from row-level
// security merely being installed.
describe('Row-level security is enforced by the database, not by the queries', () => {
  afterAll(async () => {
    await closeAll();
  });

  // Trap one. A superuser bypasses every policy unconditionally, and FORCE ROW
  // LEVEL SECURITY does not apply to one. If this test ever fails, every other
  // test in this file is passing for the wrong reason: the policies are there,
  // they are simply never consulted.
  it('connects as a role that cannot bypass the policies', async () => {
    const res = await db.pool.query(
      'SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    );

    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].rolsuper).toBe(false);
    expect(res.rows[0].rolbypassrls).toBe(false);
    expect(res.rows[0].current_user).not.toEqual('postgres');
  });

  it('leaves no table without a policy', async () => {
    const report = await db.verifyRlsEnforced();
    expect(report.tablesWithoutRls).toEqual([]);
    expect(report.enforced).toBe(true);
  });

  // The test the whole change exists for. The `WHERE tenant_id = $1` is
  // deliberately absent — this is the query a controller written in a hurry
  // would issue — and it must still come back with only this pharmacy's rows.
  it('returns nothing across tenants even when the query forgets its scope', async () => {
    const riverside = await asTenant(SEED.riversideTenantId, async () => ({
      chipego: await db.query('SELECT * FROM customers WHERE customer_id = $1', [SEED.patientChipego]),
      allPatients: await db.query('SELECT customer_id FROM customers'),
      allProducts: await db.query('SELECT product_id FROM products'),
      allSales: await db.query('SELECT sale_id FROM sales')
    }));

    // Central's patient, asked for by primary key, with nothing scoping the
    // query at all.
    expect(riverside.chipego.rows).toHaveLength(0);

    expect(riverside.allPatients.rows.map((r) => r.customer_id)).not.toContain(SEED.patientChipego);
    expect(riverside.allProducts.rows.map((r) => r.product_id)).not.toContain(SEED.paracetamol);
    expect(riverside.allProducts.rows.map((r) => r.product_id)).toContain(SEED.riversideProduct);

    // And the same unscoped reads from the other side see their own rows, so
    // the test is not passing merely because everything returns empty.
    const central = await asTenant(SEED.centralTenantId, async () => ({
      chipego: await db.query('SELECT * FROM customers WHERE customer_id = $1', [SEED.patientChipego]),
      allProducts: await db.query('SELECT product_id FROM products')
    }));

    expect(central.chipego.rows).toHaveLength(1);
    expect(central.allProducts.rows.map((r) => r.product_id)).toContain(SEED.paracetamol);
    expect(central.allProducts.rows.map((r) => r.product_id)).not.toContain(SEED.riversideProduct);

    // Central has sales by this point in the run, so Riverside seeing none is a
    // real exclusion rather than an empty table.
    const centralSales = await pool.query('SELECT COUNT(*)::int AS n FROM sales WHERE tenant_id = $1', [
      SEED.centralTenantId
    ]);
    expect(centralSales.rows[0].n).toBeGreaterThan(0);
    expect(riverside.allSales.rows).toHaveLength(0);
  });

  // sale_items, prescription_items and purchase_order_items carry no tenant_id
  // of their own. Their policies ask whether the parent row is visible, so this
  // checks that the indirection actually holds.
  it('hides child rows whose parent belongs to another pharmacy', async () => {
    const parent = await pool.query(
      `SELECT p.prescription_id
         FROM prescriptions p
        WHERE p.tenant_id = $1
        LIMIT 1`,
      [SEED.centralTenantId]
    );
    expect(parent.rows).toHaveLength(1);
    const prescriptionId = parent.rows[0].prescription_id;

    const items = await pool.query(
      'SELECT COUNT(*)::int AS n FROM prescription_items WHERE prescription_id = $1',
      [prescriptionId]
    );
    expect(items.rows[0].n).toBeGreaterThan(0);

    const seenByRiverside = await asTenant(SEED.riversideTenantId, () =>
      db.query('SELECT * FROM prescription_items WHERE prescription_id = $1', [prescriptionId])
    );
    expect(seenByRiverside.rows).toHaveLength(0);

    const seenByCentral = await asTenant(SEED.centralTenantId, () =>
      db.query('SELECT * FROM prescription_items WHERE prescription_id = $1', [prescriptionId])
    );
    expect(seenByCentral.rows.length).toEqual(items.rows[0].n);
  });

  // Trap two. `app.tenant_id` is session state and the connections are pooled,
  // so a connection given back still holding a tenant would be a cross-tenant
  // read that nothing in the SQL would reveal — strictly worse than the
  // convention this replaced. Every connection currently in the pool is
  // checked, rather than the one that happens to come back first.
  it('never hands a connection back to the pool still carrying a tenant', async () => {
    await asTenant(SEED.centralTenantId, () => db.query('SELECT product_id FROM products'));

    const borrowed = [];
    for (let i = 0; i < 4; i += 1) {
      borrowed.push(await db.pool.connect());
    }

    try {
      for (const client of borrowed) {
        const setting = await client.query("SELECT current_setting('app.tenant_id', true) AS tenant");
        expect(setting.rows[0].tenant == null || setting.rows[0].tenant === '').toBe(true);

        const rows = await client.query('SELECT COUNT(*)::int AS n FROM customers');
        expect(rows.rows[0].n).toEqual(0);
      }
    } finally {
      borrowed.forEach((client) => client.release());
    }
  });

  // A request that never authenticated has no tenant, and no tenant is not a
  // wildcard.
  it('shows an unauthenticated request nothing at all', async () => {
    const seen = await db.runInScope(async () => {
      const scope = db.currentScope();
      try {
        return await db.query('SELECT COUNT(*)::int AS n FROM customers');
      } finally {
        await db.releaseScope(scope);
      }
    });

    expect(seen.rows[0].n).toEqual(0);
  });

  // The sign-in window has to reach across pharmacies — a username is only
  // unique within one — so it is the one deliberate hole in the wall. This
  // fixes how wide it is: three identity tables, and not one patient record.
  it('opens the sign-in window onto identity only, never onto patient data', async () => {
    const inside = await asTenant(SEED.riversideTenantId, () =>
      db.withAuthLookup(async () => ({
        users: await db.query('SELECT user_id FROM users WHERE tenant_id = $1', [SEED.centralTenantId]),
        patients: await db.query('SELECT customer_id FROM customers WHERE customer_id = $1', [
          SEED.patientChipego
        ]),
        products: await db.query('SELECT product_id FROM products WHERE product_id = $1', [
          SEED.paracetamol
        ])
      }))
    );

    // Sign-in can find a user, because that is what establishes the tenant.
    expect(inside.users.rows.length).toBeGreaterThan(0);
    // It cannot find anything else.
    expect(inside.patients.rows).toHaveLength(0);
    expect(inside.products.rows).toHaveLength(0);
  });

  it('closes the sign-in window again as soon as the lookup returns', async () => {
    const after = await asTenant(SEED.riversideTenantId, async () => {
      await db.withAuthLookup(() => db.query('SELECT user_id FROM users LIMIT 1'));
      return db.query('SELECT user_id FROM users WHERE tenant_id = $1', [SEED.centralTenantId]);
    });

    expect(after.rows).toHaveLength(0);
  });
});
