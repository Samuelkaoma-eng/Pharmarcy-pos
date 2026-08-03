import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ShieldCheck, Clock, Users, ArrowRight } from 'lucide-react';

export default function CHDashboard() {
  const navigate = useNavigate();

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>ControlHub Super-Admin Dashboard</h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Multi-Tenant Pharmacy Platform Supervision & Onboarding</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div className="stat-card">
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Total Pharmacy Sites</span>
          <h2 style={{ fontSize: '1.6rem', color: '#60a5fa', marginTop: '6px' }}>2 Branches</h2>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Active Verified Sites</span>
          <h2 style={{ fontSize: '1.6rem', color: '#4ade80', marginTop: '6px' }}>1 Active</h2>
        </div>
        <div className="stat-card">
          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Onboarding Under Review</span>
          <h2 style={{ fontSize: '1.6rem', color: '#facc15', marginTop: '6px' }}>1 Pending</h2>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ background: '#1e293b', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '10px' }}>Pharmacy Tenants</h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px' }}>Review active tenant facilities, license verification numbers, and owner contacts.</p>
          <button className="btn btn-success" onClick={() => navigate('/controlhub/tenants')}>
            Manage Tenants <ArrowRight size={16} />
          </button>
        </div>

        <div style={{ background: '#1e293b', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: '1.1rem', marginBottom: '10px' }}>Branch Onboarding Reviews</h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px' }}>Inspect pending pharmacy registration applications and compliance documentation.</p>
          <button className="btn btn-secondary" onClick={() => navigate('/controlhub/onboarding')}>
            Review Onboarding <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
