-- ====================================================================
-- PHARMACY POS SYSTEM - ROW-LEVEL SECURITY
-- Group 16 - Advanced Software Engineering (CSC4630)
-- ====================================================================
--
-- Until this file existed, one pharmacy was kept out of another's records by
-- every query carrying `WHERE tenant_id = $1`. That is a convention, and a
-- convention is one forgotten clause away from a cross-tenant disclosure —
-- risk R-10. This moves the guarantee from the application into the database,
-- so a query that forgets its scope returns nothing rather than everything.
--
-- Applied by server/scripts/resetDb.js and by config/db.js on first boot,
-- AFTER the schema and the seed. It is idempotent: re-running it is safe.
--
-- --------------------------------------------------------------------
-- The two things that would make a careless attempt worse than no attempt
-- --------------------------------------------------------------------
--
-- 1. A SUPERUSER BYPASSES RLS UNCONDITIONALLY. `FORCE ROW LEVEL SECURITY`
--    does not apply to one. If the application still connected as `postgres`
--    this whole file would install cleanly, the suite would stay green, and
--    nothing whatever would be enforced — a control reporting itself as
--    running when it cannot run, which is the failure this project refuses
--    everywhere else. So the role is checked below and this file REFUSES TO
--    APPLY if the application role is a superuser or holds BYPASSRLS.
--
-- 2. A POOLED CONNECTION CAN CARRY THE TENANT INTO THE NEXT REQUEST.
--    `app.tenant_id` is session state, and the server hands connections back
--    to a pool. That half is enforced in config/db.js, which clears the
--    connection with DISCARD ALL before releasing it and destroys any
--    connection it could not clear.
--
-- --------------------------------------------------------------------
-- Who may see across tenants, and why
-- --------------------------------------------------------------------
--
-- `app.tenant_id`     the pharmacy this connection is answering for. Unset
--                     means no rows: the default is closed, not open.
-- `app.platform_admin` the ControlHub operator, whose entire function is
--                     cross-tenant — approving pharmacies, reviewing their
--                     paperwork, suspending them. Set only from a verified
--                     SuperAdmin claim, by the same middleware that gates the
--                     ControlHub routes.
-- `app.auth_lookup`   the narrow window before a tenant is known. Signing in
--                     has to find a user by name before it can know which
--                     pharmacy they belong to; refreshing has to find a token
--                     by hash; registering creates a pharmacy that has no
--                     session yet. It unlocks ONLY tenants, users and
--                     refresh_tokens — never a patient record, never stock,
--                     never a sale — and config/db.js turns it off again in a
--                     `finally`.
--
-- The application role cannot redefine these functions: it does not own them
-- and has no CREATE on the schema (revoked explicitly below).
-- ====================================================================

-- The role name is fixed here rather than taken from an environment variable,
-- because a policy that referred to a configurable role would be a policy
-- nobody could read and check.

-- --------------------------------------------------------------------
-- 0. Refuse to proceed if the application role cannot actually be constrained
-- --------------------------------------------------------------------
DO $check$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pharmacy_app') THEN
        RAISE EXCEPTION
            'Role "pharmacy_app" does not exist. Run: npm --prefix server run db:reset, '
            'which creates it from DB_APP_PASSWORD before applying this file.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'pharmacy_app' AND (rolsuper OR rolbypassrls)
    ) THEN
        RAISE EXCEPTION
            'Role "pharmacy_app" is a superuser or holds BYPASSRLS, so every policy in this '
            'file would be silently ignored. Refusing to install protection that cannot run.';
    END IF;
END
$check$;

-- --------------------------------------------------------------------
-- 1. Privileges
-- --------------------------------------------------------------------
-- The application reads and writes rows. It does not create, alter or drop
-- anything: schema changes are a migration, run by the owner.
GRANT USAGE ON SCHEMA public TO pharmacy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pharmacy_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pharmacy_app;

-- Without this the application role could create a function of its own in the
-- schema, and — depending on search_path — get it called in place of one of
-- the predicates below. PostgreSQL 15 and later revoke this by default; it is
-- stated anyway so the property does not depend on the server version.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- --------------------------------------------------------------------
-- 2. The predicates the policies are built from
-- --------------------------------------------------------------------
-- `current_setting(name, true)` returns NULL rather than raising when the
-- setting was never set, which is what makes an unscoped connection resolve to
-- "no tenant" instead of an error. NULLIF then turns the empty string — what
-- the connection is reset to — into NULL as well, so `tenant_id = NULL` is
-- NULL, which is not TRUE, which is no rows. Closed by default.
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path = pg_catalog
    AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_is_platform() RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path = pg_catalog
    AS $$ SELECT coalesce(current_setting('app.platform_admin', true), 'off') = 'on' $$;

