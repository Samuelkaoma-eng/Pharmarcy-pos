import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { ShieldPlus, UserPlus, HeartHandshake } from 'lucide-react';
import { get, post } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const EASE = [0.23, 1, 0.32, 1];

export default function Insurance() {
  const { user } = useAuth();
  const [schemes, setSchemes] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [addingScheme, setAddingScheme] = useState(false);
  const [schemeForm, setSchemeForm] = useState({ name: '', cover_percent: '80', contact_phone: '' });

  const [enrolling, setEnrolling] = useState(false);
  const [enrolForm, setEnrolForm] = useState({ schemeId: '', customerId: '', memberNumber: '', validUntil: '' });

  // Cover lookup: pick a patient and the system says what they are actually
  // entitled to, which is the question a cashier has at the counter.
  const [checkPatient, setCheckPatient] = useState('');
  const [cover, setCover] = useState(undefined); // undefined = not asked, null = no cover

  const isAdmin = ['Admin', 'SuperAdmin'].includes(user?.role);
  const canEnrol = ['Admin', 'Pharmacist', 'SuperAdmin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    const [schemeRes, patientRes] = await Promise.all([get('insurance/schemes'), get('patients')]);

    if (schemeRes?.data) setSchemes(schemeRes.data);
    else toast.error('Could not load schemes', { description: schemeRes?.error || 'Check the backend server.' });

    if (patientRes?.data) setPatients(patientRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddScheme = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post('insurance/schemes', {
      name: schemeForm.name,
      cover_percent: Number(schemeForm.cover_percent),
      contact_phone: schemeForm.contact_phone
    });

    if (res?.data) {
      toast.success('Scheme added', { description: `${res.data.name} covers ${res.data.cover_percent}% of a bill.` });
      setAddingScheme(false);
      setSchemeForm({ name: '', cover_percent: '80', contact_phone: '' });
      await load();
    } else {
      toast.error('Could not add the scheme', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const handleEnrol = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post('insurance/memberships', {
      ...enrolForm,
      validUntil: enrolForm.validUntil || null
    });

    if (res?.data) {
      const patient = patients.find((p) => p.customer_id === enrolForm.customerId);
      toast.success('Patient enrolled', { description: `${patient?.name || 'The patient'} is now covered.` });
      setEnrolling(false);
      setEnrolForm({ schemeId: '', customerId: '', memberNumber: '', validUntil: '' });
      // A newly enrolled patient is the one most likely to be checked next.
      if (checkPatient === enrolForm.customerId) await lookUpCover(checkPatient);
    } else {
      toast.error('Could not enrol the patient', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const lookUpCover = async (customerId) => {
    setCheckPatient(customerId);
    if (!customerId) { setCover(undefined); return; }

    const res = await get(`insurance/coverage/${customerId}`);
    if (res && 'data' in res) {
      // data is null when there is no active cover, which is an answer, not a
      // failure. Only a missing response is an error.
      setCover(res.data);
    } else {
      setCover(undefined);
      toast.error('Could not check cover', { description: res?.error || 'The server did not answer.' });
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <h1>Insurance</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '4px' }}>
            Schemes this pharmacy accepts, and which patients they cover. A covered
            patient's bill is split automatically at the till.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {isAdmin && (
            <button className="btn btn-secondary" onClick={() => setAddingScheme(true)}>
              <ShieldPlus size={15} /> Add scheme
            </button>
          )}
          {canEnrol && (
            <button className="btn btn-primary" onClick={() => setEnrolling(true)} disabled={schemes.length === 0}>
              <UserPlus size={15} /> Enrol patient
            </button>
          )}
        </div>
      </div>

      {loading && <p style={{ color: 'var(--text-3)' }}>Loading schemes…</p>}

      {!loading && (
        schemes.length === 0 ? (
          <p style={{ color: 'var(--text-3)' }}>
            No insurance schemes recorded yet. Until one is added, every patient pays in full.
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Scheme</th>
                  <th>Covers</th>
                  <th>Patient pays</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {schemes.map((s, i) => (
                    <motion.tr
                      key={s.scheme_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, ease: EASE, delay: Math.min(i * 0.03, 0.18) }}
                    >
                      <td>{s.name}</td>
                      <td>{Number(s.cover_percent).toFixed(0)}%</td>
                      <td>{(100 - Number(s.cover_percent)).toFixed(0)}%</td>
                      <td>{s.contact_phone || '—'}</td>
                      <td>
                        <span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>
                          {s.is_active ? 'Accepted' : 'Not accepted'}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )
      )}

      <div className="settings-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Check a patient's cover</h3>
          <p style={{ color: 'var(--text-2)', margin: '4px 0 0' }}>
            What the till will apply when this patient is named on a sale.
          </p>
        </div>

        <select
          className="input-field"
          aria-label="Patient to check"
          value={checkPatient}
          onChange={(e) => lookUpCover(e.target.value)}
        >
          <option value="">Choose a patient…</option>
          {patients.map((p) => <option key={p.customer_id} value={p.customer_id}>{p.name}</option>)}
        </select>

        {checkPatient && cover === null && (
          <p style={{ color: 'var(--text-2)', margin: 0 }}>
            No active cover. This patient pays the full amount.
          </p>
        )}

        {checkPatient && cover && (
          <motion.div
            className="assurance-card"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
          >
            <div className="assurance-head">
              <HeartHandshake size={15} /> {cover.name}
            </div>
            <div className="assurance-value">
              {Number(cover.cover_percent).toFixed(0)}% covered
            </div>
            <div className="assurance-note">
              Member {cover.member_number}
              {cover.valid_until
                ? ` · valid until ${new Date(cover.valid_until).toLocaleDateString()}`
                : ' · no expiry recorded'}
            </div>
          </motion.div>
        )}
      </div>

      <Modal isOpen={addingScheme} onClose={() => setAddingScheme(false)} title="Add an insurance scheme">
        <form onSubmit={handleAddScheme} className="login-form">
          <div>
            <label htmlFor="ins-name">Scheme name</label>
            <input id="ins-name" className="input-field" required value={schemeForm.name}
              onChange={(e) => setSchemeForm({ ...schemeForm, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ins-cover">Percentage the scheme covers</label>
            <input id="ins-cover" type="number" min="0" max="100" className="input-field" required
              value={schemeForm.cover_percent}
              onChange={(e) => setSchemeForm({ ...schemeForm, cover_percent: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ins-phone">Contact phone</label>
            <input id="ins-phone" className="input-field" value={schemeForm.contact_phone}
              onChange={(e) => setSchemeForm({ ...schemeForm, contact_phone: e.target.value })} />
          </div>

          <p className="form-note">
            The patient pays the remaining {100 - Number(schemeForm.cover_percent || 0)}%. The
            sale total is unchanged either way — only who owes it changes.
          </p>

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add scheme'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={enrolling} onClose={() => setEnrolling(false)} title="Enrol a patient on a scheme">
        <form onSubmit={handleEnrol} className="login-form">
          <div>
            <label htmlFor="enr-patient">Patient</label>
            <select id="enr-patient" className="input-field" required value={enrolForm.customerId}
              onChange={(e) => setEnrolForm({ ...enrolForm, customerId: e.target.value })}>
              <option value="">Choose a patient…</option>
              {patients.map((p) => <option key={p.customer_id} value={p.customer_id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="enr-scheme">Scheme</label>
            <select id="enr-scheme" className="input-field" required value={enrolForm.schemeId}
              onChange={(e) => setEnrolForm({ ...enrolForm, schemeId: e.target.value })}>
              <option value="">Choose a scheme…</option>
              {schemes.filter((s) => s.is_active).map((s) => (
                <option key={s.scheme_id} value={s.scheme_id}>
                  {s.name} — {Number(s.cover_percent).toFixed(0)}%
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="enr-member">Member number</label>
            <input id="enr-member" className="input-field" required value={enrolForm.memberNumber}
              onChange={(e) => setEnrolForm({ ...enrolForm, memberNumber: e.target.value })} />
          </div>
          <div>
            <label htmlFor="enr-valid">Valid until</label>
            <input id="enr-valid" type="date" className="input-field" value={enrolForm.validUntil}
              onChange={(e) => setEnrolForm({ ...enrolForm, validUntil: e.target.value })} />
          </div>

          <p className="form-note">
            Leave the date blank if the membership has no end date. An expired membership
            is treated as no cover, so nothing has to be deactivated by hand.
          </p>

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Enrolling…' : 'Enrol patient'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
