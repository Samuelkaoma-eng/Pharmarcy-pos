-- ====================================================================
-- PHARMACY POS SYSTEM - SEED DATA FOR POSTGRESQL (VALID UUIDs & BCRYPT HASHES)
-- Group 16 - Advanced Software Engineering (CSC4630)
-- ====================================================================

-- 1. Insert Tenants
-- The platform tenant owns the ControlHub SuperAdmin account. It is not a
-- trading pharmacy and holds no products, patients, or sales.
INSERT INTO tenants (tenant_id, name, address, phone, license_number, status, theme_color, currency_symbol, owner_email)
VALUES ('00000000-0000-0000-0000-0000000000ff', 'Platform Operations', 'Group 16 ControlHub', '+260970000000', 'PLATFORM-000', 'ACTIVE', '#0f172a', 'K', 'platform@group16pos.zm')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO tenants (tenant_id, name, address, phone, license_number, status, theme_color, currency_symbol, owner_email)
VALUES ('11111111-1111-1111-1111-111111111111', 'Central Care Pharmacy', '123 Great East Road, Lusaka, Zambia', '+260971234567', 'PHAR-ZM-2026-001', 'ACTIVE', '#3b82f6', 'K', 'owner@centralcare.zm')
ON CONFLICT (tenant_id) DO NOTHING;

-- A second pharmacy, so cross-tenant isolation can be exercised by the tests.
-- It deliberately reuses the usernames above to prove logins stay scoped.
INSERT INTO tenants (tenant_id, name, address, phone, license_number, status, theme_color, currency_symbol, owner_email)
VALUES ('99999999-9999-9999-9999-999999999999', 'Riverside Chemist', '45 Kafue Road, Lusaka, Zambia', '+260962223333', 'PHAR-ZM-2026-002', 'ACTIVE', '#16a34a', 'K', 'owner@riversidechemist.zm')
ON CONFLICT (tenant_id) DO NOTHING;

-- 2. Insert Users (Password: 'password123' bcrypt hash)
INSERT INTO users (user_id, tenant_id, username, password_hash, full_name, role) VALUES
('22222222-2222-2222-2222-2222222222ff', '00000000-0000-0000-0000-0000000000ff', 'superadmin', '$2a$10$VJQWE5WGuYhwUVe7O6N8O.eHZLftg0SPX48HRUMPCcDjfX0hUSSyy', 'Platform Operator', 'SuperAdmin'),
('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111111', 'admin', '$2a$10$VJQWE5WGuYhwUVe7O6N8O.eHZLftg0SPX48HRUMPCcDjfX0hUSSyy', 'System Administrator', 'Admin'),
('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111111', 'pharmacist', '$2a$10$VJQWE5WGuYhwUVe7O6N8O.eHZLftg0SPX48HRUMPCcDjfX0hUSSyy', 'Dr. Blessing Yabe (Pharmacist)', 'Pharmacist'),
('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111111', 'cashier', '$2a$10$VJQWE5WGuYhwUVe7O6N8O.eHZLftg0SPX48HRUMPCcDjfX0hUSSyy', 'Samuel Kaoma (Cashier)', 'Cashier'),
('22222222-2222-2222-2222-222222222901', '99999999-9999-9999-9999-999999999999', 'admin', '$2a$10$VJQWE5WGuYhwUVe7O6N8O.eHZLftg0SPX48HRUMPCcDjfX0hUSSyy', 'Riverside Administrator', 'Admin'),
('22222222-2222-2222-2222-222222222902', '99999999-9999-9999-9999-999999999999', 'riverside_cashier', '$2a$10$VJQWE5WGuYhwUVe7O6N8O.eHZLftg0SPX48HRUMPCcDjfX0hUSSyy', 'Riverside Cashier', 'Cashier')
ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- 2b. A Riverside product, used to prove one tenant cannot reach another's stock.
INSERT INTO products (product_id, tenant_id, barcode, name, dosage, category, cost_price, selling_price, unit_of_measure, requires_prescription, reorder_level) VALUES
('55555555-5555-5555-5555-555555555901', '99999999-9999-9999-9999-999999999999', '600999456701', 'Riverside Paracetamol 500mg', '500mg', 'Pain Relief', 12.50, 27.00, 'tablet', FALSE, 20)
ON CONFLICT (product_id) DO NOTHING;

