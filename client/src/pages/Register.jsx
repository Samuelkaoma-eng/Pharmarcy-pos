import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Pill, CheckCircle2 } from 'lucide-react';
import { post } from '../api/client';
import { BackLink, EASE, container, item } from '../components/AuthShell';
import SimulatedEmail from '../components/SimulatedEmail';

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    owner_email: '',
    phone: '',
    admin_username: '',
    admin_password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await post('onboarding/register', form);
      // The server is the authority on whether this succeeded, so the
      // confirmation below only shows when it actually returned a pharmacy.
      if (res?.data?.tenant_id) {
        setSubmitted(res.data);
        return;
      }
      setError(res?.error || 'Registration could not be completed.');
    } catch {
      setError('Connection failed. Please check the backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form-side register-page">
      <motion.div className="login-form-wrap" variants={container} initial="hidden" animate="show">
        {/* The form itself was previously a dead end: only the success screen
            offered a way back. */}
        <motion.div variants={item}>
          <BackLink to="/" />
        </motion.div>

        <motion.div className="login-mobile-brand register-brand" variants={item}>
          <Pill size={20} /> <span>PharmaPOS</span>
        </motion.div>

        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="done"
              className="login-form-card register-done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <CheckCircle2 size={34} className="register-done-icon" />
              <h2 className="login-title">Application received</h2>
              <p className="login-subtitle">
                {submitted.name} has been registered. Your compliance documents are filed by you,
                from the secure link below — sign-in for
                <strong> {submitted.admin_username}</strong> opens once the platform team has
                verified them.
              </p>

              {/* A live deployment would email this and the applicant would
                  leave. There is no mail transport here, so the message is
                  shown instead — the link inside is the real one. */}
              <SimulatedEmail notification={submitted.notification} delay={0.1} />

              <Link to="/" className="btn btn-secondary" style={{ width: '100%', marginTop: '18px' }}>
                Back to home
              </Link>
            </motion.div>
          ) : (
            <motion.div key="form" className="login-form-card" variants={item}>
              <motion.div variants={item} style={{ marginBottom: '22px' }}>
                <h2 className="login-title">Apply to join</h2>
                <p className="login-subtitle">
                  Register your pharmacy and nominate its first administrator.
                </p>
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

              <form onSubmit={handleSubmit} className="login-form">
                <motion.div variants={item}>
                  <label htmlFor="name">Pharmacy name</label>
                  <input id="name" className="input-field" required value={form.name} onChange={update('name')} />
                </motion.div>

                <motion.div variants={item}>
                  <label htmlFor="owner_email">Owner email</label>
                  <input id="owner_email" type="email" className="input-field" required value={form.owner_email} onChange={update('owner_email')} />
                </motion.div>

                <motion.div variants={item}>
                  <label htmlFor="phone">Phone</label>
                  <input id="phone" className="input-field" value={form.phone} onChange={update('phone')} />
                </motion.div>

                <motion.div variants={item}>
                  <label htmlFor="admin_username">Administrator username</label>
                  <input id="admin_username" className="input-field" required value={form.admin_username} onChange={update('admin_username')} />
                </motion.div>

                <motion.div variants={item}>
                  <label htmlFor="admin_password">Administrator password</label>
                  <input
                    id="admin_password"
                    type="password"
                    className="input-field"
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    value={form.admin_password}
                    onChange={update('admin_password')}
                  />
                </motion.div>

                <motion.button type="submit" className="btn btn-primary login-submit" disabled={loading} variants={item}>
                  {loading ? 'Submitting…' : 'Submit application'}
                </motion.button>
              </form>

              <motion.p className="login-alt" variants={item}>
                Already approved? <Link to="/login">Staff sign in</Link>
              </motion.p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
