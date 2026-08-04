import React, { useState, useEffect } from 'react';
import { Search, Printer } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { get } from '../api/client';
import Modal from '../components/Modal';

export default function SalesHistory() {
  // Every figure on this page is money. `currency` was used three times here
  // without ever being read from the context, so the first rendered row threw
  // a ReferenceError and took the screen down (DEF-043).
  const { currency, pharmacyName } = useAuth();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);

  useEffect(() => {
    loadSales();
  }, []);

  // This screen used to answer with two invented sales when the request failed,
  // complete with a made-up cashier. A transaction log that shows sales which
  // never happened is worse than one that shows nothing, so a failure now says
  // it failed.
  const loadSales = async () => {
    setLoading(true);
    const res = await get('sales');
    if (res?.data) {
      setSales(res.data);
      setError(null);
    } else {
      setError(res?.error || 'Sales could not be loaded.');
      setSales([]);
    }
    setLoading(false);
  };

  const openReceipt = async (sale) => {
    // The list response carries no line items; the single-sale route does.
    const res = await get(`sales/${sale.sale_id}`);
    setSelectedSale(res?.data || sale);
  };

  const money = (n) => `${currency} ${Number(n || 0).toFixed(2)}`;

  const filteredSales = sales.filter((s) =>
    (s.receipt_number || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Sales History &amp; Receipts</h1>
        <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>Transaction log and receipt reprints</p>
      </div>

      <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search by receipt number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
          <Search size={18} color="var(--text-2)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        </div>
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
              <th>Receipt #</th>
              <th>Date / time</th>
              <th>Served by</th>
              <th>Payment</th>
              <th>Total</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((s) => (
              <tr key={s.sale_id}>
                <td style={{ fontFamily: 'monospace', fontWeight: '600', color: '#60a5fa' }}>{s.receipt_number}</td>
                <td>{s.date_time ? new Date(s.date_time).toLocaleString() : '—'}</td>
                <td>{s.cashier || '—'}</td>
                <td style={{ textTransform: 'uppercase', fontSize: '0.85rem' }}>{s.payment_type || '—'}</td>
                <td style={{ color: '#4ade80', fontWeight: '600' }}>{money(s.total)}</td>
                <td>
                  <span className={`badge ${s.status === 'COMPLETED' ? 'badge-green' : ''}`}>{s.status || '—'}</span>
                </td>
                <td>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                    onClick={() => openReceipt(s)}
                  >
                    <Printer size={14} /> View receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && filteredSales.length === 0 && !error && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>
            {sales.length === 0 ? 'No sales have been recorded yet.' : 'No receipt matches that search.'}
          </div>
        )}
        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>Loading sales…</div>
        )}
      </div>

      {selectedSale && (
        <Modal
          isOpen={Boolean(selectedSale)}
          onClose={() => setSelectedSale(null)}
          title={`Receipt — ${selectedSale.receipt_number}`}
        >
          <div style={{ textAlign: 'center', borderBottom: '1px dashed var(--text-3)', paddingBottom: '12px', marginBottom: '12px' }}>
            <h3 style={{ color: '#fff' }}>{pharmacyName}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Receipt #: {selectedSale.receipt_number}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>
              Date: {selectedSale.date_time ? new Date(selectedSale.date_time).toLocaleString() : '—'}
            </p>
          </div>

          {selectedSale.items?.length ? (
            <table className="cart-table" style={{ marginBottom: '12px' }}>
              <thead>
                <tr><th>Item</th><th>Qty</th><th style={{ textAlign: 'right' }}>Price</th></tr>
              </thead>
              <tbody>
                {selectedSale.items.map((i) => (
                  <tr key={i.sale_item_id || `${i.product_id}-${i.quantity}`}>
                    <td>{i.product_name}</td>
                    <td>{i.quantity}</td>
                    <td style={{ textAlign: 'right' }}>{money(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-2)', fontSize: '0.85rem', marginBottom: '12px' }}>
              No line items were returned for this sale.
            </p>
          )}

          <div className="summary-card" style={{ marginBottom: '16px' }}>
            <div className="summary-row"><span>Subtotal</span><span>{money(selectedSale.subtotal)}</span></div>
            <div className="summary-row"><span>VAT</span><span>{money(selectedSale.tax_amount)}</span></div>
            <div className="summary-row">
              <span>Total</span>
              <span style={{ color: '#4ade80', fontWeight: '700' }}>{money(selectedSale.total)}</span>
            </div>
            {Number(selectedSale.scheme_covered) > 0 && (
              <>
                <div className="summary-row"><span>Scheme covered</span><span>{money(selectedSale.scheme_covered)}</span></div>
                <div className="summary-row"><span>Patient paid</span><span>{money(selectedSale.patient_payable)}</span></div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedSale(null)}>Close</button>
            <button className="btn btn-success" style={{ flex: 1 }} onClick={() => window.print()}>
              <Printer size={18} /> Print
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
