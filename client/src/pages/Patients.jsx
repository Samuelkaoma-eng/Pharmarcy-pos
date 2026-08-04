import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Search, Phone, Mail, FileText, Calendar, Eye } from 'lucide-react';
import { toast } from 'sonner';
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
    // This used to fall back to three invented patients, with invented NRCs and
    // addresses, whenever the load failed. A patient list is a clinical record:
    // an outage must look like an outage, not like a roster of people who do
    // not exist (DEF-057, the client half of LIM-003).
    try {
      const res = await get('patients');
      if (res?.data) {
        setPatients(res.data);
        return;
      }
      toast.error('Could not load patients', { description: res?.error || 'The server did not return a list.' });
    } catch (e) {
      toast.error('Could not load patients', { description: 'Check the backend connection.' });
    }

    setPatients([]);
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();

    // Previously this invented a local patient when the save failed, and then
    // announced success unconditionally — outside the try, and even when the
    // server had returned nothing. Staff were told a patient was registered who
    // had never been written to the database, and could then be selected at the
    // till. Success is now reported only when the server says so (DEF-057).
    let created = null;
    try {
      const res = await post('patients', form);
      created = res?.data || null;
      if (!created) {
        toast.error('Patient not registered', { description: res?.error || 'The server did not confirm the record.' });
      }
    } catch (err) {
      toast.error('Patient not registered', { description: 'Check the backend connection and try again.' });
    }

    if (!created) return;

    setPatients(prev => [created, ...prev]);
    toast.success(`Patient '${created.name}' registered`);
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
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Patient & Customer Registry</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>Demographics, Prescription History, and Triage Records</p>
        </div>
        <button className="btn btn-success" onClick={() => setShowRegisterModal(true)}>
          <UserPlus size={18} /> Register New Patient
        </button>
      </div>

      {/* SEARCH BAR */}
      <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search patient by Name, NRC (e.g. 111222/10/1), or Phone number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
          <Search size={18} color="var(--text-2)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        </div>
      </div>

      {/* PATIENTS TABLE */}
      <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
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
                <td style={{ fontWeight: '600', color: 'var(--text)' }}>{p.name}</td>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-2)' }}>{p.nrc || 'N/A'}</td>
                <td>{p.phone}</td>
                <td>{p.gender} • {p.dob || '1995-01-01'}</td>
                <td style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>{p.address}</td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setSelectedPatient(p)}>
                    <Eye size={14} /> View History
                  </button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-3)' }}>No patients found.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* REGISTER MODAL */}
      <Modal isOpen={showRegisterModal} onClose={() => setShowRegisterModal(false)} title="Register New Patient">
        <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Full Patient Name:</label>
            <input type="text" className="input-field" required placeholder="e.g. Chipego Mukimba" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>NRC Number:</label>
              <input type="text" className="input-field" placeholder="111222/10/1" value={form.nrc} onChange={(e) => setForm({ ...form, nrc: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Phone Number:</label>
              <input type="text" className="input-field" required placeholder="+260971234567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Gender:</label>
              <select className="input-field" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Date of Birth:</label>
              <input type="date" className="input-field" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Address / Location:</label>
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
            <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '10px' }}>
              <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>{selectedPatient.name}</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>NRC: {selectedPatient.nrc || 'N/A'} • Phone: {selectedPatient.phone}</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Address: {selectedPatient.address}</p>
            </div>

            <h4 style={{ fontSize: '0.95rem', color: '#60a5fa' }}>Clinical & Prescription History:</h4>
            <div style={{ background: 'var(--bg)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-2)' }}>
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
