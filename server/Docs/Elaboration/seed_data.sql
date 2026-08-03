-- Dummy Tenant
INSERT INTO tenants (tenant_id, name, address, phone, license_number, status, theme_color, currency_symbol, owner_email)
VALUES ('t1000000-0000-0000-0000-000000000001', 'Lusaka Central Pharmacy', '123 Cairo Road, Lusaka', '0971234567', 'PHAR-12345', 'ACTIVE', '#28a745', 'ZMW', 'owner@lusakapharmacy.com')
ON CONFLICT DO NOTHING;

-- Super Admin (No tenant context needed typically, but we can have it for auth testing)
-- Assuming password is 'superadmin123'
INSERT INTO users (user_id, username, password_hash, full_name, role)
VALUES ('u0000000-0000-0000-0000-000000000001', 'superadmin', '$2a$10$7/O5uI2l12345678901234567890123456789012345678901234', 'System Super Admin', 'SuperAdmin')
ON CONFLICT DO NOTHING;

-- Tenant Users
INSERT INTO users (user_id, tenant_id, username, password_hash, full_name, role)
VALUES 
('u1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'admin', '$2a$10$7/O5uI2l12345678901234567890123456789012345678901234', 'Admin User', 'Admin'),
('u1000000-0000-0000-0000-000000000002', 't1000000-0000-0000-0000-000000000001', 'pharmacist1', '$2a$10$7/O5uI2l12345678901234567890123456789012345678901234', 'John Pharmacist', 'Pharmacist'),
('u1000000-0000-0000-0000-000000000003', 't1000000-0000-0000-0000-000000000001', 'cashier1', '$2a$10$7/O5uI2l12345678901234567890123456789012345678901234', 'Mary Cashier', 'Cashier')
ON CONFLICT DO NOTHING;

-- Customers
INSERT INTO customers (customer_id, tenant_id, name, phone, email, nrc, gender, dob, address)
VALUES 
('c1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'Mutinta Banda', '0961111111', 'mutinta@example.com', '111111/11/1', 'Female', '1990-05-15', 'Kabulonga, Lusaka'),
('c1000000-0000-0000-0000-000000000002', 't1000000-0000-0000-0000-000000000001', 'Chanda Mulenga', '0972222222', 'chanda@example.com', '222222/22/2', 'Male', '1985-08-20', 'Matero, Lusaka'),
('c1000000-0000-0000-0000-000000000003', 't1000000-0000-0000-0000-000000000001', 'Kondwani Phiri', '0953333333', 'kondwani@example.com', '333333/33/3', 'Male', '1978-11-10', 'Chilenje, Lusaka')
ON CONFLICT DO NOTHING;

-- Doctors
INSERT INTO doctors (doctor_id, tenant_id, name, specialty, phone, license_number)
VALUES 
('d1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'Dr. Mwape', 'General Practitioner', '0979999999', 'HPCZ-123'),
('d1000000-0000-0000-0000-000000000002', 't1000000-0000-0000-0000-000000000001', 'Dr. Tembo', 'Cardiologist', '0968888888', 'HPCZ-456')
ON CONFLICT DO NOTHING;

-- Products
INSERT INTO products (product_id, tenant_id, barcode, name, dosage, category, cost_price, selling_price, unit_of_measure, requires_prescription)
VALUES 
('p1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', '000001', 'Panadol', '500mg', 'Analgesic', 5.00, 10.00, 'Tablet', false),
('p1000000-0000-0000-0000-000000000002', 't1000000-0000-0000-0000-000000000001', '000002', 'Amoxicillin', '250mg', 'Antibiotic', 15.00, 25.00, 'Capsule', true),
('p1000000-0000-0000-0000-000000000003', 't1000000-0000-0000-0000-000000000001', '000003', 'Losartan', '50mg', 'Antihypertensive', 30.00, 50.00, 'Tablet', true),
('p1000000-0000-0000-0000-000000000004', 't1000000-0000-0000-0000-000000000001', '000004', 'Vitamin C', '1000mg', 'Supplement', 20.00, 35.00, 'Tablet', false),
('p1000000-0000-0000-0000-000000000005', 't1000000-0000-0000-0000-000000000001', '000005', 'Cough Syrup', '100ml', 'Cough & Cold', 25.00, 45.00, 'Bottle', false)
ON CONFLICT DO NOTHING;

-- Product Batches
INSERT INTO product_batches (batch_id, product_id, tenant_id, batch_number, expiry_date, initial_quantity, quantity_on_hand)
VALUES 
('b1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'BATCH-A01', '2025-12-31', 1000, 950),
('b1000000-0000-0000-0000-000000000002', 'p1000000-0000-0000-0000-000000000002', 't1000000-0000-0000-0000-000000000001', 'BATCH-B01', '2024-06-30', 500, 480),
('b1000000-0000-0000-0000-000000000003', 'p1000000-0000-0000-0000-000000000003', 't1000000-0000-0000-0000-000000000001', 'BATCH-C01', '2026-01-15', 300, 300)
ON CONFLICT DO NOTHING;

-- Stock Movements
INSERT INTO stock_movements (tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, notes)
VALUES 
('t1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1000, 'RECEIVE', 'u1000000-0000-0000-0000-000000000001', 'Initial stock entry'),
('t1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', -50, 'DISPENSE', 'u1000000-0000-0000-0000-000000000002', 'Sale'),
('t1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 500, 'RECEIVE', 'u1000000-0000-0000-0000-000000000001', 'Initial stock entry'),
('t1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', -20, 'DISPENSE', 'u1000000-0000-0000-0000-000000000002', 'Sale');

-- Visits
INSERT INTO visits (visit_id, tenant_id, customer_id, doctor_id, status, queue_number, reason)
VALUES 
('v1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'COMPLETED', 1, 'General Checkup'),
('v1000000-0000-0000-0000-000000000002', 't1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002', NULL, 'WAITING', 2, 'Follow-up')
ON CONFLICT DO NOTHING;

-- Vitals
INSERT INTO vitals (tenant_id, visit_id, customer_id, bp, heart_rate, temperature, spo2, weight, recorded_by_id)
VALUES 
('t1000000-0000-0000-0000-000000000001', 'v1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', '120/80', 72, 36.6, 98, 65.5, 'u1000000-0000-0000-0000-000000000002');

-- Prescriptions
INSERT INTO prescriptions (prescription_id, tenant_id, doctor_id, customer_id, visit_id, valid_until, status, verified_by_id)
VALUES 
('pr100000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'v1000000-0000-0000-0000-000000000001', '2024-12-31', 'DISPENSED', 'u1000000-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- Prescription Items
INSERT INTO prescription_items (prescription_id, product_id, dosage_instructions, quantity)
VALUES 
('pr100000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000002', 'Take 1 capsule three times a day after meals', 20);

-- Sales
INSERT INTO sales (sale_id, tenant_id, receipt_number, subtotal, tax_amount, total, status, user_id, customer_id, prescription_id)
VALUES 
('s1000000-0000-0000-0000-000000000001', 't1000000-0000-0000-0000-000000000001', 'REC-00001', 500.00, 0, 500.00, 'COMPLETED', 'u1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'pr100000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Sale Items
INSERT INTO sale_items (sale_id, product_id, batch_id, unit_price, quantity, subtotal)
VALUES 
('s1000000-0000-0000-0000-000000000001', 'p1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 25.00, 20, 500.00);

-- Payments
INSERT INTO payments (tenant_id, sale_id, amount, payment_type, reference_code)
VALUES 
('t1000000-0000-0000-0000-000000000001', 's1000000-0000-0000-0000-000000000001', 500.00, 'CARD', 'REF-9999');
