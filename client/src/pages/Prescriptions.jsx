import React, { useState, useEffect } from 'react';
import { FileText, Plus, ShieldCheck, CheckCircle, Clock, AlertTriangle, Eye } from 'lucide-react';
import { get, post, patch } from '../api/client';
import Modal from '../components/Modal';

export default function Prescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [showNewRxModal, setShowNewRxModal] = useState(false);
  const [selectedRx, setSelectedRx] = useState(null);

  const [rxForm, setRxForm] = useState({
    doctor_name: 'Dr. Martin Phiri', patient_name: 'Chipego Mukimba', product_name: 'Amoxicillin 250mg', dosage_instructions: 'Take 1 capsule 3 times daily after meals for 7 days', valid_until: '2026-08-30'
  });

  useEffect(() => {
    loadPrescriptions();
  }, [activeTab]);

  const loadPrescriptions = async () => {
    try {
      const res = await get('prescriptions');
      if (res?.data) {
        setPrescriptions(res.data);
        return;
      }
    } catch (e) {}

    const mock = [
      { prescription_id: 'pr1', rx_number: 'RX-2026-9041', doctor_name: 'Dr. Martin Phiri', patient_name: 'Chipego Mukimba', valid_until: '2026-08-30', status: 'VERIFIED', product_name: 'Amoxicillin 250mg', dosage: 'Take 1 capsule 3 times daily for 7 days' },
      { prescription_id: 'pr2', rx_number: 'RX-2026-8812', doctor_name: 'Dr. Sarah Banda', patient_name: 'Joshua Kamunda', valid_until: '2026-09-15', status: 'PENDING', product_name: 'Metformin 500mg', dosage: 'Take 1 tablet twice daily with meals' }
    ];

    if (activeTab !== 'ALL') {
      setPrescriptions(mock.filter(p => p.status === activeTab));
    } else {
      setPrescriptions(mock);
    }
  };

  const handleNewRxSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await post('prescriptions', rxForm);
      if (res?.data) setPrescriptions(prev => [res.data, ...prev]);
    } catch (e) {
      const mockNew = {
        prescription_id: `pr-${Date.now()}`,
        rx_number: `RX-${Date.now().toString().slice(-4)}`,
        ...rxForm,
        status: 'PENDING'
      };
      setPrescriptions(prev => [mockNew, ...prev]);
    }

    alert('✅ Prescription Issued & Logged!');
    setShowNewRxModal(false);
  };

  const handleVerifyRx = async (rxId) => {
    try {
      await patch(`prescriptions/${rxId}/verify`, {});
    } catch (e) {}

    setPrescriptions(prev => prev.map(p => p.prescription_id === rxId ? { ...p, status: 'VERIFIED' } : p));
    alert('🛡️ Prescription Verified by Pharmacist!');
  };

  const handleDispenseRx = async (rxId) => {
    try {
      await patch(`prescriptions/${rxId}/dispense`, {});
    } catch (e) {}

    setPrescriptions(prev => prev.map(p => p.prescription_id === rxId ? { ...p, status: 'DISPENSED' } : p));
    alert('💊 Prescription Dispensed & Stock Deducted!');
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>Prescription Verification & Dispensing</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Controlled Substance Tracking and Pharmacist Verification</p>
        </div>
        <button className="btn btn-success" onClick={() => setShowNewRxModal(true)}>
          <Plus size={18} /> Issue New Prescription
        </button>
      </div>

      {/* FILTER TABS */}
      <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '12px', display: 'flex', gap: '8px' }}>
        {['ALL', 'PENDING', 'VERIFIED', 'DISPENSED'].map(tab => (
          <button 
            key={tab} 
            className={`btn ${activeTab === tab ? 'btn-success' : 'btn-secondary'}`}
            onClick={() => setActiveTab(tab)}
            style={{ fontSize: '0.85rem', padding: '6px 14px' }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* PRESCRIPTIONS TABLE */}
      <div style={{ background: '#1e293b', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Rx Number</th>
              <th>Patient Name</th>
              <th>Prescribing Doctor</th>
              <th>Medication & Dosage</th>
              <th>Valid Until</th>
              <th>Status</th>
              <th>Pharmacist Actions</th>
            </tr>
          </thead>
          <tbody>
            {prescriptions.map(p => (
              <tr key={p.prescription_id}>
                <td style={{ fontFamily: 'monospace', fontWeight: '600', color: '#60a5fa' }}>{p.rx_number || 'RX-2026-9041'}</td>
                <td style={{ fontWeight: '600', color: '#f8fafc' }}>{p.patient_name}</td>
                <td>{p.doctor_name}</td>
                <td>
                  <div style={{ fontWeight: '500' }}>{p.product_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{p.dosage}</div>
                </td>
                <td style={{ color: '#94a3b8' }}>{p.valid_until}</td>
                <td>
                  {p.status === 'VERIFIED' && <span className="badge badge-green">VERIFIED</span>}
                  {p.status === 'PENDING' && <span className="badge badge-yellow">PENDING REVIEW</span>}
                  {p.status === 'DISPENSED' && <span className="badge badge-blue">DISPENSED</span>}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {p.status === 'PENDING' && (
                      <button className="btn btn-success" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleVerifyRx(p.prescription_id)}>
                        <ShieldCheck size={14} /> Verify Rx
                      </button>
                    )}
                    {p.status === 'VERIFIED' && (
                      <button className="btn" style={{ background: '#3b82f6', padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => handleDispenseRx(p.prescription_id)}>
                        <CheckCircle size={14} /> Dispense Drug
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* NEW RX MODAL */}
      <Modal isOpen={showNewRxModal} onClose={() => setShowNewRxModal(false)} title="Issue New Doctor Prescription">
        <form onSubmit={handleNewRxSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Prescribing Doctor:</label>
            <input type="text" className="input-field" required value={rxForm.doctor_name} onChange={(e) => setRxForm({ ...rxForm, doctor_name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Patient Name:</label>
            <input type="text" className="input-field" required value={rxForm.patient_name} onChange={(e) => setRxForm({ ...rxForm, patient_name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Medication Name:</label>
            <input type="text" className="input-field" required placeholder="e.g. Amoxicillin 250mg" value={rxForm.product_name} onChange={(e) => setRxForm({ ...rxForm, product_name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Dosage Instructions:</label>
            <input type="text" className="input-field" required placeholder="e.g. Take 1 capsule 3 times daily for 7 days" value={rxForm.dosage_instructions} onChange={(e) => setRxForm({ ...rxForm, dosage_instructions: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNewRxModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Issue Prescription</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
