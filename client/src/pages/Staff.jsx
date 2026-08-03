import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { UserPlus, Shield, Check, X } from 'lucide-react';
import { get, post, put } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const EASE = [0.23, 1, 0.32, 1];

const ROLE_NOTES = {
  Admin: 'Full access, including staff and branding',
  Pharmacist: 'Dispensing, prescriptions and stock',
  Doctor: 'Consultations and prescribing',
  Cashier: 'Till and patient registration'
};

function Avatar({ user, size = 34 }) {
  // A picture that fails to load must fall back to initials rather than
  // leaving a hole: hiding the broken image alone left no avatar at all.
  const [failed, setFailed] = useState(false);

  const initials = (user.full_name || user.username || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  return user.avatar_url && !failed ? (
    <img
      src={user.avatar_url}
      alt=""
      className="avatar"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  ) : (
    <span className="avatar avatar-initials" style={{ width: size, height: size }}>{initials}</span>
  );
}

export default function Staff() {
  const { user: me } = useAuth();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'Cashier' });

  const load = useCallback(async () => {
    setLoading(true);
    const [staffRes, rolesRes] = await Promise.all([get('users'), get('users/roles')]);
    if (staffRes?.data) setStaff(staffRes.data);
    else toast.error('Could not load staff', { description: staffRes?.error || 'Check the backend server.' });
    if (rolesRes?.data) setRoles(rolesRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isAdmin = me?.role === 'Admin' || me?.role === 'SuperAdmin';

  const handleCreate = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post('users', form);
    if (res?.data) {
      toast.success('Staff account created', { description: `${res.data.full_name} can now sign in.` });
      setCreating(false);
      setForm({ username: '', full_name: '', password: '', role: 'Cashier' });
      await load();
    } else {
      toast.error('Could not create the account', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const handleChange = async (id, patch, successMessage) => {
    const res = await put(`users/${id}`, patch);
    if (res?.data) {
      setStaff((prev) => prev.map((s) => (s.user_id === id ? res.data : s)));
      toast.success(successMessage);
    } else {
      toast.error('Could not update the account', { description: res?.error || 'The server rejected it.' });
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <h1>Staff and roles</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '4px' }}>
            Who can sign in to this pharmacy, and what each of them may do.
          </p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <UserPlus size={15} /> Add staff
          </button>
        )}
      </div>

      {loading && <p style={{ color: 'var(--text-3)' }}>Loading staff…</p>}

      <div className="staff-list">
        <AnimatePresence initial={false}>
          {staff.map((s, i) => (
            <motion.div
              key={s.user_id}
              className="staff-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.26, ease: EASE, delay: Math.min(i * 0.03, 0.18) }}
            >
              <div className="staff-identity">
                <Avatar user={s} />
                <div>
                  <p>
                    {s.full_name}
                    {s.user_id === me?.userId && <span className="staff-you">you</span>}
                  </p>
                  <small>@{s.username}</small>
                </div>
              </div>

              <div className="staff-role">
                {isAdmin && s.user_id !== me?.userId ? (
                  <select
                    className="input-field"
                    value={s.role}
                    aria-label={`Role for ${s.full_name}`}
                    onChange={(e) => handleChange(s.user_id, { role: e.target.value }, `${s.full_name} is now ${e.target.value}`)}
                  >
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                ) : (
                  <span className="badge badge-blue">{s.role}</span>
                )}
                <small>{ROLE_NOTES[s.role]}</small>
              </div>

              <div className="staff-actions">
                <span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>
                  {s.is_active ? 'Active' : 'Disabled'}
                </span>
                {isAdmin && s.user_id !== me?.userId && (
                  <button
                    className={s.is_active ? 'btn btn-danger' : 'btn btn-secondary'}
                    onClick={() =>
                      handleChange(
                        s.user_id,
                        { is_active: !s.is_active },
                        s.is_active ? `${s.full_name} can no longer sign in` : `${s.full_name} can sign in again`
                      )
                    }
                  >
                    {s.is_active ? <X size={14} /> : <Check size={14} />}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <Modal isOpen={creating} onClose={() => setCreating(false)} title="Add a staff account">
        <form onSubmit={handleCreate} className="login-form">
          <div>
            <label htmlFor="s-name">Full name</label>
            <input id="s-name" className="input-field" required value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-user">Username</label>
            <input id="s-user" className="input-field" required value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-pass">Password</label>
            <input id="s-pass" type="password" className="input-field" required minLength={8}
              placeholder="At least 8 characters" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </div>
          <div>
            <label htmlFor="s-role">Role</label>
            <select id="s-role" className="input-field" value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roles.map((r) => <option key={r} value={r}>{r} — {ROLE_NOTES[r]}</option>)}
            </select>
          </div>

          {/* Platform authority is never grantable from inside a pharmacy, so
              it does not appear in the list above. */}
          <p className="form-note">
            <Shield size={13} /> Platform administration is granted only from ControlHub.
          </p>

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
