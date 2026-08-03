import React, { useState } from 'react';
import { Check, X, FileText, ShieldCheck, Clock } from 'lucide-react';

export default function CHOnboarding() {
  const [applications, setApplications] = useState([
    {
      id: 'app1',
      name: 'Ndola MediQuick Pharmacy',
      owner_email: 'admin@mediquick.zm',
      phone: '+260966888999',
      address: '45 President Avenue, Ndola',
      license: 'PHAR-ZM-2026-042',
      status: 'UNDER_REVIEW',
      submitted_at: '2026-08-02',
      documents: ['Pharmacy license', 'Owner NRC', 'Premises inspection form'],
      review_notes: 'License number format verified. Premises inspection still needs final reviewer sign-off.'
    }
  ]);

  const handleAction = (id, status) => {
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a));
    alert(`Application ${status === 'ACTIVE' ? 'approved and activated' : 'rejected'}.`);
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>Branch Onboarding Reviews</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Review pharmacy registration, compliance documents, and activation readiness.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {applications.map(app => (
          <div key={app.id} style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '20px', display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: '20px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px' }}>
                <h3 style={{ fontSize: '1.15rem', color: '#fff' }}>{app.name}</h3>
                <span className="badge badge-yellow">{app.status}</span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Owner: {app.owner_email} | Phone: {app.phone}</p>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>License #: <span style={{ fontFamily: 'monospace', color: '#60a5fa' }}>{app.license}</span></p>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Address: {app.address}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#cbd5e1', fontSize: '0.85rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={14} /> Submitted {app.submitted_at}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><ShieldCheck size={14} /> Compliance review in progress</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={14} /> {app.documents.length} documents attached</span>
              <p style={{ color: '#94a3b8', marginTop: '4px' }}>{app.review_notes}</p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {app.status === 'UNDER_REVIEW' ? (
                <>
                  <button className="btn btn-success" onClick={() => handleAction(app.id, 'ACTIVE')}>
                    <Check size={16} /> Approve & Activate
                  </button>
                  <button className="btn btn-danger" onClick={() => handleAction(app.id, 'REJECTED')}>
                    <X size={16} /> Reject
                  </button>
                </>
              ) : (
                <span style={{ fontSize: '0.9rem', color: '#4ade80', fontWeight: '600' }}>Process Complete ({app.status})</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
