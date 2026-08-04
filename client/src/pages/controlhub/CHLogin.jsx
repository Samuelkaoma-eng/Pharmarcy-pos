import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, Building2, FileCheck2, GitPullRequestArrow, Command } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { post } from '../../api/client';
import AuthShell, { BackLink, container, item } from '../../components/AuthShell';

const CAPABILITIES = [
  { icon: Building2, label: 'Tenants', value: 'Platform-wide', note: 'approve and suspend' },
  { icon: FileCheck2, label: 'Onboarding', value: 'Document review', note: 'verify before trading' },
  { icon: GitPullRequestArrow, label: 'Maker-checker', value: 'Dual control', note: 'a second pair of eyes' },
  { icon: ShieldCheck, label: 'Limits', value: 'Per pharmacy', note: 'operational settings' }
];

export default function CHLogin() {
  const [username, setUsername] = useState('superadmin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await post('controlhub/login', { username, password });
      if (res?.data?.token) {
        login(res.data.user || { username, role: 'SuperAdmin' }, res.data.token);
        navigate('/controlhub/dashboard');
        return;
      }
      setError(res?.error || 'Invalid credentials');
    } catch {
      setError('Connection failed. Please check the backend server.');
    }

    setLoading(false);
  };

  return (
    <AuthShell
      tint="#a78bfa"
      brand={<><Command size={22} /> <span>ControlHub</span></>}
      eyebrow="Platform administration"
      headline={<>Every pharmacy,<br /><span>one console.</span></>}
      sub="Review applications and their documents, approve pharmacies onto the platform, manage staff and roles, and set the operational limits each branch runs under."
      cards={CAPABILITIES}
      foot="Restricted to platform staff."
    >
      <motion.div className="login-form-wrap" variants={container} initial="hidden" animate="show">
        <motion.div variants={item}>
          <BackLink to="/" />
        </motion.div>

        <motion.div className="login-mobile-brand" variants={item}>
          <Command size={20} /> <span>ControlHub</span>
        </motion.div>

        <motion.div className="login-form-card" variants={item}>
          <motion.div variants={item} style={{ marginBottom: '20px' }}>
            <h2 className="login-title">Platform sign in</h2>
            <p className="login-subtitle">Restricted to platform administrators.</p>
          </motion.div>

          {error && (
            <motion.div
              className="login-error"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              role="alert"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleLogin} className="login-form">
            <motion.div variants={item}>
              <label htmlFor="ch-username">Username</label>
              <input
                id="ch-username"
                type="text"
                className="input-field"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </motion.div>

            <motion.div variants={item}>
              <label htmlFor="ch-password">Password</label>
              <input
                id="ch-password"
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
              {loading ? 'Authenticating…' : 'Sign in'}
            </motion.button>
          </form>

          <motion.p className="login-alt" variants={item}>
            Pharmacy staff sign in <a href="/login">here</a>.
          </motion.p>
        </motion.div>
      </motion.div>
    </AuthShell>
  );
}
