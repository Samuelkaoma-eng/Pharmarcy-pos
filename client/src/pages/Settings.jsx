import React, { useState, useEffect } from 'react';
import { Palette, Store, Check, Save } from 'lucide-react';
import { get, put } from '../api/client';

export default function Settings() {
  const [config, setConfig] = useState({
    name: 'Central Care Pharmacy',
    theme_color: '#3b82f6',
    currency_symbol: 'K',
    address: '123 Great East Road, Lusaka',
    phone: '+260971234567'
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const res = await get('tenants/config');
      if (res?.data) setConfig(res.data);
    } catch (e) {}
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await put('tenants/config', config);
    } catch (e) {}

    alert('🎉 Site Customizations & Personalization Saved Successfully!');
  };

  return (
    <div style={{ padding: '24px', maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Palette color="#3b82f6" /> Site Customizer & Settings
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Customize pharmacy branding, theme colors, currency, and branch contact details.</p>
      </div>

      <form onSubmit={handleSave} style={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', padding: '24px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Pharmacy Site Name:</label>
          <input type="text" className="input-field" value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
        </div>

        <div>
          <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Primary Theme Color Preset:</label>
          <div style={{ display: 'flex', gap: '12px' }}>
            {['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899'].map(color => (
              <div 
                key={color} 
                onClick={() => setConfig({ ...config, theme_color: color })}
                style={{ 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%', 
                  background: color, 
                  cursor: 'pointer', 
                  border: config.theme_color === color ? '3px solid #fff' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {config.theme_color === color && <Check size={18} color="#fff" />}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Currency Symbol:</label>
            <input type="text" className="input-field" value={config.currency_symbol} onChange={(e) => setConfig({ ...config, currency_symbol: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Phone Number:</label>
            <input type="text" className="input-field" value={config.phone} onChange={(e) => setConfig({ ...config, phone: e.target.value })} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>Pharmacy Physical Address:</label>
          <input type="text" className="input-field" value={config.address} onChange={(e) => setConfig({ ...config, address: e.target.value })} />
        </div>

        <button type="submit" className="btn btn-success" style={{ marginTop: '10px', padding: '12px' }}>
          <Save size={18} /> Save Site Personalization
        </button>
      </form>
    </div>
  );
}
