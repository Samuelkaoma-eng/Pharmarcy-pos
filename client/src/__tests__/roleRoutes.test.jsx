import { describe, it, expect } from 'vitest';
import { canAccess, NAV_ITEMS } from '../constants/navigation';

// The sidebar hid what a role could not use, but hiding a link is not a
// control: the router rendered any page to anyone who typed its address, so a
// cashier could open Staff & Roles and read the staff list. Both now read this
// one declaration, so they cannot disagree.
describe('who may open which page', () => {
  it('keeps a cashier out of the pages meant for others', () => {
    expect(canAccess('/staff', 'Cashier')).toBe(false);
    expect(canAccess('/settings', 'Cashier')).toBe(false);
    expect(canAccess('/reports', 'Cashier')).toBe(false);
    expect(canAccess('/inventory', 'Cashier')).toBe(false);
    expect(canAccess('/prescriptions', 'Cashier')).toBe(false);
  });

  it('lets a cashier do the job they are there to do', () => {
    expect(canAccess('/pos', 'Cashier')).toBe(true);
    expect(canAccess('/sales', 'Cashier')).toBe(true);
    expect(canAccess('/till', 'Cashier')).toBe(true);
    expect(canAccess('/dashboard', 'Cashier')).toBe(true);
  });

  it('keeps a pharmacist out of Admin-only pages but not their own work', () => {
    expect(canAccess('/staff', 'Pharmacist')).toBe(false);
    expect(canAccess('/settings', 'Pharmacist')).toBe(false);
    expect(canAccess('/reports', 'Pharmacist')).toBe(false);
    expect(canAccess('/inventory', 'Pharmacist')).toBe(true);
    expect(canAccess('/prescriptions', 'Pharmacist')).toBe(true);
  });

  it('keeps a doctor out of the till and the stockroom', () => {
    expect(canAccess('/pos', 'Doctor')).toBe(false);
    expect(canAccess('/till', 'Doctor')).toBe(false);
    expect(canAccess('/triage', 'Doctor')).toBe(true);
    expect(canAccess('/patients', 'Doctor')).toBe(true);
  });

  it('lets an Admin open everything the workspace has', () => {
    for (const item of NAV_ITEMS) {
      expect(canAccess(item.path, 'Admin')).toBe(true);
    }
  });

  // A role that is absent, or one nobody thought of, must not be treated as
  // permitted on a restricted page.
  it('refuses a restricted page to an unknown or missing role', () => {
    expect(canAccess('/staff', undefined)).toBe(false);
    expect(canAccess('/settings', 'Intern')).toBe(false);
  });
});
