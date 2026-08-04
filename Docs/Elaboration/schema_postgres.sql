-- ====================================================================
-- PHARMACY POS SYSTEM - COMPLETE POSTGRESQL SCHEMA
-- Group 16 - Advanced Software Engineering (CSC4630)
-- ====================================================================

-- Drop tables in dependency order
DROP TABLE IF EXISTS patient_recalls CASCADE;
DROP TABLE IF EXISTS scheme_memberships CASCADE;
DROP TABLE IF EXISTS insurance_schemes CASCADE;
DROP TABLE IF EXISTS purchase_order_items CASCADE;
DROP TABLE IF EXISTS purchase_orders CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS onboarding_documents CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS till_sessions CASCADE;
DROP TABLE IF EXISTS prescription_items CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS vitals CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS product_batches CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- 1. TENANTS
CREATE TABLE tenants (
    tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    license_number VARCHAR(50),
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('REGISTERED','SUBMITTED','UNDER_REVIEW','APPROVED','ACTIVE','REJECTED')),
    -- Branding, owned by the pharmacy itself.
    theme_color VARCHAR(20) DEFAULT '#3b82f6',
    logo_url TEXT,
    currency_symbol VARCHAR(10) DEFAULT 'K',
    owner_email VARCHAR(100),
    -- Operational settings, owned by the platform via ControlHub. A pharmacy
    -- can read these but may not change them itself.
    expiry_alert_days INT DEFAULT 90 CHECK (expiry_alert_days BETWEEN 7 AND 365),
    low_stock_alerts BOOLEAN DEFAULT TRUE,
    require_customer_on_sale BOOLEAN DEFAULT FALSE,
    -- When on, a sale is refused unless the cashier has an open till session,
    -- so every taking is attributable to a shift that must later be counted.
    -- Off by default: a pharmacy that has not adopted till control keeps
    -- working exactly as before.
    require_till_session BOOLEAN DEFAULT FALSE,
    allow_public_registration BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. USERS
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('SuperAdmin','Admin','Pharmacist','Doctor','Cashier')),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, username)
);

-- 2a. REFRESH TOKENS
-- Sessions that can actually be ended.
--
-- The refresh token was previously a stateless JWT with a seven-day life. It
-- could not be revoked, so signing out cleared the browser and left the token
-- working; a copied one stayed valid for a week whatever the pharmacy did.
--
-- Each token is stored only as a SHA-256 hash, so the table is useless to
-- anyone who reads it. Every sign-in starts a new *family*, and each refresh
-- consumes the token presented and issues its successor in the same family.
-- Rotation is what makes theft detectable: the thief and the real user cannot
-- both keep using one chain, so whichever presents an already-spent token
-- reveals the theft. At that point it is unknowable which party is which, so
-- the whole family is revoked rather than the single token replayed.
CREATE TABLE refresh_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    -- SHA-256 of the value handed to the browser. The raw token is never stored.
    token_hash CHAR(64) NOT NULL UNIQUE,
    -- One chain per sign-in, so revoking one device leaves the others alone.
    family_id UUID NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    -- Set when this link is exchanged. A second presentation of a spent token
    -- is a replay, not a refresh.
    used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    -- Recorded so a suspicious chain can be recognised after the fact.
    ip VARCHAR(64),
    user_agent TEXT
);

-- 3. CUSTOMERS (Patients)
CREATE TABLE customers (
    customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(100),
    nrc VARCHAR(30),
    gender VARCHAR(10),
    dob DATE,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DOCTORS
-- A prescriber. Two kinds exist and the difference matters: a doctor who works
-- at this pharmacy has a login and can be handed a queue, while one who wrote a
-- prescription at a clinic elsewhere is a name on paper with no account. The
-- nullable user_id is what separates them.
CREATE TABLE doctors (
    doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100),
    phone VARCHAR(20),
    license_number VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- One account cannot be two prescribers in the same pharmacy.
    UNIQUE(tenant_id, user_id)
);

