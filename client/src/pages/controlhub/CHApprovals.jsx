import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { GitPullRequestArrow, Check, X, Plus, UserCheck } from 'lucide-react';
import { get, post, patch } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/Modal';

const EASE = [0.23, 1, 0.32, 1];

const STATUS_TONE = { PENDING: 'badge-yellow', APPROVED: 'badge-green', REJECTED: 'badge-red' };

export default function CHApprovals() {
  const { user: me } = useAuth();
  const [requests, setRequests] = useState([]);
  const [actions, setActions] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ action: '', tenant_id: '', reason: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [reqRes, actRes, tenRes] = await Promise.all([
      get('controlhub/approvals'),
      get('controlhub/approvals/actions'),
      get('controlhub/tenants')
    ]);
    if (reqRes?.data) setRequests(reqRes.data);
    else toast.error('Could not load approvals', { description: reqRes?.error || 'Check the backend server.' });
    if (actRes?.data) setActions(actRes.data);
    if (tenRes?.data) setTenants(tenRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRaise = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post('controlhub/approvals', {
      action: form.action,
      payload: { tenant_id: form.tenant_id },
      tenant_id: form.tenant_id,
      reason: form.reason
    });

    if (res?.data) {
      toast.success('Request raised', { description: 'It now needs a second administrator to decide it.' });
      setRaising(false);
      setForm({ action: '', tenant_id: '', reason: '' });
      await load();
    } else {
      toast.error('Could not raise the request', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const handleDecide = async (id, decision) => {
    setBusy(true);
    const res = await patch(`controlhub/approvals/${id}/decide`, { decision });
    if (res?.data) {
      toast.success(decision === 'APPROVED' ? 'Approved and applied' : 'Request rejected');
      await load();
    } else {
      toast.error('Could not record the decision', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const labelFor = (action) => actions.find((a) => a.action === action)?.label || action;

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <h1>Approvals</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '4px' }}>
            Sensitive changes are proposed by one administrator and carried out only once another agrees.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setRaising(true)}>
          <Plus size={15} /> Raise a request
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-3)' }}>Loading requests…</p>}
      {!loading && requests.length === 0 && (
        <p style={{ color: 'var(--text-3)' }}>Nothing has been raised for approval.</p>
      )}

      <div className="staff-list">
        <AnimatePresence initial={false}>
          {requests.map((r, i) => {
            const mine = r.requested_by_id === me?.userId;
            return (
              <motion.div
                key={r.request_id}
                className="approval-row"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26, ease: EASE, delay: Math.min(i * 0.03, 0.18) }}
              >
                <div className="approval-main">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap' }}>
                    <GitPullRequestArrow size={15} style={{ color: 'var(--text-3)' }} />
                    <p>{labelFor(r.action)}</p>
                    <span className={`badge ${STATUS_TONE[r.status]}`}>{r.status}</span>
                  </div>
                  {r.tenant_name && <small>Target: {r.tenant_name}</small>}
                  <small>Reason: {r.reason}</small>
                  <small>
                    Raised by {r.requested_by_name}
                    {r.decided_by_name && ` · decided by ${r.decided_by_name}`}
                  </small>
                </div>

                <div className="approval-actions">
                  {r.status !== 'PENDING' ? (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>Closed</span>
                  ) : mine ? (
                    /* The whole point of the mechanism: your own request is not
                       yours to approve. */
                    <span className="approval-blocked">
                      <UserCheck size={13} /> Awaiting another administrator
                    </span>
                  ) : (
                    <>
                      <button className="btn btn-success" disabled={busy} onClick={() => handleDecide(r.request_id, 'APPROVED')}>
                        <Check size={14} /> Approve
                      </button>
                      <button className="btn btn-danger" disabled={busy} onClick={() => handleDecide(r.request_id, 'REJECTED')}>
                        <X size={14} /> Reject
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <Modal isOpen={raising} onClose={() => setRaising(false)} title="Raise a request">
        <form onSubmit={handleRaise} className="login-form">
          <div>
            <label htmlFor="a-action">Action</label>
            <select id="a-action" className="input-field" required value={form.action}
              onChange={(e) => setForm({ ...form, action: e.target.value })}>
              <option value="">Choose an action…</option>
              {actions.map((a) => <option key={a.action} value={a.action}>{a.label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="a-tenant">Pharmacy</label>
            <select id="a-tenant" className="input-field" required value={form.tenant_id}
              onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}>
              <option value="">Choose a pharmacy…</option>
              {tenants.map((t) => <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="a-reason">Reason</label>
            <textarea id="a-reason" className="input-field" required rows={3}
              placeholder="What the approver needs to know to judge this"
              value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>

          <p className="form-note">
            <UserCheck size={13} /> You will not be able to approve this yourself.
          </p>

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Submitting…' : 'Raise request'}
          </button>
        </form>
      </Modal>
    </div>
  );
}
