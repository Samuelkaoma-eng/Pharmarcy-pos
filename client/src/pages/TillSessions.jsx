import React, { useState, useEffect } from 'react';
import { Wallet, LockKeyhole, Unlock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../api/client';
import Modal from '../components/Modal';

// The shift screen. A cashier opens a drawer with a counted float, sees what
// the system says it should hold as the day goes on, and counts it down at the
// end. The difference between what they count and what the system expected is
// the whole point: until this existed a drawer could be short and nothing in
// the system would say so (LIM-004).
export default function TillSessions() {
  const { currency, user } = useAuth();
  const [current, setCurrent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingFloat, setOpeningFloat] = useState('');
  const [openingNotes, setOpeningNotes] = useState('');
  const [closing, setClosing] = useState(null);
  const [countedCash, setCountedCash] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const isSupervisor = user?.role === 'Admin' || user?.role === 'SuperAdmin';

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const [currentRes, listRes] = await Promise.all([get('till/current'), get('till/sessions')]);

    // A figure stays em-dash until the server answers. Nothing here is invented.
    if (currentRes) {
      setCurrent(currentRes.data);
      setError(null);
    } else {
      setError('The till could not be read.');
    }
    setSessions(listRes?.data || []);
    setLoading(false);
  };

  const money = (n) =>
    n === null || n === undefined || n === '' ? '—' : `${currency} ${Number(n).toFixed(2)}`;

  const openTill = async () => {
    const float = Number(openingFloat);
    if (!Number.isFinite(float) || float < 0) {
      toast.error('Enter the cash you are starting with, as a number.');
      return;
    }

    setBusy(true);
    const res = await post('till/open', { opening_float: float, opening_notes: openingNotes || null });
    setBusy(false);

    if (res?.data) {
      toast.success('Till opened');
      setOpeningFloat('');
      setOpeningNotes('');
      load();
    } else {
      toast.error(res?.error || 'The till could not be opened.');
    }
  };

  const closeTill = async () => {
    const counted = Number(countedCash);
    if (!Number.isFinite(counted) || counted < 0) {
      toast.error('Enter the cash you counted, as a number.');
      return;
    }

    setBusy(true);
    const res = await post(`till/sessions/${closing.till_session_id}/close`, {
      closing_count: counted,
      closing_notes: closingNotes || null
    });
    setBusy(false);

    if (res?.data) {
      const variance = Number(res.data.variance);
      // Reported as it falls out. A short drawer is never rounded away.
      if (Math.abs(variance) < 0.005) toast.success('Till closed and balanced');
      else if (variance < 0) toast.error(`Till closed — short by ${money(Math.abs(variance))}`);
      else toast.warning(`Till closed — over by ${money(variance)}`);

      setClosing(null);
      setCountedCash('');
      setClosingNotes('');
      load();
    } else {
      toast.error(res?.error || 'The till could not be closed.');
    }
  };

  const varianceStyle = (v) => {
    if (v === null || v === undefined) return {};
    const n = Number(v);
    if (Math.abs(n) < 0.005) return { color: '#4ade80', fontWeight: 600 };
    return { color: n < 0 ? '#f87171' : '#fbbf24', fontWeight: 700 };
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Till Sessions</h1>
        <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>
          Open a drawer with a counted float, and count it down at the end of the shift
        </p>
      </div>

      {error && (
        <div style={{ background: 'var(--surface)', border: '1px solid #b91c1c', borderRadius: '12px', padding: '16px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>Loading till…</div>
      ) : current ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Unlock size={20} color="#4ade80" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>Your till is open</h2>
            <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>
              since {new Date(current.opened_at).toLocaleString()}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <Figure label="Opening float" value={money(current.opening_float)} />
            <Figure label="Sales rung up" value={current.sale_count ?? '—'} />
            <Figure label="Cash taken" value={money(current.cash_taken)} />
            <Figure label="All takings" value={money(current.total_taken)} />
            <Figure label="Drawer should hold" value={money(current.expected_cash)} accent />
          </div>

          <p style={{ color: 'var(--text-2)', fontSize: '0.8rem', marginBottom: '14px' }}>
            Only cash counts towards the drawer. Card, mobile and insurance settlements are
            recorded against the sale but never put a note in the till.
          </p>

          <button className="btn btn-primary" onClick={() => setClosing(current)}>
            <LockKeyhole size={16} /> Close and count down
          </button>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Wallet size={20} color="var(--text-2)" />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>No till is open</h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '0 1 200px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>
                Opening float ({currency})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field"
                value={openingFloat}
                onChange={(e) => setOpeningFloat(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>
                Note (optional)
              </label>
              <input
                type="text"
                className="input-field"
                value={openingNotes}
                onChange={(e) => setOpeningNotes(e.target.value)}
                placeholder="Morning shift"
              />
            </div>
            <button className="btn btn-primary" onClick={openTill} disabled={busy}>
              <Unlock size={16} /> Open till
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
            {isSupervisor ? 'All shifts' : 'Your shifts'}
          </h2>
        </div>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Opened</th>
              {isSupervisor && <th>Cashier</th>}
              <th>Float</th>
              <th>Expected</th>
              <th>Counted</th>
              <th>Variance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.till_session_id}>
                <td>{new Date(s.opened_at).toLocaleString()}</td>
                {isSupervisor && <td>{s.opened_by_name || '—'}</td>}
                <td>{money(s.opening_float)}</td>
                <td>{money(s.expected_cash)}</td>
                <td>{money(s.closing_count)}</td>
                <td style={varianceStyle(s.variance)}>
                  {s.variance === null || s.variance === undefined ? '—' : money(s.variance)}
                </td>
                <td>
                  <span className={`badge ${s.status === 'OPEN' ? 'badge-green' : ''}`}>{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sessions.length === 0 && !loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>
            No till sessions have been recorded yet.
          </div>
        )}
      </div>

      {closing && (
        <Modal isOpen={Boolean(closing)} onClose={() => setClosing(null)} title="Count down the till">
          <div className="summary-card" style={{ marginBottom: '16px' }}>
            <div className="summary-row"><span>Opening float</span><span>{money(closing.opening_float)}</span></div>
            <div className="summary-row"><span>Cash taken</span><span>{money(closing.cash_taken)}</span></div>
            <div className="summary-row">
              <span>Drawer should hold</span>
              <span style={{ fontWeight: 700 }}>{money(closing.expected_cash)}</span>
            </div>
          </div>

          <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>
            Cash you counted ({currency})
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input-field"
            value={countedCash}
            onChange={(e) => setCountedCash(e.target.value)}
            placeholder="0.00"
            style={{ marginBottom: '12px' }}
          />

          <label style={{ fontSize: '0.85rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>
            Note (optional)
          </label>
          <input
            type="text"
            className="input-field"
            value={closingNotes}
            onChange={(e) => setClosingNotes(e.target.value)}
            placeholder="Counted twice"
            style={{ marginBottom: '12px' }}
          />

          {countedCash !== '' && Number.isFinite(Number(countedCash)) && (
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
                fontSize: '0.9rem', ...varianceStyle(Number(countedCash) - Number(closing.expected_cash))
              }}
            >
              {Math.abs(Number(countedCash) - Number(closing.expected_cash)) < 0.005 ? (
                <><CheckCircle2 size={16} /> Balances exactly.</>
              ) : (
                <>
                  <AlertTriangle size={16} />
                  {Number(countedCash) < Number(closing.expected_cash) ? 'Short by ' : 'Over by '}
                  {money(Math.abs(Number(countedCash) - Number(closing.expected_cash)))}
                </>
              )}
            </div>
          )}

          <p style={{ color: 'var(--text-2)', fontSize: '0.78rem', marginBottom: '14px' }}>
            The figure above is a preview. The variance recorded against this shift is
            calculated by the server from the payments it holds.
          </p>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setClosing(null)}>Cancel</button>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={closeTill} disabled={busy}>
              <LockKeyhole size={16} /> Close till
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Figure({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: accent ? '#4ade80' : 'var(--text)' }}>{value}</div>
    </div>
  );
}