-- 3. Insert Customers (Patients)
INSERT INTO customers (customer_id, tenant_id, name, phone, email, nrc, gender, dob, address) VALUES
('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'Chipego Mukimba', '+260965111222', 'chipego@example.com', '111222/10/1', 'Female', '1998-05-14', 'Plot 45, Olympia Park, Lusaka'),
('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'Joshua Kamunda', '+260977333444', 'joshua@example.com', '333444/10/1', 'Male', '1995-11-20', 'Plot 12, Roma, Lusaka'),
('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'Maximillan Soko', '+260955555666', 'max@example.com', '555666/10/1', 'Male', '1997-03-08', 'Kalingalinga, Lusaka')
ON CONFLICT (customer_id) DO NOTHING;

-- 4. Insert Doctors
INSERT INTO doctors (doctor_id, tenant_id, name, specialty, phone, license_number) VALUES
('44444444-4444-4444-4444-444444444401', '11111111-1111-1111-1111-111111111111', 'Dr. Martin Phiri', 'General Medicine', '+260977112233', 'HPCZ-MD-4091'),
('44444444-4444-4444-4444-444444444402', '11111111-1111-1111-1111-111111111111', 'Dr. Sarah Banda', 'Pediatrics', '+260966445566', 'HPCZ-MD-5120')
ON CONFLICT (doctor_id) DO NOTHING;

-- 5. Insert Products
INSERT INTO products (product_id, tenant_id, barcode, name, dosage, category, cost_price, selling_price, unit_of_measure, requires_prescription, reorder_level) VALUES
('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111', '600123456701', 'Paracetamol 500mg', '500mg', 'Pain Relief', 12.50, 25.00, 'tablet', FALSE, 20),
('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111', '600123456702', 'Amoxicillin 250mg', '250mg', 'Antibiotic', 45.00, 85.00, 'capsule', TRUE, 10),
('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111111', '600123456703', 'Ibuprofen 400mg', '400mg', 'Anti-inflammatory', 20.00, 40.00, 'tablet', FALSE, 15),
('55555555-5555-5555-5555-555555555504', '11111111-1111-1111-1111-111111111111', '600123456704', 'Cough Syrup (Benylin)', '100ml', 'Cold & Flu', 35.00, 65.00, 'bottle', FALSE, 5),
('55555555-5555-5555-5555-555555555505', '11111111-1111-1111-1111-111111111111', '600123456705', 'Metformin 500mg', '500mg', 'Diabetes', 70.00, 120.00, 'tablet', TRUE, 10)
ON CONFLICT (product_id) DO NOTHING;

-- 6. Insert Product Batches
INSERT INTO product_batches (batch_id, product_id, tenant_id, batch_number, expiry_date, initial_quantity, quantity_on_hand) VALUES
('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111111', 'BATCH-PARA-2026-A', '2027-12-31', 200, 150),
('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111111', 'BATCH-AMOX-2026-B', '2026-11-15', 100, 45),
('66666666-6666-6666-6666-666666666603', '55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111111', 'BATCH-IBU-2026-C', '2027-06-30', 100, 80),
-- Expired cough syrup, kept on file so the checkout expiry guard has a real
-- case to refuse. Dates are relative to CURRENT_DATE so it never lapses back
-- into being sellable as the project ages.
('66666666-6666-6666-6666-666666666604', '55555555-5555-5555-5555-555555555504', '11111111-1111-1111-1111-111111111111', 'BATCH-COUGH-EXPIRED', CURRENT_DATE - INTERVAL '30 days', 60, 40)
ON CONFLICT (batch_id) DO NOTHING;

-- 7. Insert Stock Movements (Audit Ledger)
INSERT INTO stock_movements (movement_id, tenant_id, product_id, batch_id, quantity, movement_type, performed_by_id, notes) VALUES
('77777777-7777-7777-7777-777777777701', '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555501', '66666666-6666-6666-6666-666666666601', 200, 'RECEIVE', '22222222-2222-2222-2222-222222222201', 'Initial stock delivery'),
('77777777-7777-7777-7777-777777777702', '11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555501', '66666666-6666-6666-6666-666666666601', -50, 'DISPENSE', '22222222-2222-2222-2222-222222222203', 'Dispensed for Sale #REC-20260802-1001')
ON CONFLICT (movement_id) DO NOTHING;

-- 8. Insert Visits
INSERT INTO visits (visit_id, tenant_id, customer_id, doctor_id, date, reason, status, queue_number) VALUES
('88888888-8888-8888-8888-888888888801', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', CURRENT_DATE, 'Persistent cough and mild fever', 'IN_PROGRESS', 1),
('88888888-8888-8888-8888-888888888802', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', '44444444-4444-4444-4444-444444444401', CURRENT_DATE, 'Routine blood pressure checkup', 'WAITING', 2)
ON CONFLICT (visit_id) DO NOTHING;

-- 9. Insert Vitals
INSERT INTO vitals (vitals_id, tenant_id, visit_id, customer_id, bp, heart_rate, temperature, spo2, weight, recorded_by_id) VALUES
('99999999-9999-9999-9999-999999999901', '11111111-1111-1111-1111-111111111111', '88888888-8888-8888-8888-888888888801', '33333333-3333-3333-3333-333333333301', '120/80', '72', '37.1', '98%', '65kg', '22222222-2222-2222-2222-222222222202')
ON CONFLICT (vitals_id) DO NOTHING;

-- 10. Insert Prescription
INSERT INTO prescriptions (prescription_id, tenant_id, doctor_id, customer_id, visit_id, valid_until, notes, status, verified_by_id) VALUES
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444401', '33333333-3333-3333-3333-333333333301', '88888888-8888-8888-8888-888888888801', '2026-08-30', 'Take medication with water after meals', 'VERIFIED', '22222222-2222-2222-2222-222222222202')
ON CONFLICT (prescription_id) DO NOTHING;

INSERT INTO prescription_items (prescription_item_id, prescription_id, product_id, dosage_instructions, quantity) VALUES
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '55555555-5555-5555-5555-555555555502', 'Take 1 capsule 3 times daily after meals for 7 days', 1)
ON CONFLICT (prescription_item_id) DO NOTHING;
