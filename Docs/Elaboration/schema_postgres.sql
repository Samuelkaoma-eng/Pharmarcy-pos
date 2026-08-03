-- ====================================================================
-- PHARMACY POS SYSTEM - COMPLETE POSTGRESQL SCHEMA
-- Group 16 - Advanced Software Engineering (CSC4630)
-- ====================================================================

-- Drop tables in dependency order
DROP TABLE IF EXISTS onboarding_documents CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS sale_items CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS prescription_items CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS vitals CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS product_batches CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS doctors CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, username)
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
CREATE TABLE doctors (
    doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    specialty VARCHAR(100),
    phone VARCHAR(20),
    license_number VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
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
CREATE TABLE visits (
    visit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(customer_id),
    doctor_id UUID REFERENCES doctors(doctor_id),
    date DATE DEFAULT CURRENT_DATE,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'WAITING' CHECK (status IN ('WAITING','TRIAGE','IN_PROGRESS','COMPLETED','CANCELLED')),
    queue_number INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
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
    prescription_id UUID REFERENCES prescriptions(prescription_id)
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
CREATE TABLE onboarding_documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    document_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES
CREATE INDEX idx_products_tenant ON products(tenant_id);
CREATE INDEX idx_products_barcode ON products(tenant_id, barcode);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_visits_tenant_date ON visits(tenant_id, date);
CREATE INDEX idx_sales_tenant ON sales(tenant_id);
CREATE INDEX idx_sales_receipt ON sales(receipt_number);
