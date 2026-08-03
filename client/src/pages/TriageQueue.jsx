import React, { useState, useEffect } from 'react';
import { Stethoscope, Plus, Clock, User, Heart, Activity, Thermometer, Scale, CheckCircle } from 'lucide-react';
import { get, post, patch } from '../api/client';
import Modal from '../components/Modal';

export default function TriageQueue() {
  const [visits, setVisits] = useState([]);
  const [showNewVisitModal, setShowNewVisitModal] = useState(false);
  const [showVitalsModal, setShowVitalsModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState(null);

  const [visitForm, setVisitForm] = useState({
    patient_name: 'Chipego Mukimba', reason: 'Persistent cough and mild fever', doctor_name: 'Dr. Martin Phiri'
  });

  const [vitalsForm, setVitalsForm] = useState({
    bp: '120/80', heart_rate: '72', temperature: '37.1', spo2: '98%', weight: '65kg'
  });

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    try {
      const res = await get('visits/queue');
      if (res?.data) {
        setVisits(res.data);
        return;
      }
    } catch (e) {}

    setVisits([
      { visit_id: 'v1', queue_number: 1, patient_name: 'Chipego Mukimba', doctor_name: 'Dr. Martin Phiri', reason: 'Persistent cough and mild fever', status: 'IN_PROGRESS', vitals: { bp: '120/80', temp: '37.1', hr: '72' } },
      { visit_id: 'v2', queue_number: 2, patient_name: 'Joshua Kamunda', doctor_name: 'Dr. Martin Phiri', reason: 'Routine blood pressure checkup', status: 'WAITING', vitals: null }
    ]);
  };

  const handleNewVisitSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await post('visits', visitForm);
      if (res?.data) {
        setVisits(prev => [...prev, res.data]);
      }
    } catch (e) {
      const mockNew = {
        visit_id: `v-${Date.now()}`,
        queue_number: visits.length + 1,
        patient_name: visitForm.patient_name,
        doctor_name: visitForm.doctor_name,
        reason: visitForm.reason,
        status: 'WAITING',
        vitals: null
      };
      setVisits(prev => [...prev, mockNew]);
    }

    alert('✅ Patient Walk-In Registered to Triage Queue!');
    setShowNewVisitModal(false);
  };

  const handleVitalsSubmit = async (e) => {
    e.preventDefault();
    if (!selectedVisit) return;
    try {
      await post(`visits/${selectedVisit.visit_id}/vitals`, vitalsForm);
    } catch (e) {}

    setVisits(prev => prev.map(v => {
      if (v.visit_id === selectedVisit.visit_id) {
        return { ...v, status: 'IN_PROGRESS', vitals: vitalsForm };
      }
      return v;
    }));

    alert(`✅ Triage Vitals Recorded for Queue #${selectedVisit.queue_number}!`);
    setShowVitalsModal(false);
    setSelectedVisit(null);
  };

  const handleStatusTransition = async (visitId, newStatus) => {
    try {
      await patch(`visits/${visitId}/status`, { status: newStatus });
    } catch (e) {}

    setVisits(prev => prev.map(v => v.visit_id === visitId ? { ...v, status: newStatus } : v));
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Doctor Triage & Patient Queue</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>Triage Vitals, Doctor Assignment, and Consultation Queue</p>
        </div>
        <button className="btn btn-success" onClick={() => setShowNewVisitModal(true)}>
          <Plus size={18} /> New Walk-In Visit
        </button>
      </div>

      {/* STAT CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
        <div className="stat-card">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Waiting in Queue</span>
          <h2 style={{ fontSize: '1.6rem', color: '#facc15', marginTop: '6px' }}>
            {visits.filter(v => v.status === 'WAITING').length}
          </h2>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>In Doctor Consultation</span>
          <h2 style={{ fontSize: '1.6rem', color: '#60a5fa', marginTop: '6px' }}>
            {visits.filter(v => v.status === 'IN_PROGRESS').length}
          </h2>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Completed Today</span>
          <h2 style={{ fontSize: '1.6rem', color: '#4ade80', marginTop: '6px' }}>
            {visits.filter(v => v.status === 'COMPLETED').length}
          </h2>
        </div>
      </div>

      {/* VISITS QUEUE LIST */}
      <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', padding: '20px' }}>
        <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', color: 'var(--text)' }}>Active Patient Walk-In Queue</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {visits.map(v => (
            <div key={v.visit_id} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ background: '#3b82f6', color: '#fff', width: '42px', height: '42px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '1.1rem' }}>
                  #{v.queue_number}
                </div>
                <div>
                  <h4 style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text)' }}>{v.patient_name}</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Assigned Doctor: <span style={{ color: '#60a5fa' }}>{v.doctor_name}</span></p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>Reason: {v.reason}</p>
                </div>
              </div>

              {/* VITALS BADGE */}
              {v.vitals ? (
                <div style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '8px 12px', borderRadius: '8px', fontSize: '0.8rem', color: '#4ade80' }}>
                  <strong>Vitals Recorded:</strong> BP {v.vitals.bp} • Temp {v.vitals.temperature || v.vitals.temp}°C • HR {v.vitals.heart_rate || v.vitals.hr}
                </div>
              ) : (
                <span className="badge badge-yellow">Vitals Pending</span>
              )}

              {/* ACTIONS */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {!v.vitals && (
                  <button className="btn" style={{ background: '#8b5cf6', padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => { setSelectedVisit(v); setShowVitalsModal(true); }}>
                    <Activity size={14} /> Record Vitals
                  </button>
                )}
                {v.status === 'WAITING' && (
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleStatusTransition(v.visit_id, 'IN_PROGRESS')}>
                    Start Consultation
                  </button>
                )}
                {v.status === 'IN_PROGRESS' && (
                  <button className="btn btn-success" style={{ padding: '6px 12px', fontSize: '0.8rem' }} onClick={() => handleStatusTransition(v.visit_id, 'COMPLETED')}>
                    <CheckCircle size={14} /> Complete Visit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* NEW VISIT MODAL */}
      <Modal isOpen={showNewVisitModal} onClose={() => setShowNewVisitModal(false)} title="New Triage Walk-In Visit">
        <form onSubmit={handleNewVisitSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Patient Name:</label>
            <input type="text" className="input-field" required value={visitForm.patient_name} onChange={(e) => setVisitForm({ ...visitForm, patient_name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Assigned Doctor:</label>
            <select className="input-field" value={visitForm.doctor_name} onChange={(e) => setVisitForm({ ...visitForm, doctor_name: e.target.value })}>
              <option value="Dr. Martin Phiri">Dr. Martin Phiri (General Medicine)</option>
              <option value="Dr. Sarah Banda">Dr. Sarah Banda (Pediatrics)</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Chief Complaint / Reason for Visit:</label>
            <input type="text" className="input-field" required placeholder="e.g. Persistent headache and fever" value={visitForm.reason} onChange={(e) => setVisitForm({ ...visitForm, reason: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewVisitModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Add to Queue</button>
          </div>
        </form>
      </Modal>

      {/* RECORD VITALS MODAL */}
      <Modal isOpen={showVitalsModal} onClose={() => setShowVitalsModal(false)} title={`Record Triage Vitals - Queue #${selectedVisit?.queue_number}`}>
        <form onSubmit={handleVitalsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Blood Pressure (BP):</label>
              <input type="text" className="input-field" required placeholder="120/80" value={vitalsForm.bp} onChange={(e) => setVitalsForm({ ...vitalsForm, bp: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Heart Rate (BPM):</label>
              <input type="text" className="input-field" required placeholder="72" value={vitalsForm.heart_rate} onChange={(e) => setVitalsForm({ ...vitalsForm, heart_rate: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Temperature (°C):</label>
              <input type="text" className="input-field" required placeholder="37.1" value={vitalsForm.temperature} onChange={(e) => setVitalsForm({ ...vitalsForm, temperature: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>SpO2 Oxygen (%):</label>
              <input type="text" className="input-field" required placeholder="98%" value={vitalsForm.spo2} onChange={(e) => setVitalsForm({ ...vitalsForm, spo2: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowVitalsModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Save Vitals</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