CREATE OR REPLACE FUNCTION app_is_auth_lookup() RETURNS boolean
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path = pg_catalog
    AS $$ SELECT coalesce(current_setting('app.auth_lookup', true), 'off') = 'on' $$;

-- --------------------------------------------------------------------
-- 3. Tenant-scoped data: every table carrying its own tenant_id
-- --------------------------------------------------------------------
-- This is the patient and trade data — the records a disclosure would actually
-- expose. A connection with no tenant set sees none of it.
DO $tenant_tables$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'audit_log',
        'customers',
        'doctors',
        'products',
        'product_batches',
        'stock_movements',
        'visits',
        'vitals',
        'prescriptions',
        'till_sessions',
        'sales',
        'payments',
        'onboarding_documents',
        'suppliers',
        'purchase_orders',
        'insurance_schemes',
        'scheme_memberships',
        'patient_recalls',
        'approval_requests'
    ]
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        -- FORCE covers the table owner too. The owner is a superuser here and
        -- so bypasses regardless, but the day the owner is demoted this is the
        -- line that means the policies still hold.
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I
                 USING (app_is_platform() OR tenant_id = app_current_tenant())
                 WITH CHECK (app_is_platform() OR tenant_id = app_current_tenant())',
            t
        );
    END LOOP;
END
$tenant_tables$;

-- --------------------------------------------------------------------
-- 4. Identity: the three tables a request must reach before it has a tenant
-- --------------------------------------------------------------------
-- Sign-in looks a user up by name across pharmacies, because a username is
-- only unique within one. Refresh finds a token by its hash. Registration
-- creates a pharmacy and its first administrator, neither of which can be
-- scoped to a session that does not exist yet.
--
-- These three therefore also answer to app.auth_lookup. Every OTHER read of
-- these tables — the staff list, the profile, the pharmacy's own settings —
-- runs without it and is scoped exactly like the data tables above.
DO $identity_tables$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['tenants', 'users', 'refresh_tokens']
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I
                 USING (app_is_platform() OR app_is_auth_lookup()
                        OR tenant_id = app_current_tenant())
                 WITH CHECK (app_is_platform() OR app_is_auth_lookup()
                        OR tenant_id = app_current_tenant())',
            t
        );
    END LOOP;
END
$identity_tables$;

-- --------------------------------------------------------------------
-- 5. Child rows, which carry no tenant_id of their own
-- --------------------------------------------------------------------
-- sale_items, prescription_items and purchase_order_items are reached through
-- their parent and were never given a tenant_id. Rather than add one — which
-- would introduce a second copy of the same fact, free to disagree with the
-- first — each policy asks whether the parent row is visible. The parent's own
-- policy answers, because a subquery inside a policy is itself subject to RLS.
DROP POLICY IF EXISTS tenant_isolation ON sale_items;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sale_items
    USING (EXISTS (SELECT 1 FROM sales s WHERE s.sale_id = sale_items.sale_id))
    WITH CHECK (EXISTS (SELECT 1 FROM sales s WHERE s.sale_id = sale_items.sale_id));

DROP POLICY IF EXISTS tenant_isolation ON prescription_items;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON prescription_items
    USING (EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.prescription_id = prescription_items.prescription_id))
    WITH CHECK (EXISTS (
        SELECT 1 FROM prescriptions p
        WHERE p.prescription_id = prescription_items.prescription_id));

DROP POLICY IF EXISTS tenant_isolation ON purchase_order_items;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON purchase_order_items
    USING (EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.po_id = purchase_order_items.po_id))
    WITH CHECK (EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.po_id = purchase_order_items.po_id));

-- --------------------------------------------------------------------
-- 6. Nothing may be left unprotected
-- --------------------------------------------------------------------
-- A table added later and forgotten here would be readable across every
-- pharmacy on the platform, and nothing would say so. This makes that a
-- migration failure rather than a silent hole.
DO $completeness$
DECLARE
    unprotected text;
BEGIN
    SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
      INTO unprotected
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND NOT c.relrowsecurity;

    IF unprotected IS NOT NULL THEN
        RAISE EXCEPTION
            'These tables have no row-level security: %. Add them to rls_policies.sql, '
            'or state in the file why they are not tenant data.', unprotected;
    END IF;
END
$completeness$;
