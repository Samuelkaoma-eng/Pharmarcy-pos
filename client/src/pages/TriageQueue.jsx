import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus, Activity, CheckCircle, UserPlus, Stethoscope, ClipboardList,
  ArrowRight, XCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { get, post, patch } from '../api/client';
import Modal from '../components/Modal';

// A patient's passage through the clinic side of the pharmacy.
//
// This screen was rebuilt against the workflow the server actually implements.
// The version it replaces sent `patient_name` where the API needs a
// `customerId`, so registering a walk-in always failed and a fabricated visit
// was inserted into local state instead; it read a `vitals` property the queue
// never returned, so every visit read "Vitals Pending" however many readings
// had been taken; it had no DISPENSING state and no way to write up a
// consultation; and it reported success with `alert()` whatever the server
// said.

const FLOW = ['WAITING', 'TRIAGE', 'IN_PROGRESS', 'DISPENSING', 'COMPLETED'];

const STATUS_LABEL = {
  WAITING: 'Waiting',
  TRIAGE: 'Triaged',
  IN_PROGRESS: 'With clinician',
  DISPENSING: 'At the counter',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

const STATUS_COLOR = {
  WAITING: '#facc15',
  TRIAGE: '#a78bfa',
  IN_PROGRESS: '#60a5fa',
  DISPENSING: '#fb923c',
  COMPLETED: '#4ade80',
  CANCELLED: '#f87171'
};

export default function TriageQueue() {
  const { user } = useAuth();
  const [visits, setVisits] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [busy, setBusy] = useState(false);

  const [newVisit, setNewVisit] = useState(null);
  const [vitalsFor, setVitalsFor] = useState(null);
  const [assignFor, setAssignFor] = useState(null);
  const [assessFor, setAssessFor] = useState(null);

  const [visitForm, setVisitForm] = useState({ customerId: '', reason: '' });
  const [vitalsForm, setVitalsForm] = useState({ bp: '', heartRate: '', temperature: '', spo2: '', weight: '' });
  const [assignDoctorId, setAssignDoctorId] = useState('');
  const [assessment, setAssessment] = useState('');
  const [sendToDispensary, setSendToDispensary] = useState(true);

  // Clinical staff can take vitals and write up consultations. A cashier can
  // register an arrival but not act on one, which mirrors the route guards.
  const isClinical = ['Admin', 'Pharmacist', 'Doctor', 'SuperAdmin'].includes(user?.role);
  const canRoute = ['Admin', 'Pharmacist', 'SuperAdmin'].includes(user?.role);
  const isDoctor = user?.role === 'Doctor';

  const loadQueue = useCallback(async () => {
    const res = await get(`visits/queue${mineOnly ? '?mine=true' : ''}`);
    if (res?.data) {
      setVisits(res.data);
      setError(null);
    } else {
      // Nothing is invented here. A queue that cannot be read says so, because
      // a fabricated waiting room is worse than an empty screen.
      setError(res?.error || 'The queue could not be read.');
      setVisits([]);
    }
  }, [mineOnly]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await loadQueue();
      const [docRes, patRes] = await Promise.all([get('doctors'), get('patients')]);
      if (!active) return;
      setDoctors(docRes?.data || []);
      setPatients(patRes?.data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [loadQueue]);

  const counts = FLOW.reduce((acc, s) => {
    acc[s] = visits.filter((v) => v.status === s).length;
    return acc;
  }, {});

  const openRegister = () => {
    setVisitForm({ customerId: '', reason: '' });
    setNewVisit(true);
  };

  const registerVisit = async (e) => {
    e.preventDefault();
    if (!visitForm.customerId) {
      toast.error('Choose the patient who has arrived.');
      return;
    }

    setBusy(true);
    // The API takes a patient id. The old screen sent a typed name, which the
    // server rejected every time.
    const res = await post('visits', { customerId: visitForm.customerId, reason: visitForm.reason });
    setBusy(false);

    if (res?.data) {
      toast.success(`Registered as queue #${res.data.queue_number}`);
      setNewVisit(null);
      loadQueue();
    } else {
      toast.error(res?.error || 'The visit could not be registered.');
    }
  };

  const openVitals = (visit) => {
    setVitalsForm({ bp: '', heartRate: '', temperature: '', spo2: '', weight: '' });
    setVitalsFor(visit);
  };

  const saveVitals = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post(`visits/${vitalsFor.visit_id}/vitals`, vitalsForm);
    setBusy(false);

    if (res?.data) {
      // Recording vitals is the triage step; the server advances a waiting
      // visit to TRIAGE itself, so the queue is re-read rather than guessed.
      toast.success('Vitals recorded');
      setVitalsFor(null);
      loadQueue();
    } else {
      toast.error(res?.error || 'The vitals could not be recorded.');
    }
  };

  const openAssign = (visit) => {
    setAssignDoctorId('');
    setAssignFor(visit);
  };

  const assign = async (e) => {
    e.preventDefault();
    if (!assignDoctorId) {
      toast.error('Choose a clinician.');
      return;
    }

    setBusy(true);
    const res = await patch(`visits/${assignFor.visit_id}/assign`, { doctorId: assignDoctorId });
    setBusy(false);

    if (res?.data) {
      toast.success('Patient routed to the consulting room');
      setAssignFor(null);
      loadQueue();
    } else {
      toast.error(res?.error || 'The patient could not be routed.');
    }
  };

  const openAssess = (visit) => {
    setAssessment('');
    setSendToDispensary(true);
    setAssessFor(visit);
  };

  const saveAssessment = async (e) => {
    e.preventDefault();
    if (!assessment.trim()) {
      toast.error('Write up what was assessed.');
      return;
    }

    setBusy(true);
    const res = await patch(`visits/${assessFor.visit_id}/assessment`, {
      assessment,
      sendToDispensary
    });
    setBusy(false);

    if (res?.data) {
      toast.success(res.message || 'Assessment recorded');
      setAssessFor(null);
      loadQueue();
    } else {
      toast.error(res?.error || 'The assessment could not be recorded.');
    }
  };

  const move = async (visit, status) => {
    setBusy(true);
    const res = await patch(`visits/${visit.visit_id}/status`, { status });
    setBusy(false);

    if (res?.data) {
      toast.success(`Visit ${STATUS_LABEL[status].toLowerCase()}`);
      loadQueue();
    } else {
      // The state machine refuses illegal moves with a readable reason. It is
      // shown as-is rather than replaced with a generic failure.
      toast.error(res?.error || 'That change was refused.');
    }
  };

  const routableDoctors = doctors.filter((d) => d.has_account);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Triage &amp; Patient Queue</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>
            Reception, vitals, consultation and the hand-off to the counter
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {isDoctor && (
            <button
              className={`btn ${mineOnly ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMineOnly((v) => !v)}
            >
              <Stethoscope size={16} /> {mineOnly ? 'My patients' : 'Whole queue'}
            </button>
          )}
          <button className="btn btn-secondary" onClick={loadQueue} title="Refresh">
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-success" onClick={openRegister}>
            <Plus size={18} /> Register walk-in
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--surface)', border: '1px solid #b91c1c', borderRadius: '12px', padding: '16px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {/* The stages a patient actually passes through, in order, including the
          DISPENSING step between the consulting room and the till. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px' }}>
        {FLOW.map((s) => (
          <div key={s} className="stat-card">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{STATUS_LABEL[s]}</span>
            <h2 style={{ fontSize: '1.6rem', color: STATUS_COLOR[s], marginTop: '6px' }}>{counts[s] ?? 0}</h2>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text)' }}>
          {mineOnly ? "Your patients today" : "Today's queue"}
        </h3>

        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-2)' }}>Loading queue…</div>
        ) : visits.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-2)' }}>
            {error ? 'Nothing can be shown.' : 'Nobody is in the queue today.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {visits.map((v) => (
              <VisitCard
                key={v.visit_id}
                visit={v}
                isClinical={isClinical}
                canRoute={canRoute}
                busy={busy}
                onVitals={() => openVitals(v)}
                onAssign={() => openAssign(v)}
                onAssess={() => openAssess(v)}
                onMove={(s) => move(v, s)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Register a walk-in */}
      <Modal isOpen={Boolean(newVisit)} onClose={() => setNewVisit(null)} title="Register a walk-in">
        <form onSubmit={registerVisit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Patient</label>
            <select
              className="input-field"
              value={visitForm.customerId}
              onChange={(e) => setVisitForm({ ...visitForm, customerId: e.target.value })}
              required
            >
              <option value="">Choose a registered patient…</option>
              {patients.map((p) => (
                <option key={p.customer_id} value={p.customer_id}>
                  {p.name}{p.phone ? ` · ${p.phone}` : ''}
                </option>
              ))}
            </select>
            {patients.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '4px' }}>
                No patients are registered yet. Add one on the Patients screen first.
              </p>
            )}
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Reason for visit</label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. persistent cough and mild fever"
              value={visitForm.reason}
              onChange={(e) => setVisitForm({ ...visitForm, reason: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setNewVisit(null)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={busy}>
              <UserPlus size={16} /> Add to queue
            </button>
          </div>
        </form>
      </Modal>

      {/* Vitals */}
      <Modal
        isOpen={Boolean(vitalsFor)}
        onClose={() => setVitalsFor(null)}
        title={vitalsFor ? `Vitals — #${vitalsFor.queue_number} ${vitalsFor.patient_name}` : 'Vitals'}
      >
        <form onSubmit={saveVitals} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Field label="Blood pressure" placeholder="120/80" value={vitalsForm.bp} onChange={(x) => setVitalsForm({ ...vitalsForm, bp: x })} />
            <Field label="Heart rate (bpm)" placeholder="72" value={vitalsForm.heartRate} onChange={(x) => setVitalsForm({ ...vitalsForm, heartRate: x })} />
            <Field label="Temperature (°C)" placeholder="37.1" value={vitalsForm.temperature} onChange={(x) => setVitalsForm({ ...vitalsForm, temperature: x })} />
            <Field label="SpO₂ (%)" placeholder="98" value={vitalsForm.spo2} onChange={(x) => setVitalsForm({ ...vitalsForm, spo2: x })} />
            <Field label="Weight (kg)" placeholder="65" value={vitalsForm.weight} onChange={(x) => setVitalsForm({ ...vitalsForm, weight: x })} />
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
            Recording vitals moves a waiting patient into triage.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setVitalsFor(null)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={busy}>
              <Activity size={16} /> Save vitals
            </button>
          </div>
        </form>
      </Modal>

      {/* Route to a clinician */}
      <Modal
        isOpen={Boolean(assignFor)}
        onClose={() => setAssignFor(null)}
        title={assignFor ? `Route #${assignFor.queue_number} ${assignFor.patient_name}` : 'Route patient'}
      >
        <form onSubmit={assign} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Clinician</label>
            <select className="input-field" value={assignDoctorId} onChange={(e) => setAssignDoctorId(e.target.value)} required>
              <option value="">Choose a clinician…</option>
              {routableDoctors.map((d) => (
                <option key={d.doctor_id} value={d.doctor_id}>
                  {d.name}{d.specialty ? ` · ${d.specialty}` : ''}
                </option>
              ))}
            </select>
            {/* Only a prescriber with a login here can be handed a queue. Naming
                the others explains why the list is shorter than the wall. */}
            {doctors.some((d) => !d.has_account) && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '6px' }}>
                Not listed: {doctors.filter((d) => !d.has_account).map((d) => d.name).join(', ')} — no account here, so a patient cannot be routed to them.
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAssignFor(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
              <ArrowRight size={16} /> Send to consulting room
            </button>
          </div>
        </form>
      </Modal>

      {/* Consultation write-up */}
      <Modal
        isOpen={Boolean(assessFor)}
        onClose={() => setAssessFor(null)}
        title={assessFor ? `Consultation — #${assessFor.queue_number} ${assessFor.patient_name}` : 'Consultation'}
      >
        <form onSubmit={saveAssessment} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>What was assessed</label>
            <textarea
              className="input-field"
              rows={5}
              value={assessment}
              onChange={(e) => setAssessment(e.target.value)}
              placeholder="Findings and what was advised"
              required
            />
            <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginTop: '4px' }}>
              A record of what the clinician assessed. It is never a computed diagnosis.
            </p>
          </div>
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.9rem', color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={sendToDispensary}
              onChange={(e) => setSendToDispensary(e.target.checked)}
            />
            Send the patient to the dispensing counter
          </label>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
            {sendToDispensary
              ? 'The visit moves to the counter and stays open until the sale is rung up.'
              : 'The visit closes now, with nothing to collect.'}
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setAssessFor(null)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={busy}>
              <ClipboardList size={16} /> Record
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Field({ label, placeholder, value, onChange }) {
  return (
    <div>
      <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>{label}</label>
      <input
        type="text"
        className="input-field"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function VisitCard({ visit: v, isClinical, canRoute, busy, onVitals, onAssign, onAssess, onMove }) {
  const vitals = v.latest_vitals;
  const closed = v.status === 'COMPLETED' || v.status === 'CANCELLED';

  return (
    <div
      style={{
        background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '16px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: '16px', flexWrap: 'wrap',
        opacity: closed ? 0.65 : 1
      }}
    >
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', minWidth: '240px' }}>
        <div
          style={{
            background: STATUS_COLOR[v.status] || 'var(--text-3)', color: '#0b0b0b',
            width: '42px', height: '42px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1rem'
          }}
        >
          #{v.queue_number}
        </div>
        <div>
          <h4 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text)' }}>{v.patient_name}</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
            {v.doctor_name ? <>Clinician: <span style={{ color: '#60a5fa' }}>{v.doctor_name}</span></> : 'Not yet routed'}
          </p>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>{v.reason || 'No reason recorded'}</p>
        </div>
      </div>

      <div style={{ minWidth: '200px' }}>
        {/* Driven by what the server returned, so a visit with readings can no
            longer report "Vitals Pending". */}
        {vitals ? (
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)',
              padding: '8px 12px', borderRadius: '8px', fontSize: '0.78rem', color: '#4ade80'
            }}
          >
            <strong>Vitals</strong>
            {vitals.bp ? ` · BP ${vitals.bp}` : ''}
            {vitals.temperature ? ` · ${vitals.temperature}°C` : ''}
            {vitals.heart_rate ? ` · HR ${vitals.heart_rate}` : ''}
            {vitals.spo2 ? ` · SpO₂ ${vitals.spo2}` : ''}
            {v.vitals_count > 1 ? ` (${v.vitals_count} readings)` : ''}
          </div>
        ) : (
          <span className="badge badge-yellow">No vitals yet</span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <span
          className="badge"
          style={{ color: STATUS_COLOR[v.status], border: `1px solid ${STATUS_COLOR[v.status]}40` }}
        >
          {STATUS_LABEL[v.status] || v.status}
        </span>

        {!closed && isClinical && (
          <button className="btn" style={{ background: '#8b5cf6', padding: '6px 12px', fontSize: '0.8rem' }} onClick={onVitals} disabled={busy}>
            <Activity size={14} /> Vitals
          </button>
        )}

        {['WAITING', 'TRIAGE'].includes(v.status) && canRoute && (
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={onAssign} disabled={busy}>
            <ArrowRight size={14} /> Route
          </button>
        )}

        {v.status === 'IN_PROGRESS' && isClinical && (
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={onAssess} disabled={busy}>
            <ClipboardList size={14} /> Write up
          </button>
        )}

        {v.status === 'DISPENSING' && (
          <button className="btn btn-success" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => onMove('COMPLETED')} disabled={busy}>
            <CheckCircle size={14} /> Close visit
          </button>
        )}

        {!closed && canRoute && (
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.8rem', color: '#f87171' }}
            onClick={() => onMove('CANCELLED')}
            disabled={busy}
            title="Cancel this visit"
          >
            <XCircle size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
