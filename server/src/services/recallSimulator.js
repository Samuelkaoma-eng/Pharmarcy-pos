// SIMSMS — the simulated patient-reminder service.
//
// A pharmacy that recalls patients for check-ups needs to message them. This
// system cannot: it holds no gateway credentials and is not a registered
// sender with any Zambian network, where bulk sender registration is required.
//
// So it models the mechanism instead, on exactly the terms SIMFIS uses:
//
//  1. The name is not that of any real service, and cannot be mistaken for one.
//  2. Simulated values live in their own columns and never occupy a field
//     meant for a record of a message actually delivered.
//  3. Every artefact is marked. The reference carries a `SIMSMS-` prefix, and
//     the notice below travels with every response.
//
// The point of simulating it rather than skipping it: a recall list is only
// worth keeping if something acts on it, and the shape of that action — who
// was contacted, when, with what text — is what the pharmacy would need to
// audit. Modelling it teaches that; pretending to send it would not.

const NOTICE =
  'SIMULATED REMINDER FOR ACADEMIC DEMONSTRATION. No message was sent to any ' +
  'patient. This system is not a registered sender with any mobile network and ' +
  'has no messaging gateway. Contact the patient by your usual means.';

// Monotonic within a process run, so a gap in the sequence is visible the same
// way a fiscal counter makes a missing invoice visible.
let counter = 0;

const reference = () => {
  counter += 1;
  const year = new Date().getFullYear();
  return `SIMSMS-${year}-${String(counter).padStart(6, '0')}`;
};

/**
 * Compose the reminder that *would* be sent, and mark it as simulated.
 * Returns the body, a reference, and the notice. Sends nothing.
 */
const compose = ({ patientName, pharmacyName, reason, dueDate, currency = 'K' }) => {
  const due = new Date(dueDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  // Deliberately the shape a real reminder takes — greeting, pharmacy, reason,
  // date, opt-out — so what is being simulated is recognisable.
  const body =
    `Hello ${patientName}, this is a reminder from ${pharmacyName}. ` +
    `You are due for ${reason} on ${due}. ` +
    `Please call us to confirm or rearrange. Reply STOP to opt out.`;

  return {
    reference: reference(),
    body,
    // Length matters to anyone costing a real campaign, so it is reported.
    segments: Math.ceil(body.length / 160),
    composed_at: new Date().toISOString(),
    simulated: true,
    notice: NOTICE,
    currency
  };
};

const status = () => ({
  service: 'SIMFIS-adjacent patient reminder simulator (SIMSMS)',
  simulated: true,
  gateway_configured: false,
  messages_composed_this_run: counter,
  notice: NOTICE
});

module.exports = { compose, status, NOTICE };
