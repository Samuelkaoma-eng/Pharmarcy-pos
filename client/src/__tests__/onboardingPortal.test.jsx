import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// The applicant's page is public and has no session behind it, so its two calls
// carry the token from the link rather than a stored one. Only those two are
// mocked here; the page itself is the real one.
vi.mock('../api/client', () => ({
  getWithToken: vi.fn(),
  uploadWithToken: vi.fn()
}));

import { getWithToken } from '../api/client';
import OnboardingPortal from '../pages/OnboardingPortal';

const TENANT_ID = '7bc57f8f-1a87-4860-8a54-2683109b2617';

const REQUIRED_TYPES = [
  'PACRA_CERTIFICATE',
  'TPIN_CERTIFICATE',
  'PHARMACIST_PRACTISING',
  'PHARMACIST_ID',
  'PREMISES_PROOF',
  'PREMISES_FLOOR_PLAN',
  'ZAMRA_INSPECTION'
];

const statusPayload = (overrides = {}) => ({
  tenant: {
    tenant_id: TENANT_ID,
    name: 'Kabwe Community Pharmacy',
    status: 'UNDER_REVIEW',
    owner_email: 'owner@kabwecommunity.zm'
  },
  required_types: REQUIRED_TYPES,
  documents: [],
  readiness: { total: 0, verified: 0, rejected: 0, pending: 0, required: 7, missing: REQUIRED_TYPES },
  can_upload: true,
  ...overrides
});

const renderPortal = (token = 'link-token') =>
  render(
    <MemoryRouter initialEntries={[`/onboarding/${TENANT_ID}${token ? `?token=${token}` : ''}`]}>
      <Routes>
        <Route path="/onboarding/:tenantId" element={<OnboardingPortal />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe('the onboarding page an applying pharmacy is sent', () => {
  it('lists every required document, filed or not', async () => {
    getWithToken.mockResolvedValue({ data: statusPayload() });
    renderPortal();

    expect(await screen.findByText('Kabwe Community Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('PACRA certificate of incorporation')).toBeInTheDocument();
    expect(screen.getByText('ZAMRA pre-licensing inspection')).toBeInTheDocument();
    expect(screen.getAllByText('NOT FILED').length).toEqual(7);
  });

  // The reviewer's reason is the whole value of a decline. Without it the
  // applicant is told they failed and not told what to change.
  it('shows the reviewer reason against a rejected document', async () => {
    getWithToken.mockResolvedValue({
      data: statusPayload({
        tenant: {
          tenant_id: TENANT_ID,
          name: 'Kabwe Community Pharmacy',
          status: 'REJECTED',
          owner_email: 'owner@kabwecommunity.zm'
        },
        documents: [
          {
            document_id: 'd1',
            document_type: 'ZAMRA_INSPECTION',
            file_name: 'zamra.pdf',
            status: 'REJECTED',
            review_notes: 'The inspection report is unsigned.'
          }
        ],
        readiness: { total: 1, verified: 0, rejected: 1, pending: 0, required: 7, missing: REQUIRED_TYPES }
      })
    });

    renderPortal();

    expect(await screen.findByText('Some documents were not accepted')).toBeInTheDocument();
    expect(screen.getByText('The inspection report is unsigned.')).toBeInTheDocument();
  });

  // An approved pharmacy signs in from now on, so the page stops offering to
  // take documents it would be refused.
  it('points an approved pharmacy at sign-in and withdraws the upload controls', async () => {
    getWithToken.mockResolvedValue({
      data: statusPayload({
        tenant: {
          tenant_id: TENANT_ID,
          name: 'Kabwe Community Pharmacy',
          status: 'ACTIVE',
          owner_email: 'owner@kabwecommunity.zm'
        },
        readiness: { total: 7, verified: 7, rejected: 0, pending: 0, required: 7, missing: [] },
        can_upload: false
      })
    });

    renderPortal();

    expect(await screen.findByText('Sign in to your pharmacy')).toBeInTheDocument();
    expect(screen.queryByText('Upload')).not.toBeInTheDocument();
  });

  it('says so plainly when the link carries no token', async () => {
    renderPortal(null);

    expect(await screen.findByText('This link cannot be opened')).toBeInTheDocument();
    expect(getWithToken).not.toHaveBeenCalled();
  });

  it('reports an expired link rather than rendering an empty page', async () => {
    getWithToken.mockResolvedValue({ error: 'This onboarding link is invalid or has expired' });
    renderPortal();

    expect(await screen.findByText('This link cannot be opened')).toBeInTheDocument();
    expect(
      screen.getByText('This onboarding link is invalid or has expired')
    ).toBeInTheDocument();
  });
});
