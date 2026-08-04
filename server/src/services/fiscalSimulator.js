const crypto = require('crypto');

/**
 * SIMFIS — Simulated Fiscalisation Service
 *
 * A teaching model of how an electronic fiscal device works, written so the
 * project can demonstrate that it understands the mechanism it is not yet
 * authorised to perform.
 *
 * Zambia's ZRA Smart Invoice has been mandatory for VAT-registered businesses
 * since 1 July 2024. A trading system reaches it through a Virtual Sales Data
 * Controller, which registers the device, receives each invoice, assigns a
 * fiscal signature and a sequential fiscal counter, and returns a verification
 * code the customer can check against the revenue authority's records.
 *
 * This reproduces that shape and nothing else. It is deliberately NOT called
 * anything resembling "ZRA" or "Smart Invoice": a near-identical name on a
 * printed receipt is read as the real thing, and a document that looks like a
 * valid tax invoice but is not is worse than no document at all. Every value it
 * produces is prefixed SIMFIS- and every artefact carries a notice.
 *
 * Real Smart Invoice references, issued by an approved system elsewhere, are
 * stored separately on `sales.smart_invoice_ref`. The two must never be mixed:
 * one is a record of something that happened, this is a simulation.
 */

const NOTICE =
  'SIMULATED FISCALISATION FOR ACADEMIC DEMONSTRATION. This is not a ZRA Smart Invoice and is not valid for tax or input VAT reclaim purposes.';

// Stands in for the secret an approved device would hold. A real signature is
// produced inside certified hardware or a certified service; this only shows
// where that step sits in the flow.
const DEVICE_SECRET = process.env.SIMFIS_DEVICE_SECRET || 'simfis-demonstration-key-not-a-real-device';

// A fiscal device keeps a monotonic counter so gaps in the sequence are
// detectable. Held in memory here because it is a simulation; a real device
// keeps it in tamper-evident storage.
const counters = new Map();

const nextCounter = (tenantId) => {
  const next = (counters.get(tenantId) || 0) + 1;
  counters.set(tenantId, next);
  return next;
};

// The device identifier a VSDC would issue at registration. Derived from the
// tenant so it is stable across calls without needing to be stored.
const deviceIdFor = (tenantId) =>
  `SIMFIS-DEV-${crypto.createHash('sha256').update(String(tenantId)).digest('hex').slice(0, 10).toUpperCase()}`;

/**
 * Signs a sale the way a fiscal device would.
 *
 * The signature covers the fields a revenue authority cares about — who sold,
 * what the invoice was worth, how much tax it carried and when — so that
 * altering any of them afterwards invalidates it. That property is the whole
 * point of fiscalisation, and it is what this demonstrates.
 */
const fiscalise = ({ tenantId, tenantTpin, receiptNumber, subtotal, taxAmount, total, dateTime }) => {
  if (!tenantId || !receiptNumber) {
    return { error: 'A tenant and a receipt number are required to fiscalise a sale' };
  }

  const issuedAt = dateTime ? new Date(dateTime) : new Date();
  const counter = nextCounter(tenantId);
  const deviceId = deviceIdFor(tenantId);

  // Canonical payload. Field order is fixed so the same sale always signs to
  // the same value, which is what makes verification possible.
  const payload = [
    deviceId,
    counter,
    tenantTpin || 'TPIN-NOT-SET',
    receiptNumber,
    Number(subtotal || 0).toFixed(2),
    Number(taxAmount || 0).toFixed(2),
    Number(total || 0).toFixed(2),
    issuedAt.toISOString()
  ].join('|');

  const signature = crypto
    .createHmac('sha256', DEVICE_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 32)
    .toUpperCase();

  // The short code a customer would key into a verification portal.
  const verificationCode = signature.slice(0, 4) + '-' + signature.slice(4, 8) + '-' + signature.slice(8, 12);

  return {
    simulated: true,
    notice: NOTICE,
    reference: `SIMFIS-${issuedAt.getFullYear()}-${String(counter).padStart(6, '0')}`,
    device_id: deviceId,
    fiscal_counter: counter,
    signature,
    verification_code: verificationCode,
    issued_at: issuedAt.toISOString(),
    // What a real device encodes into the QR square on the receipt. Rendered
    // as text rather than a scannable code, deliberately: a scannable square
    // that resolves to nothing invites someone to treat it as genuine.
    qr_payload: `SIMFIS|${deviceId}|${counter}|${verificationCode}|${Number(total || 0).toFixed(2)}`
  };
};

/**
 * Re-signs a sale and compares, which is how a revenue authority would detect
 * that a figure was altered after the invoice was issued.
 */
const verify = ({
  tenantId, tenantTpin, receiptNumber, subtotal, taxAmount, total, issuedAt, fiscalCounter, signature
}) => {
  const payload = [
    deviceIdFor(tenantId),
    // The counter is part of the signature, so verification needs the value
    // that was used. Supplied back by the caller from the stored record.
    fiscalCounter,
    tenantTpin || 'TPIN-NOT-SET',
    receiptNumber,
    Number(subtotal || 0).toFixed(2),
    Number(taxAmount || 0).toFixed(2),
    Number(total || 0).toFixed(2),
    issuedAt
  ].join('|');

  const expected = crypto.createHmac('sha256', DEVICE_SECRET).update(payload).digest('hex').slice(0, 32).toUpperCase();
  return { simulated: true, notice: NOTICE, matches: expected === signature };
};

module.exports = { fiscalise, verify, NOTICE, deviceIdFor };
