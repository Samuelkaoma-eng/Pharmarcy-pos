import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, PackageCheck, CalendarClock, Activity, Pill } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../api/client';
import AuthShell, { BackLink, EASE, container, item } from '../components/AuthShell';

// Fixed statements about what the system enforces, not live figures: this
// screen is shown before anyone has authenticated, so it must not read data.
const ASSURANCES = [
  { icon: ShieldCheck, label: 'Prescription control', value: 'Enforced', note: 'at the till' },
  { icon: CalendarClock, label: 'Expiry guard', value: 'Active', note: 'blocks lapsed stock' },
  { icon: PackageCheck, label: 'Batch tracking', value: 'FEFO', note: 'first expired, first out' },
  { icon: Activity, label: 'Patient triage', value: 'Built in', note: 'queue and vitals' }
];

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
    <AuthShell
      brand={<><Pill size={22} /> <span>PharmaPOS</span></>}
      eyebrow="Multi-branch pharmacy platform · Zambia"
      headline={<>Dispense with<br /><span>confidence.</span></>}
      sub="Prescription checks, batch expiry control, patient triage and stock movement — one till, every branch, fully auditable."
      cards={ASSURANCES}
      foot="Group 16 · CSC4630 Advanced Software Engineering"
    >
      <motion.div className="login-form-wrap" variants={container} initial="hidden" animate="show">
          <motion.div variants={item}>
            <BackLink to="/" />
          </motion.div>

          <motion.div className="login-mobile-brand" variants={item}>
            <Pill size={20} /> <span>PharmaPOS</span>
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
    </AuthShell>
  );
}
