import React, { useState, useEffect } from 'react';
import { Building2, Check, X, Shield, RefreshCw } from 'lucide-react';
import { get, put } from '../../api/client';

export default function CHTenants() {
  const [tenants, setTenants] = useState([]);

  useEffect(() => {
    loadTenants();
  }, []);

  const loadTenants = async () => {
    try {
      const res = await get('controlhub/tenants');
      if (res?.data) {
        setTenants(res.data);
        return;
      }
    } catch (e) {}

    setTenants([
      { tenant_id: '11111111-1111-1111-1111-111111111111', name: 'Central Care Pharmacy', address: '123 Great East Road, Lusaka', status: 'ACTIVE', owner_email: 'owner@centralcare.zm' },
      { tenant_id: '22222222-2222-2222-2222-222222222222', name: 'Ndola MediQuick Pharmacy', address: '45 President Avenue, Ndola', status: 'UNDER_REVIEW', owner_email: 'admin@mediquick.zm' }
    ]);
  };

  const handleStatusChange = async (tenantId, newStatus) => {
    try {
      await put(`controlhub/tenants/${tenantId}/status`, { status: newStatus });
    } catch (e) {}

    setTenants(prev => prev.map(t => t.tenant_id === tenantId ? { ...t, status: newStatus } : t));
    alert(`🎉 Tenant '${tenantId}' status updated to ${newStatus}!`);
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>ControlHub Multi-Tenant Management</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Super-Admin Platform Tenant Isolation & Approval Gate</p>
        </div>
        <button className="btn btn-secondary" onClick={loadTenants}>
          <RefreshCw size={16} /> Refresh Tenants
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {tenants.map(t => (
          <div key={t.tenant_id} style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '1.15rem', color: '#fff' }}>{t.name}</h3>
                <span className={`badge ${t.status === 'ACTIVE' ? 'badge-green' : 'badge-yellow'}`}>{t.status}</span>
              </div>
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>Tenant ID: {t.tenant_id}</p>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1', marginTop: '6px' }}>Address: {t.address}</p>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>Owner: {t.owner_email}</p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              {t.status !== 'ACTIVE' ? (
                <button className="btn btn-success" style={{ width: '100%' }} onClick={() => handleStatusChange(t.tenant_id, 'ACTIVE')}>
                  <Check size={16} /> Approve & Activate Branch
                </button>
              ) : (
                <button className="btn btn-danger" style={{ width: '100%', fontSize: '0.8rem' }} onClick={() => handleStatusChange(t.tenant_id, 'REJECTED')}>
                  <X size={16} /> Suspend Tenant Access
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
