import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Mail, Copy, Check, ExternalLink } from 'lucide-react';

const EASE = [0.23, 1, 0.32, 1];

// Turns the absolute link the server built into a path this app can route to
// itself. The server has to produce an absolute URL because a real email would
// carry one; inside the running app a router link is better than a full page
// load, and it also keeps the flow working when the client is served from a
// port the server was not told about.
const toInternalPath = (link) => {
  try {
    const url = new URL(link, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
};

/**
 * The message a live deployment would email, shown on screen instead.
 *
 * This project has no mail transport and does not pretend otherwise: the card
 * is labelled as a simulation, and the note the server attached is printed
 * where the recipient of a real message would never see it. What is not
 * simulated is the link — it carries the same token an emailed one would and
 * opens the same page, so the onboarding flow can be walked end to end.
 */
export default function SimulatedEmail({ notification, delay = 0 }) {
  const [copied, setCopied] = useState(false);
  if (!notification) return null;

  const internalPath = notification.cta_link ? toInternalPath(notification.cta_link) : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(notification.cta_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; the link is on screen to be read
      // either way, so there is nothing to recover from.
    }
  };

  return (
    <motion.div
      className="sim-email"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE, delay }}
    >
      <div className="sim-email-tag">
        <Mail size={13} /> Simulated email
      </div>

      <div className="sim-email-head">
        <div>
          <span className="sim-email-label">To</span>
          <strong>{notification.to}</strong>
        </div>
        <div>
          <span className="sim-email-label">Subject</span>
          <strong>{notification.subject}</strong>
        </div>
      </div>

      <div className="sim-email-body">
        {notification.body?.map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>

      {notification.cta_link && (
        <div className="sim-email-cta">
          {internalPath ? (
            <Link to={internalPath} className="btn btn-primary">
              {notification.cta_label} <ExternalLink size={14} />
            </Link>
          ) : (
            <a className="btn btn-primary" href={notification.cta_link}>
              {notification.cta_label} <ExternalLink size={14} />
            </a>
          )}
          <button type="button" className="btn btn-secondary" onClick={handleCopy}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}

      {notification.cta_link && <code className="sim-email-url">{notification.cta_link}</code>}

      <p className="sim-email-note">{notification.simulation_note}</p>
    </motion.div>
  );
}
