import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft } from 'lucide-react';

// Strong ease-out. Entrances start fast so the screen feels responsive the
// instant it appears.
export const EASE = [0.23, 1, 0.32, 1];

export const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: EASE } }
};

export const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } }
};

// Drawn rather than loaded, so the panel needs no image asset and stays crisp
// at any size. `tint` lets the ControlHub read as a different surface from the
// dispensary without a second file.
export function PanelArt({ tint = '#5b7cfa' }) {
  return (
    <svg
      className="login-art"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`grad-${tint}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#08090a" />
          <stop offset="60%" stopColor="#101114" />
          <stop offset="100%" stopColor="#0a0b0d" />
        </linearGradient>
        <pattern id={`rows-${tint}`} x="0" y="0" width="1" height="64" patternUnits="userSpaceOnUse">
          <rect width="800" height="1" fill="rgba(255,255,255,0.045)" />
          <rect y="52" width="800" height="1" fill="rgba(255,255,255,0.022)" />
        </pattern>
        <radialGradient id={`glow-${tint}`} cx="74%" cy="24%" r="54%">
          <stop offset="0%" stopColor={tint} stopOpacity="0.20" />
          <stop offset="100%" stopColor={tint} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill={`url(#grad-${tint})`} />
      <rect width="100%" height="100%" fill={`url(#rows-${tint})`} />
      <rect width="100%" height="100%" fill={`url(#glow-${tint})`} />
      <line x1="0" y1="330" x2="800" y2="150" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      <line x1="0" y1="470" x2="800" y2="290" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
    </svg>
  );
}

// A way out of every auth screen. Previously only the registration success
// state had one, which left the form itself a dead end.
export function BackLink({ to = '/', label = 'Back to home' }) {
  return (
    <Link to={to} className="login-back">
      <ArrowLeft size={14} /> {label}
    </Link>
  );
}

export default function AuthShell({ brand, eyebrow, headline, sub, cards, foot, tint, children }) {
  return (
    <div className="login-split">
      <div className="login-panel">
        <PanelArt tint={tint} />
        <div className="login-panel-scrim" />

        <motion.div
          className="login-brand"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {brand}
        </motion.div>

        <motion.div className="login-panel-body" variants={container} initial="hidden" animate="show">
          {eyebrow && (
            <motion.div variants={item}>
              <span className="login-eyebrow">{eyebrow}</span>
            </motion.div>
          )}

          <motion.h1 variants={item} className="login-headline">{headline}</motion.h1>
          <motion.p variants={item} className="login-sub">{sub}</motion.p>

          {cards && (
            <motion.div variants={item} className="login-assurances">
              {cards.map(({ icon: Icon, label, value, note }) => (
                <div key={label} className="assurance-card">
                  <div className="assurance-head">
                    <Icon size={15} />
                    <span>{label}</span>
                  </div>
                  <p className="assurance-value">{value}</p>
                  <p className="assurance-note">{note}</p>
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>

        <motion.p
          className="login-foot"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.25 }}
        >
          {foot}
        </motion.p>
      </div>

      <div className="login-form-side">{children}</div>
    </div>
  );
}
