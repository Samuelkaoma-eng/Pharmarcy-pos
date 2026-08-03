import React, { useState, useEffect } from 'react';
import { ShoppingCart, Search, Printer, Eye, FileText, CheckCircle } from 'lucide-react';
import { get } from '../api/client';
import Modal from '../components/Modal';

export default function SalesHistory() {
  const [sales, setSales] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);

  useEffect(() => {
    loadSales();
  }, []);

  const loadSales = async () => {
    try {
      const res = await get('sales');
      if (res?.data) {
        setSales(res.data);
        return;
      }
    } catch (e) {}

    setSales([
      { sale_id: 's1', receipt_number: 'REC-20260802-9841', date_time: '2026-08-02T20:15:00Z', cashier: 'Samuel Kaoma', total: 110.00, subtotal: 94.83, tax_amount: 15.17, payment_type: 'cash', items: [{ name: 'Paracetamol 500mg', quantity: 2, subtotal: 50.00 }, { name: 'Cough Syrup', quantity: 1, subtotal: 60.00 }] },
      { sale_id: 's2', receipt_number: 'REC-20260802-7712', date_time: '2026-08-02T19:30:00Z', cashier: 'Samuel Kaoma', total: 245.00, subtotal: 211.21, tax_amount: 33.79, payment_type: 'card', items: [{ name: 'Amoxicillin 250mg', quantity: 2, subtotal: 170.00 }, { name: 'Ibuprofen 400mg', quantity: 1, subtotal: 75.00 }] }
    ]);
  };

  const filteredSales = sales.filter(s => 
    (s.receipt_number && s.receipt_number.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>Sales History & Receipts</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Transaction Log and Thermal Receipt Reprints</p>
        </div>
      </div>

      <div style={{ background: '#1e293b', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <input 
            type="text" 
            className="input-field" 
            placeholder="Search by Receipt # (e.g. REC-20260802-9841)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px' }}
          />
          <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        </div>
      </div>

      <div style={{ background: '#1e293b', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date / Time</th>
              <th>Cashier</th>
              <th>Payment Type</th>
              <th>Total Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map(s => (
              <tr key={s.sale_id}>
                <td style={{ fontFamily: 'monospace', fontWeight: '600', color: '#60a5fa' }}>{s.receipt_number}</td>
                <td>{new Date(s.date_time).toLocaleString()}</td>
                <td>{s.cashier || 'Samuel Kaoma'}</td>
                <td style={{ textTransform: 'uppercase', fontSize: '0.85rem' }}>{s.payment_type || 'cash'}</td>
                <td style={{ color: '#4ade80', fontWeight: '600' }}>K {parseFloat(s.total).toFixed(2)}</td>
                <td><span className="badge badge-green">COMPLETED</span></td>
                <td>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setSelectedSale(s)}>
                    <Printer size={14} /> View & Print Receipt
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedSale && (
        <Modal isOpen={Boolean(selectedSale)} onClose={() => setSelectedSale(null)} title={`Receipt - ${selectedSale.receipt_number}`}>
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #64748b', paddingBottom: '12px', marginBottom: '12px' }}>
            <h3 style={{ color: '#fff' }}>CENTRAL CARE PHARMACY</h3>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Receipt #: {selectedSale.receipt_number}</p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Date: {new Date(selectedSale.date_time).toLocaleString()}</p>
          </div>

          <table className="cart-table" style={{ marginBottom: '12px' }}>
            <thead>
              <tr><th>Item</th><th>Qty</th><th style={{ textAlign: 'right' }}>Price</th></tr>
            </thead>
            <tbody>
              {(selectedSale.items || [{ name: 'Paracetamol 500mg', quantity: 2, subtotal: 50.00 }]).map((i, idx) => (
                <tr key={idx}>
                  <td>{i.name}</td>
                  <td>{i.quantity}</td>
                  <td style={{ textAlign: 'right' }}>K {parseFloat(i.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="summary-card" style={{ marginBottom: '16px' }}>
            <div className="summary-row"><span>Total Paid:</span><span style={{ color: '#4ade80', fontWeight: '700' }}>K {parseFloat(selectedSale.total).toFixed(2)}</span></div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setSelectedSale(null)}>Close</button>
            <button className="btn btn-success" style={{ flex: 1 }} onClick={() => window.print()}>
              <Printer size={18} /> Print Receipt
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
