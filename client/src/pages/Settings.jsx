import React, { useState, useEffect } from 'react';
import { Palette, Check, Save, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { get, put } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { refreshTenant } = useAuth();
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
    } catch (e) {
      toast.error('Could not load settings', { description: 'Check the backend connection.' });
    }
  };

  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await put('tenants/config', config);

      // Only report success when the server actually saved. The previous
      // version swallowed the error and congratulated the user regardless.
      if (res?.data) {
        setConfig({ ...config, ...res.data });
        await refreshTenant();
        toast.success('Branding saved', { description: 'Your changes are live across the workspace.' });
      } else {
        toast.error('Could not save branding', { description: res?.error || 'The server rejected the change.' });
      }
    } catch {
      toast.error('Could not save branding', { description: 'Connection failed. Check the backend server.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '650px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Palette color="#3b82f6" /> Site Customizer & Settings
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>Customize pharmacy branding, theme colors, currency, and branch contact details.</p>
      </div>

      <form onSubmit={handleSave} style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '24px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Pharmacy Site Name:</label>
          <input type="text" className="input-field" value={config.name} onChange={(e) => setConfig({ ...config, name: e.target.value })} />
        </div>

        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Primary Theme Color Preset:</label>
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
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Currency Symbol:</label>
            <input type="text" className="input-field" value={config.currency_symbol} onChange={(e) => setConfig({ ...config, currency_symbol: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Phone Number:</label>
            <input type="text" className="input-field" value={config.phone} onChange={(e) => setConfig({ ...config, phone: e.target.value })} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Pharmacy logo URL:</label>
          <input
            type="url"
            className="input-field"
            placeholder="https://…"
            value={config.logo_url || ''}
            onChange={(e) => setConfig({ ...config, logo_url: e.target.value })}
          />
          {/* Shown here and on the printed receipt letterhead. */}
          {config.logo_url && (
            <img
              src={config.logo_url}
              alt="Pharmacy logo preview"
              className="logo-preview"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>

        <div>
          <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '6px' }}>Pharmacy Physical Address:</label>
          <input type="text" className="input-field" value={config.address} onChange={(e) => setConfig({ ...config, address: e.target.value })} />
        </div>

        <button type="submit" className="btn btn-success" disabled={saving} style={{ marginTop: '10px', padding: '12px' }}>
          <Save size={18} /> {saving ? 'Saving…' : 'Save branding'}
        </button>
      </form>

      {/* Operational limits belong to the platform, so they are shown here for
          transparency but cannot be edited from inside the pharmacy. */}
      <motion.div
        className="settings-card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1], delay: 0.06 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
          <Lock size={16} color="var(--text-2)" />
          <h3 style={{ fontSize: '1rem', fontWeight: 650 }}>Platform-managed settings</h3>
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginBottom: '16px' }}>
          These are set by platform staff in ControlHub. Contact them to request a change.
        </p>

        <div className="platform-settings">
          <div>
            <span>Expiry alert window</span>
            <strong>{config.expiry_alert_days ?? '—'} days</strong>
          </div>
          <div>
            <span>Low stock alerts</span>
            <strong>{config.low_stock_alerts ? 'On' : 'Off'}</strong>
          </div>
          <div>
            <span>Customer required on sale</span>
            <strong>{config.require_customer_on_sale ? 'Yes' : 'No'}</strong>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