-- 5. PRODUCTS
CREATE TABLE products (
    product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    barcode VARCHAR(50),
    name VARCHAR(150) NOT NULL,
    dosage VARCHAR(50),
    category VARCHAR(50),
    cost_price NUMERIC(10,2) DEFAULT 0,
    selling_price NUMERIC(10,2) NOT NULL DEFAULT 0,
    unit_of_measure VARCHAR(30) DEFAULT 'tablet',
    requires_prescription BOOLEAN DEFAULT FALSE,
    reorder_level INT DEFAULT 10,
    state VARCHAR(20) DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','DISCONTINUED')),
    -- Medicines and drugs fall under Group 6 of the Zambian VAT (Zero-Rating)
    -- Order, so they carry no VAT. Sundries sold alongside them do. Charging a
    -- flat 16% on everything overcharged the customer on every dispensed item,
    -- which is why this is per product and defaults to zero-rated.
    vat_treatment VARCHAR(20) NOT NULL DEFAULT 'ZERO_RATED'
        CHECK (vat_treatment IN ('ZERO_RATED','STANDARD','EXEMPT')),
    -- Reference data pulled from the openFDA NDC directory when the product
    -- was created, kept so the catalogue entry is traceable to a source.
    generic_name VARCHAR(150),
    manufacturer VARCHAR(150),
    ndc_code VARCHAR(20),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PRODUCT BATCHES
CREATE TABLE product_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    batch_number VARCHAR(50),
    expiry_date DATE NOT NULL,
    initial_quantity INT NOT NULL DEFAULT 0,
    quantity_on_hand INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. STOCK MOVEMENTS (Audit-first ledger)
CREATE TABLE stock_movements (
    movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    batch_id UUID REFERENCES product_batches(batch_id),
    quantity INT NOT NULL, -- signed: +receive, -dispense
    movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('RECEIVE','DISPENSE','ADJUSTMENT','RETURN','EXPIRED')),
    performed_by_id UUID REFERENCES users(user_id),
    reference_id VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. VISITS (Triage/Consultations)
-- One patient's passage through the clinic side of the pharmacy. The status is
-- the station they have reached, and the system advances it as the work is
-- done rather than leaving staff to set it by hand:
--
--   WAITING   -> registered at reception, nobody has seen them
--   TRIAGE    -> vitals taken (set automatically when vitals are recorded)
--   IN_PROGRESS -> a doctor has been assigned and is seeing them
--   DISPENSING  -> consultation over, prescription sent to the counter
--   COMPLETED   -> dispensed and paid for
--
-- Without a DISPENSING state nobody could tell where a patient was between the
-- consulting room and the till, which is the gap that made the queue advisory.
CREATE TABLE visits (
    visit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(customer_id),
    doctor_id UUID REFERENCES doctors(doctor_id),
    date DATE DEFAULT CURRENT_DATE,
    reason TEXT,
    -- What the clinician concluded. Free text, recorded by the person who saw
    -- the patient. It is a record of what was assessed, never a computed
    -- diagnosis.
    assessment TEXT,
    status VARCHAR(20) DEFAULT 'WAITING'
        CHECK (status IN ('WAITING','TRIAGE','IN_PROGRESS','DISPENSING','COMPLETED','CANCELLED')),
    queue_number INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- 9. VITALS
CREATE TABLE vitals (
    vitals_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    visit_id UUID NOT NULL REFERENCES visits(visit_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(customer_id),
    bp VARCHAR(20),
    heart_rate VARCHAR(20),
    temperature VARCHAR(20),
    spo2 VARCHAR(20),
    weight VARCHAR(20),
    recorded_by_id UUID REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. PRESCRIPTIONS
CREATE TABLE prescriptions (
    prescription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    doctor_id UUID REFERENCES doctors(doctor_id),
    customer_id UUID REFERENCES customers(customer_id),
    visit_id UUID REFERENCES visits(visit_id),
    valid_until DATE,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','DISPENSED','EXPIRED')),
    verified_by_id UUID REFERENCES users(user_id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. PRESCRIPTION ITEMS
CREATE TABLE prescription_items (
    prescription_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(prescription_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    dosage_instructions TEXT,
    quantity INT DEFAULT 1
);

-- 11a. TILL SESSIONS
-- A shift at a till. Until this existed a sale belonged to a cashier but not to
-- a shift, so there was no float, no closing count and no cash variance: a
-- drawer could be short and nothing in the system would say so. That is the
-- stock loss the Inception business case set out to reduce, so its absence was
-- the largest gap between what the project promised and what it did (LIM-004).
--
-- Two rules make the reconciliation meaningful, and both are enforced by the
-- server rather than trusted from the client:
--   * expected_cash is computed from the payments actually recorded against
--     this session. A cashier cannot declare what the drawer should hold.
--   * only cash payments count. Card, mobile and insurance settlements never
--     put a note in the drawer, so including them would manufacture a shortfall.
CREATE TABLE till_sessions (
    till_session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    -- The cashier whose shift this is. Named at open and never reassigned.
    user_id UUID NOT NULL REFERENCES users(user_id),
    status VARCHAR(10) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Cash placed in the drawer at the start of the shift.
    opening_float NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
    opening_notes TEXT,
    closed_at TIMESTAMPTZ,
    closed_by_id UUID REFERENCES users(user_id),
    -- Cash physically counted at the end of the shift, as declared by whoever
    -- counted it.
    closing_count NUMERIC(10,2) CHECK (closing_count >= 0),
    -- What the drawer should have held, computed by the server at close.
    expected_cash NUMERIC(10,2),
    -- closing_count - expected_cash. Negative means the drawer is short. It is
    -- stored as it falls out and is never rounded towards zero.
    variance NUMERIC(10,2),
    closing_notes TEXT
);

-- A cashier may hold at most one open session at a time. Enforced by the
-- database rather than by a check in the controller, because a double-open is
-- exactly the race a busy counter would produce.
CREATE UNIQUE INDEX idx_till_one_open_per_user
    ON till_sessions(tenant_id, user_id)
    WHERE status = 'OPEN';

-- 12. SALES
CREATE TABLE sales (
    sale_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) NOT NULL,
    date_time TIMESTAMPTZ DEFAULT NOW(),
    subtotal NUMERIC(10,2) DEFAULT 0,
    tax_amount NUMERIC(10,2) DEFAULT 0,
    total NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'COMPLETED' CHECK (status IN ('PENDING','COMPLETED','REFUNDED','CANCELLED')),
    user_id UUID REFERENCES users(user_id),
    customer_id UUID REFERENCES customers(customer_id),
    prescription_id UUID REFERENCES prescriptions(prescription_id),
    -- The visit this sale settles, where the patient came through the clinic.
    -- Without it the walk-in-to-till trail could only be reconstructed through
    -- the prescription, so a consultation that ended in no prescription left no
    -- link at all.
    visit_id UUID REFERENCES visits(visit_id),
    -- The shift this sale was rung up on. Null for a sale taken outside any
    -- open session, which is legitimate where the pharmacy has not turned till
    -- control on, and is reported as unreconciled rather than hidden.
    till_session_id UUID REFERENCES till_sessions(till_session_id),
    -- What an insurance scheme covered, and what the patient paid themselves.
    -- The foreign key is added once insurance_schemes exists, further down.
    scheme_id UUID,
    scheme_covered NUMERIC(10,2) NOT NULL DEFAULT 0,
    patient_payable NUMERIC(10,2) NOT NULL DEFAULT 0,
    -- The reference of the ZRA Smart Invoice issued for this sale, where one
    -- exists. It is recorded, never generated: this system is not a ZRA
    -- approved invoicing provider, and printing something resembling a Smart
    -- Invoice would put an invalid tax document in a customer's hands.
    smart_invoice_ref VARCHAR(60),
    -- SIMFIS, the simulated fiscalisation service. Deliberately separate
    -- columns: a simulated value must never be able to occupy the field that
    -- holds a genuine reference issued by an approved system.
    simulated_fiscal_ref VARCHAR(60),
    simulated_fiscal_signature VARCHAR(64),
    simulated_fiscal_counter INT,
    simulated_fiscal_at TIMESTAMPTZ
);

-- 13. SALE ITEMS
CREATE TABLE sale_items (
    sale_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(sale_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id),
    batch_id UUID REFERENCES product_batches(batch_id),
    unit_price NUMERIC(10,2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal NUMERIC(10,2) NOT NULL
);

-- 14. PAYMENTS
CREATE TABLE payments (
    payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES sales(sale_id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL,
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('cash','card','mobile','insurance')),
    reference_code VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. ONBOARDING DOCUMENTS
-- Compliance paperwork a pharmacy submits with its application. The document
-- types mirror what ZAMRA actually requires to license a retail pharmacy in
-- Zambia, rather than generic placeholders.
CREATE TABLE onboarding_documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
        'PACRA_CERTIFICATE',        -- Certificate of incorporation / business registration
        'TPIN_CERTIFICATE',         -- ZRA taxpayer identification
        'PHARMACIST_PRACTISING',    -- HPCZ practising certificate of the pharmacist in charge
        'PHARMACIST_ID',            -- NRC / passport of the pharmacist in charge
        'PREMISES_PROOF',           -- Title deed or lease agreement
        'PREMISES_FLOOR_PLAN',      -- Layout of the dispensary and storage
        'ZAMRA_INSPECTION'          -- Pre-licensing inspection report
    )),
    file_name VARCHAR(255) NOT NULL,
    -- The stored file itself. Reviewing paperwork without being able to open it
    -- is not a review, so these are uploaded and served back.
    stored_path TEXT,
    mime_type VARCHAR(100),
    size_bytes INT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
    review_notes TEXT,
    reviewed_by_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. SUPPLIERS
-- Who a pharmacy buys from. Stock previously appeared with no record of its
-- origin, so nothing could be traced back when a batch was recalled.
CREATE TABLE suppliers (
    supplier_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    contact_name VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    tpin VARCHAR(30),
    zamra_licence VARCHAR(50),  -- Wholesalers must themselves be ZAMRA licensed
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- 18. PURCHASE ORDERS
CREATE TABLE purchase_orders (
    po_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    po_number VARCHAR(40) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT','SENT','PARTIALLY_RECEIVED','RECEIVED','CANCELLED')),
    expected_date DATE,
    notes TEXT,
    raised_by_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, po_number)
);

CREATE TABLE purchase_order_items (
    po_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id UUID NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
    quantity_ordered INT NOT NULL CHECK (quantity_ordered > 0),
    quantity_received INT NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
    unit_cost NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- 19. INSURANCE SCHEMES
CREATE TABLE insurance_schemes (
    scheme_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    -- The share the scheme pays; the patient covers the remainder.
    cover_percent NUMERIC(5,2) NOT NULL DEFAULT 100
        CHECK (cover_percent >= 0 AND cover_percent <= 100),
    contact_phone VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, name)
);

-- A patient's membership of a scheme, which is what makes them coverable.
CREATE TABLE scheme_memberships (
    membership_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    scheme_id UUID NOT NULL REFERENCES insurance_schemes(scheme_id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    member_number VARCHAR(60) NOT NULL,
    valid_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(scheme_id, customer_id)
);

-- 20. PATIENT RECALLS
-- Bringing a patient back for a check-up: a chronic review, a course of
-- treatment to follow up, a repeat prescription falling due.
--
-- Reminders are SIMULATED, never sent. This system has no messaging gateway
-- and is not a registered sender with any Zambian network. The simulation
-- follows the SIMFIS precedent exactly: its own columns so a simulated
-- reference can never occupy a field meant for a real one, a `SIMSMS-` prefix
-- on every reference, and a notice on every artefact. A pharmacy that believed
-- a reminder had gone out when it had not would stop chasing a patient who
-- never heard from them, which is worse than sending nothing.
CREATE TABLE patient_recalls (
    recall_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
    -- The visit this follow-up arose from, where it arose from one.
    visit_id UUID REFERENCES visits(visit_id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED','REMINDED','ATTENDED','MISSED','CANCELLED')),
    -- The simulated reminder, in its own columns. Nothing here is a record of
    -- a message any patient actually received.
    simulated_message_ref VARCHAR(60),
    simulated_message_body TEXT,
    simulated_sent_at TIMESTAMPTZ,
    created_by_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. APPROVAL REQUESTS (maker-checker)
-- Sensitive actions are proposed by one administrator and must be approved by
-- a different one. The proposer may never approve their own request, which is
-- enforced in the controller and asserted by the test suite.
CREATE TABLE approval_requests (
    request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    action VARCHAR(60) NOT NULL,
    payload JSONB NOT NULL,
    reason TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    requested_by_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    decided_by_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
    decision_notes TEXT,
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    CONSTRAINT approver_differs_from_requester CHECK (decided_by_id IS NULL OR decided_by_id <> requested_by_id)
);

-- Deferred foreign key: sales is declared before insurance_schemes exists.
ALTER TABLE sales
    ADD CONSTRAINT sales_scheme_fk
    FOREIGN KEY (scheme_id) REFERENCES insurance_schemes(scheme_id) ON DELETE SET NULL;

-- Every stock movement can now name the supplier it came from, which is what
-- makes a batch traceable back to its source during a recall.
ALTER TABLE stock_movements
    ADD COLUMN supplier_id UUID REFERENCES suppliers(supplier_id) ON DELETE SET NULL;

ALTER TABLE product_batches
    ADD COLUMN supplier_id UUID REFERENCES suppliers(supplier_id) ON DELETE SET NULL;

-- INDEXES
CREATE INDEX idx_documents_tenant ON onboarding_documents(tenant_id);
CREATE INDEX idx_approvals_status ON approval_requests(status);
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id);
CREATE INDEX idx_po_tenant_status ON purchase_orders(tenant_id, status);
CREATE INDEX idx_memberships_customer ON scheme_memberships(customer_id);
CREATE INDEX idx_recalls_due ON patient_recalls(tenant_id, due_date, status);
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_barcode ON products(tenant_id, barcode);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_visits_tenant_date ON visits(tenant_id, date);
CREATE INDEX idx_visits_doctor ON visits(doctor_id, status);
CREATE INDEX idx_doctors_user ON doctors(user_id);
CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_receipt ON sales(receipt_number);
CREATE INDEX idx_sales_till_session ON sales(till_session_id);
CREATE INDEX idx_refresh_family ON refresh_tokens(family_id);
CREATE INDEX idx_refresh_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_till_sessions_tenant ON till_sessions(tenant_id, status, opened_at DESC);
