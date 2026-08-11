// The compliance paperwork ZAMRA requires to license a retail pharmacy in
// Zambia. The list itself comes from the server so the two cannot drift; these
// are the human labels for it, held once because the applicant's own onboarding
// page and the ControlHub reviewer's queue both name the same seven documents.
export const DOC_LABELS = {
  PACRA_CERTIFICATE: 'PACRA certificate of incorporation',
  TPIN_CERTIFICATE: 'ZRA TPIN certificate',
  PHARMACIST_PRACTISING: 'HPCZ practising certificate',
  PHARMACIST_ID: 'Pharmacist identification',
  PREMISES_PROOF: 'Premises ownership or lease',
  PREMISES_FLOOR_PLAN: 'Premises floor plan',
  ZAMRA_INSPECTION: 'ZAMRA pre-licensing inspection'
};

// Shown to the applicant, who is filing these for the first time and cannot be
// assumed to know which office issues what.
export const DOC_HINTS = {
  PACRA_CERTIFICATE: 'Issued by PACRA when the business was registered.',
  TPIN_CERTIFICATE: 'Your ZRA taxpayer identification certificate.',
  PHARMACIST_PRACTISING: 'The current HPCZ practising certificate of the pharmacist in charge.',
  PHARMACIST_ID: 'NRC or passport of the pharmacist in charge.',
  PREMISES_PROOF: 'Title deed, or the signed lease for the premises.',
  PREMISES_FLOOR_PLAN: 'Layout showing the dispensary and the storage area.',
  ZAMRA_INSPECTION: 'The pre-licensing inspection report from ZAMRA.'
};

export const docLabel = (type) => DOC_LABELS[type] || type;

export const ACCEPTED_FILES = '.pdf,.jpg,.jpeg,.png,.webp';
export const ACCEPTED_DESCRIPTION = 'PDF, JPEG, PNG or WebP, up to 10 MB.';
