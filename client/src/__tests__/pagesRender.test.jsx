import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The API is mocked, not the components. The point of these tests is that the
// real page renders real data without throwing, which is exactly what the
// server-side suite cannot tell us.
vi.mock('../api/client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  upload: vi.fn(),
  blob: vi.fn()
}));

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    promise: vi.fn()
  })
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { username: 'cashier', full_name: 'Samuel Kaoma', role: 'Cashier' },
    token: 'test-token',
    tenant: { name: 'Central Care Pharmacy', currency_symbol: 'K', theme_color: '#3b82f6' },
    currency: 'K',
    pharmacyName: 'Central Care Pharmacy',
    checking: false,
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    refreshTenant: vi.fn()
  })
}));

import { get } from '../api/client';
import Inventory from '../pages/Inventory';
import SalesHistory from '../pages/SalesHistory';
import POSCheckout from '../pages/POSCheckout';

const PRODUCTS = [
  {
    product_id: 'p1',
    name: 'Paracetamol 500mg',
    barcode: '600123456701',
    selling_price: '25.00',
    cost_price: '10.00',
    quantity_on_hand: 120,
    reorder_level: 20,
    requires_prescription: false,
    vat_treatment: 'ZERO_RATED',
    category: 'Analgesic',
    dosage: '500mg'
  }
];

const SALES = [
  {
    sale_id: 's1',
    receipt_number: 'CC-20260804-0001',
    date_time: '2026-08-04T10:00:00.000Z',
    subtotal: '50.00',
    tax_amount: '0.00',
    total: '50.00',
    status: 'COMPLETED',
    payment_type: 'cash',
    served_by: 'Samuel Kaoma'
  }
];

const PATIENTS = [
  { customer_id: 'c1', name: 'Chipego Mukimba', phone: '+260965111222' }
];

// Cover on file for the patient above, at the rate the seed uses.
const COVERAGE = {
  scheme_id: 'sch1',
  name: 'Madison Health',
  cover_percent: '80.00',
  member_number: 'MAD-4417-002'
};

const routeTo = (payloads) => {
  get.mockImplementation((path) => {
    for (const [prefix, data] of Object.entries(payloads)) {
      if (path.startsWith(prefix)) return Promise.resolve({ data });
    }
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pages render against real data without throwing', () => {
  // DEF-038. The page used `currency` without reading it from context, threw on
  // its first row, and rendered blank. The production build passed.
  it('Inventory renders its rows', async () => {
    routeTo({ products: PRODUCTS });
    render(<Inventory />);
    expect(await screen.findByText(/Paracetamol 500mg/)).toBeInTheDocument();
  });

  // DEF-043. The same defect, unfixed in a second file, and again only found by
  // a person opening the page.
  it('SalesHistory renders its rows', async () => {
    routeTo({ sales: SALES });
    render(<SalesHistory />);
    expect(await screen.findByText(/CC-20260804-0001/)).toBeInTheDocument();
  });

  it('POSCheckout renders the till', async () => {
    routeTo({ products: PRODUCTS, patients: PATIENTS });
    render(<POSCheckout />);
    expect(await screen.findByText(/Paracetamol 500mg/)).toBeInTheDocument();
  });
});

describe('the till can apply insurance cover', () => {
  it('offers a patient to attach to the sale', async () => {
    routeTo({ products: PRODUCTS, patients: PATIENTS });
    render(<POSCheckout />);

    // Without this control the server can never resolve cover, because the sale
    // carries no customer. That was the whole of usability risk U7.
    expect(await screen.findByText(/Walk-in — no patient recorded/)).toBeInTheDocument();
    expect(await screen.findByText(/Chipego Mukimba/)).toBeInTheDocument();
  });

  it('shows nothing about cover until a patient is chosen', async () => {
    routeTo({ products: PRODUCTS, patients: PATIENTS });
    render(<POSCheckout />);
    await screen.findByText(/Walk-in — no patient recorded/);

    // A walk-in is not "not covered", it is nobody. Neither answer should show.
    expect(screen.queryByText(/Madison Health/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No active cover on file/)).not.toBeInTheDocument();
  });

  it('reports the scheme and its rate once a covered patient is chosen', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    routeTo({ products: PRODUCTS, patients: PATIENTS, 'insurance/coverage/': COVERAGE });

    render(<POSCheckout />);
    await screen.findByText(/Chipego Mukimba/);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1');

    await waitFor(() => {
      expect(screen.getByText(/Madison Health · covers 80%/)).toBeInTheDocument();
    });
  });

  it('says so plainly when the patient has no cover', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    get.mockImplementation((path) => {
      if (path.startsWith('products')) return Promise.resolve({ data: PRODUCTS });
      if (path.startsWith('patients')) return Promise.resolve({ data: PATIENTS });
      // The endpoint answers with a null body for an uncovered patient. That is
      // an answer, and must not be shown the same way as never having asked.
      if (path.startsWith('insurance/coverage/')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: [] });
    });

    render(<POSCheckout />);
    await screen.findByText(/Chipego Mukimba/);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1');

    await waitFor(() => {
      expect(screen.getByText(/No active cover on file/)).toBeInTheDocument();
    });
  });

  it('reports that cover could not be checked when the lookup fails', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    get.mockImplementation((path) => {
      if (path.startsWith('products')) return Promise.resolve({ data: PRODUCTS });
      if (path.startsWith('patients')) return Promise.resolve({ data: PATIENTS });
      if (path.startsWith('insurance/coverage/')) return Promise.reject(new Error('network'));
      return Promise.resolve({ data: [] });
    });

    render(<POSCheckout />);
    await screen.findByText(/Chipego Mukimba/);

    await userEvent.selectOptions(screen.getByRole('combobox'), 'c1');

    // Fail closed. A failed lookup is not evidence of no cover, and the till
    // must not quietly bill the patient in full as though it had checked.
    await waitFor(() => {
      expect(screen.getByText(/Cover could not be checked/)).toBeInTheDocument();
    });
  });
});
