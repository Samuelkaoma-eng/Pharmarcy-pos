import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Check, X, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { get, put } from '../../api/client';

const EASE = [0.23, 1, 0.32, 1];

function Switch({ checked, onChange, label, description }) {
  return (
    <div className="ch-toggle-row">
      <div>
        <p>{label}</p>
        <small>{description}</small>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-on={checked ? 'true' : 'false'}
        className="ch-switch"
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}

function SettingsPanel({ tenantId }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    get(`controlhub/tenants/${tenantId}/settings`).then((res) => {
      if (active && res?.data) setSettings(res.data);
    });
    return () => { active = false; };
  }, [tenantId]);

  const save = async () => {
    setSaving(true);
    const res = await put(`controlhub/tenants/${tenantId}/settings`, {
      expiry_alert_days: Number(settings.expiry_alert_days),
      low_stock_alerts: settings.low_stock_alerts,
      require_customer_on_sale: settings.require_customer_on_sale,
      allow_public_registration: settings.allow_public_registration
    });

    if (res?.data) {
      setSettings(res.data);
      toast.success('Settings updated', { description: `Applied to ${res.data.name}.` });
    } else {
      toast.error('Could not update settings', { description: res?.error || 'The server rejected the change.' });
    }
    setSaving(false);
  };

  if (!settings) return <p className="ch-settings-loading">Loading settings…</p>;

  return (
    <div className="ch-settings">
      <div className="ch-toggle-row">
        <div>
          <p>Expiry alert window</p>
          <small>How many days ahead expiring batches are flagged.</small>
        </div>
        <input
          type="number"
          min={7}
          max={365}
          className="input-field ch-days-input"
          value={settings.expiry_alert_days}
          onChange={(e) => setSettings({ ...settings, expiry_alert_days: e.target.value })}
        />
      </div>

      <Switch
        label="Low stock alerts"
        description="Warn this pharmacy when stock falls below its reorder level."
        checked={settings.low_stock_alerts}
        onChange={(v) => setSettings({ ...settings, low_stock_alerts: v })}
      />
      <Switch
        label="Require customer on sale"
        description="Every sale must be linked to a patient record."
        checked={settings.require_customer_on_sale}
        onChange={(v) => setSettings({ ...settings, require_customer_on_sale: v })}
      />
      <Switch
        label="Allow public registration"
        description="Let staff self-register without an administrator invitation."
        checked={settings.allow_public_registration}
        onChange={(v) => setSettings({ ...settings, allow_public_registration: v })}
      />

      <button className="btn btn-primary" disabled={saving} style={{ width: '100%', marginTop: '14px' }} onClick={save}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </div>
  );
}

export default function CHTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    const res = await get('controlhub/tenants');
    // No invented fallback rows: an empty list is the truth when the platform
    // has no tenants, and a failure is reported rather than papered over.
    if (res?.data) setTenants(res.data);
    else toast.error('Could not load tenants', { description: res?.error || 'Check the backend server.' });
    setLoading(false);
  }, []);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const handleStatusChange = async (tenantId, newStatus, name) => {
    const res = await put(`controlhub/tenants/${tenantId}/status`, { status: newStatus });

    if (res?.data) {
      setTenants((prev) => prev.map((t) => (t.tenant_id === tenantId ? { ...t, status: newStatus } : t)));
      toast.success(
        newStatus === 'ACTIVE' ? 'Pharmacy activated' : 'Pharmacy suspended',
        { description: `${name} is now ${newStatus.toLowerCase()}.` }
      );
    } else {
      toast.error('Could not update status', { description: res?.error || 'The server rejected the change.' });
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>Tenant management</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>
            Approve pharmacies and set the operational limits they run under.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadTenants} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {!loading && tenants.length === 0 && (
        <p style={{ color: '#94a3b8' }}>No pharmacies registered yet.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
        {tenants.map((t, i) => (
          <motion.div
            key={t.tenant_id}
            className="ch-tenant-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: EASE, delay: Math.min(i * 0.04, 0.2) }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '1.1rem', color: '#fff' }}>{t.name}</h3>
                <span className={`badge ${t.status === 'ACTIVE' ? 'badge-green' : t.status === 'REJECTED' ? 'badge-red' : 'badge-yellow'}`}>
                  {t.status}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{t.address || 'No address on file'}</p>
              <p style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>{t.owner_email}</p>
              {t.users_count !== undefined && (
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>{t.users_count} staff account(s)</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '14px' }}>
              {t.status !== 'ACTIVE' ? (
                <button className="btn btn-success" style={{ flex: 1 }} onClick={() => handleStatusChange(t.tenant_id, 'ACTIVE', t.name)}>
                  <Check size={16} /> Activate
                </button>
              ) : (
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => handleStatusChange(t.tenant_id, 'REJECTED', t.name)}>
                  <X size={16} /> Suspend
                </button>
              )}
              <button
                className="btn btn-secondary"
                aria-expanded={openId === t.tenant_id}
                onClick={() => setOpenId(openId === t.tenant_id ? null : t.tenant_id)}
              >
                <SlidersHorizontal size={16} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {openId === t.tenant_id && (
                <motion.div
                  key="panel"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.26, ease: EASE }}
                  style={{ overflow: 'hidden' }}
                >
                  <SettingsPanel tenantId={t.tenant_id} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
