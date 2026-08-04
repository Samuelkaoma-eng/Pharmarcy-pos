import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldCheck, CheckCircle, Eye, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { get, post, patch } from '../api/client';
import Modal from '../components/Modal';

// Prescription review and dispensing.
//
// The screen this replaces could not do either. It held a `selectedRx` state
// and imported an eye icon but never rendered a detail view, so a prescription
// could not actually be opened and read before being verified — which is the
// one thing a pharmacist has to do here. It displayed `product_name` and
// `dosage`, neither of which the list endpoint returns, so the medicine column
// was always blank; it printed the same invented reference `RX-2026-9041` on
// every row; and it posted typed names where the API takes patient, doctor and
// product ids, so issuing a prescription always failed and a fabricated one was
// pushed into local state instead.

const TABS = ['ALL', 'PENDING', 'VERIFIED', 'DISPENSED'];

const STATUS_BADGE = {
  PENDING: 'badge-yellow',
  VERIFIED: 'badge-green',
  DISPENSED: 'badge-blue',
  EXPIRED: ''
};

const shortId = (id) => (id ? id.slice(0, 8).toUpperCase() : '—');
const asDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

export default function Prescriptions() {
  const { user } = useAuth();
  const [prescriptions, setPrescriptions] = useState([]);
  const [activeTab, setActiveTab] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);

  const [patients, setPatients] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [products, setProducts] = useState([]);

  const [form, setForm] = useState({ customerId: '', doctorId: '', validUntil: '', notes: '' });
  const [lines, setLines] = useState([{ productId: '', dosageInstructions: '', quantity: 1 }]);

  const canVerify = ['Admin', 'Pharmacist', 'SuperAdmin'].includes(user?.role);
  const canIssue = ['Admin', 'Pharmacist', 'Doctor', 'SuperAdmin'].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true);
    // The tab is a server-side filter, so the list reflects it rather than the
    // screen quietly showing everything.
    const res = await get(`prescriptions${activeTab === 'ALL' ? '' : `?status=${activeTab}`}`);
    if (res?.data) {
      setPrescriptions(res.data);
      setError(null);
    } else {
      setError(res?.error || 'Prescriptions could not be loaded.');
      setPrescriptions([]);
    }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    (async () => {
      const [pat, doc, prod] = await Promise.all([get('patients'), get('doctors'), get('products')]);
      setPatients(pat?.data || []);
      setDoctors(doc?.data || []);
      setProducts(prod?.data || []);
    })();
  }, []);

  // The list carries a summary; the full prescription, its items and the stock
  // position of each medicine come from the single-prescription route.
  const openReview = async (row) => {
    setSelected({ ...row, loading: true });
    const res = await get(`prescriptions/${row.prescription_id}`);
    if (res?.data) setSelected({ ...res.data, loading: false });
    else {
      setSelected(null);
      toast.error(res?.error || 'That prescription could not be opened.');
    }
  };

  const act = async (id, action, label) => {
    setBusy(true);
    const res = await patch(`prescriptions/${id}/${action}`, {});
    setBusy(false);

    if (res?.data) {
      toast.success(label);
      setSelected(null);
      load();
    } else {
      toast.error(res?.error || `The prescription could not be ${action === 'verify' ? 'verified' : 'dispensed'}.`);
    }
  };

  const setLine = (i, patch_) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch_ } : l)));

  const issue = async (e) => {
    e.preventDefault();

    const items = lines
      .filter((l) => l.productId)
      .map((l) => ({
        productId: l.productId,
        dosageInstructions: l.dosageInstructions,
        quantity: Number(l.quantity) || 1
      }));

    if (!form.customerId) return toast.error('Choose the patient this is written for.');
    if (items.length === 0) return toast.error('A prescription must list at least one medicine.');

    setBusy(true);
    // Ids, not typed names. This is what the API has always taken.
    const res = await post('prescriptions', {
      customerId: form.customerId,
      doctorId: form.doctorId || null,
      validUntil: form.validUntil || null,
      notes: form.notes || null,
      items
    });
    setBusy(false);

    if (res?.data) {
      toast.success('Prescription issued, awaiting verification');
      setShowNew(false);
      setForm({ customerId: '', doctorId: '', validUntil: '', notes: '' });
      setLines([{ productId: '', dosageInstructions: '', quantity: 1 }]);
      load();
    } else {
      toast.error(res?.error || 'The prescription could not be issued.');
    }
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Prescriptions</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>
            Review, verify and dispense. A sale of a prescription-only medicine depends on what is recorded here.
          </p>
        </div>
        {canIssue && (
          <button className="btn btn-success" onClick={() => setShowNew(true)}>
            <Plus size={18} /> Issue prescription
          </button>
        )}
      </div>

      <div style={{ background: 'var(--surface)', padding: '12px 16px', borderRadius: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {TABS.map((tab) => (
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

      {error && (
        <div style={{ background: 'var(--surface)', border: '1px solid #b91c1c', borderRadius: '12px', padding: '16px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Patient</th>
              <th>Prescriber</th>
              <th>Medicines</th>
              <th>Valid until</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {prescriptions.map((p) => (
              <tr key={p.prescription_id}>
                {/* Derived from the real id. There is no reference column on the
                    prescription, so inventing one would be inventing a record. */}
                <td style={{ fontFamily: 'monospace', fontWeight: '600', color: '#60a5fa' }}>{shortId(p.prescription_id)}</td>
                <td style={{ fontWeight: '600', color: 'var(--text)' }}>{p.patient_name}</td>
                <td>{p.doctor_name || 'Not recorded'}</td>
                <td>
                  <div style={{ fontWeight: 500 }}>{p.item_summary || '—'}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>
                    {p.item_count === 1 ? '1 medicine' : `${p.item_count || 0} medicines`}
                  </div>
                </td>
                <td style={{ color: p.has_lapsed ? '#f87171' : 'var(--text-2)' }}>
                  {asDate(p.valid_until)}
                  {p.has_lapsed && ' · lapsed'}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[p.status] || ''}`}>{p.status}</span>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => openReview(p)}>
                      <Eye size={14} /> Review
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {loading && <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>Loading prescriptions…</div>}
        {!loading && prescriptions.length === 0 && !error && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>
            {activeTab === 'ALL' ? 'No prescriptions have been recorded yet.' : `No ${activeTab.toLowerCase()} prescriptions.`}
          </div>
        )}
      </div>

      {/* Review — the view that did not exist */}
      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `Prescription ${shortId(selected.prescription_id)}` : 'Prescription'}
      >
        {selected?.loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-2)' }}>Loading…</div>
        ) : selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <Detail label="Patient" value={selected.patient_name} />
              <Detail label="Phone" value={selected.patient_phone} />
              <Detail label="NRC" value={selected.patient_nrc} />
              <Detail label="Date of birth" value={selected.patient_dob ? asDate(selected.patient_dob) : null} />
              <Detail
                label="Prescriber"
                value={selected.doctor_name ? `${selected.doctor_name}${selected.doctor_specialty ? ` · ${selected.doctor_specialty}` : ''}` : null}
              />
              <Detail label="Prescriber licence" value={selected.doctor_license} />
              <Detail label="Written" value={asDate(selected.created_at)} />
              <Detail label="Valid until" value={asDate(selected.valid_until)} warn={selected.has_lapsed} />
            </div>

            {selected.has_lapsed && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#f87171', fontSize: '0.85rem' }}>
                <AlertTriangle size={16} /> This prescription lapsed on {asDate(selected.valid_until)} and will be refused at the till.
              </div>
            )}

            <div>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text)', marginBottom: '8px' }}>Medicines prescribed</h4>
              <table className="cart-table">
                <thead>
                  <tr><th>Medicine</th><th>Qty</th><th>Directions</th><th>In-date stock</th></tr>
                </thead>
                <tbody>
                  {(selected.items || []).map((i) => (
                    <tr key={i.prescription_item_id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{i.product_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>
                          {i.dosage || ''}{i.requires_prescription ? ' · prescription-only' : ''}
                        </div>
                      </td>
                      <td>{i.quantity} {i.unit_of_measure || ''}</td>
                      <td style={{ fontSize: '0.8rem' }}>{i.dosage_instructions || '—'}</td>
                      {/* A pharmacist verifying needs to know whether it can
                          actually be dispensed, not only what was asked for. */}
                      <td style={{ color: Number(i.in_date_stock) < Number(i.quantity) ? '#f87171' : '#4ade80' }}>
                        {i.in_date_stock}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(selected.items || []).length === 0 && (
                <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginTop: '8px' }}>
                  No medicines are recorded on this prescription.
                </p>
              )}
            </div>

            {selected.notes && <Detail label="Notes" value={selected.notes} />}
            {selected.verified_by_name && <Detail label="Verified by" value={selected.verified_by_name} />}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSelected(null)}>Close</button>
              {selected.status === 'PENDING' && canVerify && (
                <button
                  className="btn btn-success"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => act(selected.prescription_id, 'verify', 'Prescription verified')}
                >
                  <ShieldCheck size={16} /> Verify
                </button>
              )}
              {selected.status === 'VERIFIED' && (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onClick={() => act(selected.prescription_id, 'dispense', 'Prescription marked dispensed')}
                >
                  <CheckCircle size={16} /> Mark dispensed
                </button>
              )}
            </div>
            {selected.status === 'PENDING' && !canVerify && (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
                Only a pharmacist or administrator can verify a prescription.
              </p>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Issue */}
      <Modal isOpen={showNew} onClose={() => setShowNew(false)} title="Issue a prescription">
        <form onSubmit={issue} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Patient</label>
              <select className="input-field" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
                <option value="">Choose a patient…</option>
                {patients.map((p) => <option key={p.customer_id} value={p.customer_id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Prescriber</label>
              <select className="input-field" value={form.doctorId} onChange={(e) => setForm({ ...form, doctorId: e.target.value })}>
                <option value="">Not recorded</option>
                {doctors.map((d) => <option key={d.doctor_id} value={d.doctor_id}>{d.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Valid until</label>
            <input type="date" className="input-field" value={form.validUntil} onChange={(e) => setForm({ ...form, validUntil: e.target.value })} />
            <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginTop: '4px' }}>
              After this date the till refuses to dispense against it. Leave blank if it does not lapse.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Medicines</label>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 2fr 32px', gap: '8px', marginBottom: '8px' }}>
                <select className="input-field" value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}>
                  <option value="">Choose a medicine…</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name}{p.requires_prescription ? ' (Rx)' : ''}
                    </option>
                  ))}
                </select>
                <input type="number" min="1" className="input-field" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                <input type="text" className="input-field" placeholder="e.g. one capsule 3× daily, 7 days" value={l.dosageInstructions} onChange={(e) => setLine(i, { dosageInstructions: e.target.value })} />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ padding: '4px' }}
                  onClick={() => setLines((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)))}
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
              onClick={() => setLines((prev) => [...prev, { productId: '', dosageInstructions: '', quantity: 1 }])}
            >
              <Plus size={14} /> Add medicine
            </button>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Notes</label>
            <input type="text" className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <p style={{ fontSize: '0.78rem', color: 'var(--text-2)' }}>
            Issued as pending. A pharmacist must verify it before it can unlock a sale.
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowNew(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={busy}>Issue</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Detail({ label, value, warn }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>{label}</div>
      {/* Not recorded renders as an em dash, never as a plausible-looking value. */}
      <div style={{ fontSize: '0.9rem', color: warn ? '#f87171' : 'var(--text)' }}>{value || '—'}</div>
    </div>
  );
}
