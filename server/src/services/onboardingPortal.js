const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { REQUIRED_TYPES } = require('./onboardingReadiness');

// A pharmacy applies before it has an account it could sign in with, so the
// link it is sent has to carry its own authority. This token does two things
// and nothing else: it files compliance paperwork for one named pharmacy, and
// it reads that same pharmacy's application status. It cannot sign in, it
// cannot reach another pharmacy, and the upload route refuses it once the
// application has been decided.
const PURPOSE = 'onboarding_documents';

// Long enough to survive a review cycle. A rejected document has to be replaced
// by the applicant days later, and a link that expired overnight would strand
// them with no way back in.
const TTL = process.env.ONBOARDING_LINK_TTL || '14d';

// Where the applicant's browser lands.
//
// This is the host written into the link the pharmacy is sent, so getting it
// wrong is not cosmetic: the deployed build published `http://localhost:3000`
// links, which resolve to the reader's own machine and reach nothing. The
// in-app button still worked, because it is reduced to a path before being
// followed — which is precisely what made the fault easy to miss, since the
// only broken copy was the one an applicant would actually receive.
//
// Resolved in order of how much the deployment knows about itself:
//   APP_URL                — set it when the client is served from elsewhere;
//   RAILWAY_PUBLIC_DOMAIN  — supplied by the platform, so a deployment is
//                            correct with no configuration and stays correct
//                            if the domain is changed;
//   localhost              — the Vite dev server in client/vite.config.js.
const appUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return 'http://localhost:3000';
};

const mintToken = (tenantId) =>
  jwt.sign({ tenantId, purpose: PURPOSE }, JWT_SECRET, { expiresIn: TTL });

// Returns the decoded token, or throws with a message fit to show the holder of
// a link that no longer works.
const verifyToken = (token, tenantId) => {
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('This onboarding link is invalid or has expired');
  }

  // A token minted for one pharmacy must not open another's application, and an
  // ordinary sign-in token must not be usable here.
  if (decoded.purpose !== PURPOSE || decoded.tenantId !== tenantId) {
    throw new Error('This onboarding link does not belong to that pharmacy');
  }
  return decoded;
};

const portalLink = (tenantId, token) =>
  `${appUrl()}/onboarding/${tenantId}?token=${encodeURIComponent(token)}`;

const signInLink = () => `${appUrl()}/login`;

// ---------------------------------------------------------------------------
// The notifications, simulated
// ---------------------------------------------------------------------------
// There is no mail transport in this project and none is claimed. Rather than
// pretend a message was delivered, each of these returns the message a real
// deployment would post, and the screen that triggered it renders it as the
// email preview it is. The link inside is live and does exactly what the
// emailed one would do, so the flow can be walked end to end.
const SIMULATION_NOTE =
  'Simulated: no mail was sent. This is the message a live deployment would post to the ' +
  'owner, shown here so the link can be followed as the applicant would follow it.';

const envelope = (tenant, subject, body, cta) => ({
  simulated: true,
  simulation_note: SIMULATION_NOTE,
  to: tenant.owner_email,
  subject,
  body,
  cta_label: cta.label,
  cta_link: cta.link,
  sent_at: new Date().toISOString()
});

// Sent the moment an application is filed. The applicant — not the ControlHub —
// supplies the paperwork, so this is the link that lets them do it.
const applicationReceivedEmail = (tenant, token) =>
  envelope(
    tenant,
    `Upload the compliance documents for ${tenant.name}`,
    [
      `Your application for ${tenant.name} has been received and is waiting on your paperwork.`,
      `Open the secure link below and file all ${REQUIRED_TYPES.length} required documents. ` +
        'The platform team reviews each one and cannot begin until they are filed.',
      'You can return to the same link at any time to check progress or replace a document.'
    ],
    { label: 'Open your onboarding page', link: portalLink(tenant.tenant_id, token) }
  );

// Sent when the ControlHub decides. Approval points at sign-in; a decline points
// back at the same onboarding page, where the reviewer's notes on each rejected
// document are what the applicant has to act on.
const decisionEmail = (tenant, { token, adminUsername, rejectedDocuments = [] } = {}) => {
  if (tenant.status === 'ACTIVE' || tenant.status === 'APPROVED') {
    return envelope(
      tenant,
      `${tenant.name} has been approved`,
      [
        `Every compliance document filed for ${tenant.name} has been verified and the pharmacy is now active.`,
        adminUsername
          ? `Sign in as ${adminUsername} with the password chosen during registration.`
          : 'Your administrator account is now able to sign in.',
        'Your staff can be added from Settings once you are in.'
      ],
      { label: 'Sign in', link: signInLink() }
    );
  }

  const reasons = rejectedDocuments.map(
    (d) => `${d.document_type}: ${d.review_notes || 'rejected by the reviewer'}`
  );

  return envelope(
    tenant,
    `${tenant.name} cannot be approved yet`,
    [
      `The application for ${tenant.name} has been declined in its current form.`,
      reasons.length > 0
        ? `The following documents were not accepted:\n${reasons.join('\n')}`
        : 'The reviewer did not accept the paperwork as filed.',
      'Open your onboarding page to replace the documents concerned. The application returns to the review queue as soon as you do.'
    ],
    {
      label: 'Review and resubmit',
      link: token ? portalLink(tenant.tenant_id, token) : signInLink()
    }
  );
};

module.exports = {
  PURPOSE,
  mintToken,
  verifyToken,
  portalLink,
  signInLink,
  applicationReceivedEmail,
  decisionEmail
};
