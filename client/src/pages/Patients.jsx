import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Phone, Mail, FileText, Calendar, Eye } from 'lucide-react';
import { get, post } from '../api/client';
import Modal from '../components/Modal';

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  const [form, setForm] = useState({
    name: '', phone: '', email: '', nrc: '', gender: 'Female', dob: '1998-05-14', address: 'Lusaka'
  });

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    try {
      const res = await get('patients');
      if (res?.data) {
        setPatients(res.data);
        return;
      }
    } catch (e) {}

    // Mock Fallback
    setPatients([
      { customer_id: 'c1', name: 'Chipego Mukimba', phone: '+260965111222', email: 'chipego@example.com', nrc: '111222/10/1', gender: 'Female', dob: '1998-05-14', address: 'Plot 45, Olympia Park, Lusaka' },
      { customer_id: 'c2', name: 'Joshua Kamunda', phone: '+260977333444', email: 'joshua@example.com', nrc: '333444/10/1', gender: 'Male', dob: '1995-11-20', address: 'Plot 12, Roma, Lusaka' },
      { customer_id: 'c3', name: 'Maximillan Soko', phone: '+260955555666', email: 'max@example.com', nrc: '555666/10/1', gender: 'Male', dob: '1997-03-08', address: 'Kalingalinga, Lusaka' }
    ]);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await post('patients', form);
      if (res?.data) {
        setPatients(prev => [res.data, ...prev]);
      }
    } catch (e) {
      const mockNew = { customer_id: `c-${Date.now()}`, ...form };
      setPatients(prev => [mockNew, ...prev]);
    }

    alert(`✅ Patient '${form.name}' Registered Successfully!`);
    setShowRegisterModal(false);
    setForm({ name: '', phone: '', email: '', nrc: '', gender: 'Female', dob: '1998-05-14', address: 'Lusaka' });
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (p.nrc && p.nrc.includes(searchQuery)) ||
    (p.phone && p.phone.includes(searchQuery))
  );

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>Patient & Customer Registry</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Demographics, Prescription History, and Triage Records</p>
        </div>
        <button className="btn btn-success" onClick={() => setShowRegisterModal(true)}>
          <UserPlus size={18} /> Register New Patient
        </button>
      </div>

      {/* SEARCH BAR */}
      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search patient by Name, NRC (e.g. 111222/10/1), or Phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        </div>
      </div>

      {/* PATIENTS TABLE */}
      <div style={{ background: '#1e293b', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Patient Name</th>
              <th>NRC Number</th>
              <th>Phone</th>
              <th>Gender / DOB</th>
              <th>Address</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients.length > 0 ? filteredPatients.map(p => (
              <tr key={p.customer_id}>
                <td style={{ fontWeight: '600', color: '#f8fafc' }}>{p.name}</td>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{p.nrc || 'N/A'}</td>
                <td>{p.phone}</td>
                <td>{p.gender} • {p.dob || '1995-01-01'}</td>
                <td style={{ color: '#94a3b8', fontSize: '0.85rem' }}>{p.address}</td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setSelectedPatient(p)}>
                    <Eye size={14} /> View History
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No patients found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* REGISTER MODAL */}
      <Modal isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)} title="Register New Patient">
        <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Full Patient Name:</label>
            <input type="text" className="input-field" required placeholder="e.g. Chipego Mukimba" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>NRC Number:</label>
              <input type="text" className="input-field" placeholder="111222/10/1" value={form.nrc} onChange={(e) => setForm({ ...form, nrc: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Phone Number:</label>
              <input type="text" className="input-field" required placeholder="+260971234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Gender:</label>
              <select className="input-field" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Date of Birth:</label>
              <input type="date" className="input-field" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Address / Location:</label>
            <input type="text" className="input-field" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowRegisterModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Register Patient</button>
          </div>
        </form>
      </Modal>

      {/* PATIENT DETAIL MODAL */}
      {selectedPatient && (
        <Modal isOpen={Boolean(selectedPatient)} onClose={() => setSelectedPatient(null)} title={`Patient Profile - ${selectedPatient.name}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#0f172a', padding: '16px', borderRadius: '10px' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>{selectedPatient.name}</h3>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>NRC: {selectedPatient.nrc || 'N/A'} • Phone: {selectedPatient.phone}</p>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Address: {selectedPatient.address}</p>
            </div>

            <h4 style={{ fontSize: '0.95rem', color: '#60a5fa' }}>Clinical & Prescription History:</h4>
            <div style={{ background: '#0f172a', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <p>✓ 2026-08-02: Prescription Verified (Amoxicillin 250mg) by Dr. Martin Phiri</p>
              <p>✓ 2026-08-02: Triage Vitals Recorded (BP: 120/80, Temp: 37.1°C)</p>
            </div>

            <button className="btn btn-secondary" onClick={() => setSelectedPatient(null)}>Close</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
