import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, PackageCheck, CalendarClock, Activity, Pill } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../api/client';

// The strong ease-out used across the app. Entrances start fast so the screen
// feels responsive the instant it appears.
const EASE = [0.23, 1, 0.32, 1];

const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } }
};

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } }
};

// Guarantees the dispensary story rather than live figures: this screen is
// shown before anyone has authenticated, so it must not read real data.
const ASSURANCES = [
  { icon: ShieldCheck, label: 'Prescription control', value: 'Enforced', note: 'at the till', color: '#38bdf8' },
  { icon: CalendarClock, label: 'Expiry guard', value: 'Active', note: 'blocks lapsed stock', color: '#f59e0b' },
  { icon: PackageCheck, label: 'Batch tracking', value: 'FEFO', note: 'first expired, first out', color: '#4ade80' },
  { icon: Activity, label: 'Patient triage', value: 'Built in', note: 'queue and vitals', color: '#f472b6' }
];

function ShelfPattern() {
  // Stylised dispensary shelving, drawn rather than loaded so the panel needs
  // no image asset and stays crisp at any size.
  return (
    <svg
      className="login-art"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shelfGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b1220" />
          <stop offset="55%" stopColor="#111f38" />
          <stop offset="100%" stopColor="#0a1526" />
        </linearGradient>
        <pattern id="shelves" x="0" y="0" width="1" height="72" patternUnits="userSpaceOnUse">
          <rect width="800" height="2" fill="rgba(148,197,255,0.10)" />
          <rect y="60" width="800" height="1" fill="rgba(148,197,255,0.05)" />
        </pattern>
        <radialGradient id="glowPrimary" cx="72%" cy="26%" r="52%">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowMint" cx="18%" cy="82%" r="44%">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#shelfGrad)" />
      <rect width="100%" height="100%" fill="url(#shelves)" />
      <rect width="100%" height="100%" fill="url(#glowPrimary)" />
      <rect width="100%" height="100%" fill="url(#glowMint)" />
      <line x1="0" y1="330" x2="800" y2="150" stroke="rgba(148,197,255,0.10)" strokeWidth="1.5" />
      <line x1="0" y1="470" x2="800" y2="290" stroke="rgba(148,197,255,0.06)" strokeWidth="1" />
    </svg>
  );
}

export default function Login() {
  const [role, setRole] = useState('Admin');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pharmacies, setPharmacies] = useState([]);
  const [tenantId, setTenantId] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // Usernames are only unique within a pharmacy, so staff pick theirs first.
  useEffect(() => {
    let active = true;
    get('tenants/directory').then((res) => {
      if (!active || !res?.data) return;
      setPharmacies(res.data);
      if (res.data.length > 0) setTenantId(res.data[0].tenant_id);
    });
    return () => { active = false; };
  }, []);

  const handleRoleSelect = (r) => {
    setRole(r);
    setUsername(r.toLowerCase());
    setPassword('');
    setError('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await post('auth/login', { username, password, tenantId });
      if (res?.data?.token) {
        login(res.data.user || { username, role }, res.data.token);
        navigate('/dashboard');
        return;
      }
      setError(res?.error || 'Invalid login response from server.');
    } catch {
      setError('Connection failed. Please check the backend server.');
    }

    setLoading(false);
  };

  return (
    <div className="login-split">
      <div className="login-panel">
        <ShelfPattern />
        <div className="login-panel-scrim" />

        <motion.div
          className="login-brand"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          <Pill size={26} />
          <span>PharmaPOS</span>
        </motion.div>

        <motion.div className="login-panel-body" variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <span className="login-eyebrow">Multi-branch pharmacy platform · Zambia</span>
          </motion.div>

          <motion.h1 variants={item} className="login-headline">
            Dispense with
            <br />
            <span>confidence.</span>
          </motion.h1>

          <motion.p variants={item} className="login-sub">
            Prescription checks, batch expiry control, patient triage and stock movement — one
            till, every branch, fully auditable.
          </motion.p>

          <motion.div variants={item} className="login-assurances">
            {ASSURANCES.map(({ icon: Icon, label, value, note, color }) => (
              <div key={label} className="assurance-card">
                <div className="assurance-head">
                  <Icon size={16} style={{ color }} />
                  <span>{label}</span>
                </div>
                <p className="assurance-value">{value}</p>
                <p className="assurance-note">{note}</p>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.p className="login-foot" variants={item} initial="hidden" animate="show">
          Group 16 · CSC4630 Advanced Software Engineering
        </motion.p>
      </div>

      <div className="login-form-side">
        <motion.div className="login-form-wrap" variants={container} initial="hidden" animate="show">
          <motion.div className="login-mobile-brand" variants={item}>
            <Pill size={22} /> <span>PharmaPOS</span>
          </motion.div>

          <motion.div className="login-form-card" variants={item}>
            <motion.div variants={item} style={{ marginBottom: '24px' }}>
              <h2 className="login-title">Welcome back</h2>
              <p className="login-subtitle">Sign in to your dispensary workspace.</p>
            </motion.div>

            {error && (
              <motion.div
                className="login-error"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: EASE }}
                role="alert"
              >
                {error}
              </motion.div>
            )}

            <motion.div className="role-tabs" variants={item}>
              {['Admin', 'Pharmacist', 'Cashier'].map((r) => (
                <button
                  key={r}
                  type="button"
                  className={role === r ? 'active' : ''}
                  onClick={() => handleRoleSelect(r)}
                >
                  {role === r && (
                    <motion.span
                      layoutId="role-pill"
                      className="role-pill"
                      transition={{ type: 'spring', duration: 0.3, bounce: 0.12 }}
                    />
                  )}
                  <span className="role-label">{r}</span>
                </button>
              ))}
            </motion.div>

            <form onSubmit={handleLoginSubmit} className="login-form">
              {pharmacies.length > 0 && (
                <motion.div variants={item}>
                  <label htmlFor="pharmacy">Pharmacy</label>
                  <select
                    id="pharmacy"
                    className="input-field"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                  >
                    {pharmacies.map((p) => (
                      <option key={p.tenant_id} value={p.tenant_id}>{p.name}</option>
                    ))}
                  </select>
                </motion.div>
              )}

              <motion.div variants={item}>
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  className="input-field"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </motion.div>

              <motion.div variants={item}>
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input-field"
                  required
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </motion.div>

              <motion.button
                type="submit"
                className="btn btn-primary login-submit"
                disabled={loading}
                variants={item}
              >
                {loading ? 'Authenticating…' : `Sign in as ${role}`}
              </motion.button>
            </form>

            <motion.p className="login-alt" variants={item}>
              New pharmacy? <Link to="/register">Apply to join</Link>
            </motion.p>
          </motion.div>

          <motion.p className="login-legal" variants={item}>
            Platform staff sign in at <Link to="/controlhub/login">ControlHub</Link>.
          </motion.p>
        </motion.div>
      </div>
    </div>
  );
}
