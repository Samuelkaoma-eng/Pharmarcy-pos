import React from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  Pill, ShieldCheck, CalendarClock, PackageCheck, Activity, Receipt, Bot, ArrowRight, Building2
} from 'lucide-react';

const EASE = [0.23, 1, 0.32, 1];

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Prescription control',
    body: 'Prescription-only medicines cannot leave the till without a prescription on the sale. The guard runs server side, inside the transaction.'
  },
  {
    icon: CalendarClock,
    title: 'Expiry guard',
    body: 'Lapsed batches are refused at checkout. Where no batch is named the sale resolves first-expired-first-out across stock that is still in date.'
  },
  {
    icon: PackageCheck,
    title: 'Batch and stock ledger',
    body: 'Every receipt, dispense and adjustment writes a movement row, so stock on hand is always explainable rather than merely current.'
  },
  {
    icon: Activity,
    title: 'Patient triage',
    body: 'Walk-in queue with vitals, doctor assignment and visit status, so the dispensary and the consulting room share one record.'
  },
  {
    icon: Receipt,
    title: 'Thermal receipts',
    body: 'Fixed-width receipts that print correctly on 80mm thermal hardware, with VAT broken out on every sale.'
  },
  {
    icon: Bot,
    title: 'Guided assistant',
    body: 'Classifies what staff ask, explains the action it proposes, and requires confirmation before any stock or sales record changes.'
  }
];

const STEPS = [
  { n: '01', t: 'Apply', d: 'Register the pharmacy and nominate its first administrator.' },
  { n: '02', t: 'Review', d: 'Platform staff verify the licence and approve the application.' },
  { n: '03', t: 'Trade', d: 'Sign-in opens, branding applies, and the till is ready.' }
];

export default function Landing() {
  const reduce = useReducedMotion();

  // A marketing page is seen once, so it can afford a slower, more deliberate
  // reveal than anything inside the till. Movement is dropped entirely when
  // the visitor has asked for reduced motion.
  const rise = (delay = 0) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, y: 20 },
    whileInView: reduce ? { opacity: 1 } : { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-60px' },
    transition: { duration: 0.55, ease: EASE, delay }
  });

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <Pill size={22} />
          <span>PharmaPOS</span>
        </div>
        <nav className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <Link to="/login" className="btn btn-secondary landing-nav-btn">Staff sign in</Link>
          <Link to="/register" className="btn btn-primary landing-nav-btn">Apply to join</Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-glow" aria-hidden="true" />

        <motion.div
          className="landing-hero-inner"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } } }}
        >
          <motion.span
            className="login-eyebrow"
            variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } }}
          >
            Multi-branch pharmacy platform · Zambia
          </motion.span>

          <motion.h1
            className="landing-title"
            variants={{ hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
          >
            The till that refuses
            <br />
            <span>the wrong sale.</span>
          </motion.h1>

          <motion.p
            className="landing-lede"
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
          >
            A point of sale built for pharmacies, where expired stock and prescription-only
            medicines are stopped by the system rather than remembered by the cashier.
          </motion.p>

          <motion.div
            className="landing-cta"
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } } }}
          >
            <Link to="/register" className="btn btn-primary landing-cta-btn">
              Apply to join <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn btn-secondary landing-cta-btn">Staff sign in</Link>
          </motion.div>
        </motion.div>
      </section>

      <section className="landing-section" id="features">
        <motion.div className="landing-section-head" {...rise()}>
          <h2>Built around what a dispensary actually has to get right</h2>
          <p>Every guard below is enforced on the server and pinned by an automated test.</p>
        </motion.div>

        <div className="landing-grid">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <motion.article key={title} className="landing-card" {...rise(i * 0.05)}>
              <div className="landing-card-icon"><Icon size={18} /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-steps-section" id="how">
        <motion.div className="landing-section-head" {...rise()}>
          <h2>From application to first sale</h2>
          <p>Pharmacies are reviewed before they can trade, and staff sign-in stays closed until approval.</p>
        </motion.div>

        <div className="landing-steps">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} className="landing-step" {...rise(i * 0.08)}>
              <span className="landing-step-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <motion.div className="landing-final" {...rise()}>
          <Building2 size={26} />
          <h2>Run one branch or twenty</h2>
          <p>
            Each pharmacy keeps its own catalogue, patients, prescriptions and takings. Nothing
            crosses between tenants, and the platform can adjust operational limits per branch.
          </p>
          <Link to="/register" className="btn btn-primary landing-cta-btn">
            Apply to join <ArrowRight size={16} />
          </Link>
        </motion.div>
      </section>

      <footer className="landing-footer">
        <span>PharmaPOS · Group 16</span>
        <span>CSC4630 Advanced Software Engineering</span>
      </footer>
    </div>
  );
}
