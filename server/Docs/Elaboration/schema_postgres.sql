CREATE TABLE IF NOT EXISTS tenants (
  tenant_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  license_number VARCHAR(100),
  status VARCHAR(50) DEFAULT 'REGISTERED', -- REGISTERED/SUBMITTED/UNDER_REVIEW/APPROVED/ACTIVE/REJECTED
  theme_color VARCHAR(20) DEFAULT '#000000',
  logo_url TEXT,
  currency_symbol VARCHAR(10) DEFAULT 'ZMW',
  owner_email VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id),
  username VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, username)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  nrc VARCHAR(50),
  gender VARCHAR(20),
  dob DATE,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
  doctor_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  name VARCHAR(255) NOT NULL,
  specialty VARCHAR(100),
  phone VARCHAR(50),
  license_number VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  product_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  barcode VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  category VARCHAR(100),
  cost_price DECIMAL(10, 2),
  selling_price DECIMAL(10, 2),
  unit_of_measure VARCHAR(50),
  requires_prescription BOOLEAN DEFAULT FALSE,
  state VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE/DISCONTINUED
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_batches (
  batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(product_id) NOT NULL,
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  batch_number VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  initial_quantity INT NOT NULL,
  quantity_on_hand INT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  product_id UUID REFERENCES products(product_id) NOT NULL,
  batch_id UUID REFERENCES product_batches(batch_id),
  quantity INT NOT NULL, -- signed int, + for receive, - for dispense
  movement_type VARCHAR(50) NOT NULL, -- RECEIVE/DISPENSE/ADJUSTMENT/RETURN/EXPIRED
  performed_by_id UUID REFERENCES users(user_id),
  reference_id UUID, -- Optional link to sale or other reference
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS visits (
  visit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  customer_id UUID REFERENCES customers(customer_id) NOT NULL,
  doctor_id UUID REFERENCES doctors(doctor_id),
  date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  reason TEXT,
  status VARCHAR(50) DEFAULT 'WAITING', -- WAITING/TRIAGE/IN_PROGRESS/COMPLETED/CANCELLED
  queue_number INT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vitals (
  vitals_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  visit_id UUID REFERENCES visits(visit_id) NOT NULL,
  customer_id UUID REFERENCES customers(customer_id) NOT NULL,
  bp VARCHAR(20),
  heart_rate INT,
  temperature DECIMAL(5, 2),
  spo2 INT,
  weight DECIMAL(5, 2),
  recorded_by_id UUID REFERENCES users(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescriptions (
  prescription_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  doctor_id UUID REFERENCES doctors(doctor_id) NOT NULL,
  customer_id UUID REFERENCES customers(customer_id) NOT NULL,
  visit_id UUID REFERENCES visits(visit_id),
  valid_until DATE,
  notes TEXT,
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING/VERIFIED/DISPENSED/EXPIRED
  verified_by_id UUID REFERENCES users(user_id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prescription_items (
  prescription_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID REFERENCES prescriptions(prescription_id) NOT NULL,
  product_id UUID REFERENCES products(product_id) NOT NULL,
  dosage_instructions TEXT,
  quantity INT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales (
  sale_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  receipt_number VARCHAR(100) NOT NULL UNIQUE,
  date_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  status VARCHAR(50) DEFAULT 'COMPLETED',
  user_id UUID REFERENCES users(user_id),
  customer_id UUID REFERENCES customers(customer_id),
  prescription_id UUID REFERENCES prescriptions(prescription_id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  sale_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES sales(sale_id) NOT NULL,
  product_id UUID REFERENCES products(product_id) NOT NULL,
  batch_id UUID REFERENCES product_batches(batch_id),
  unit_price DECIMAL(10, 2) NOT NULL,
  quantity INT NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  payment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  sale_id UUID REFERENCES sales(sale_id) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_type VARCHAR(50) NOT NULL,
  reference_code VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS onboarding_documents (
  document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(tenant_id) NOT NULL,
  document_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING', -- PENDING/VERIFIED/REJECTED
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
