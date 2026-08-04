import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Truck, Plus, PackageCheck, Trash2, ShieldCheck } from 'lucide-react';
import { get, post, put } from '../api/client';
import { useAuth } from '../context/AuthContext';
import Modal from '../components/Modal';

const EASE = [0.23, 1, 0.32, 1];

const STATUS_BADGE = {
  DRAFT: 'badge-yellow',
  SENT: 'badge-blue',
  PARTIALLY_RECEIVED: 'badge-yellow',
  RECEIVED: 'badge-green',
  CANCELLED: 'badge-red'
};

const statusLabel = (s) => (s || '').toLowerCase().replace(/_/g, ' ');

export default function Procurement() {
  const { user, currency } = useAuth();
  const [tab, setTab] = useState('orders');

  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [addingSupplier, setAddingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: '', contact_name: '', phone: '', email: '', tpin: '', zamra_licence: ''
  });

  const [raising, setRaising] = useState(false);
  const [poForm, setPoForm] = useState({ supplierId: '', expectedDate: '', notes: '' });
  const [poLines, setPoLines] = useState([{ productId: '', quantity: '', unitCost: '' }]);

  const [receiving, setReceiving] = useState(null); // the opened purchase order
  const [receiveLines, setReceiveLines] = useState({});

  const canManage = ['Admin', 'Pharmacist', 'SuperAdmin'].includes(user?.role);
  const money = (n) => `${currency || 'K'} ${Number(n || 0).toFixed(2)}`;

  const load = useCallback(async () => {
    setLoading(true);
    const [supRes, poRes, prodRes] = await Promise.all([
      get('suppliers'),
      get('purchase-orders'),
      get('products')
    ]);

    if (supRes?.data) setSuppliers(supRes.data);
    else toast.error('Could not load suppliers', { description: supRes?.error || 'Check the backend server.' });

    if (poRes?.data) setOrders(poRes.data);
    else toast.error('Could not load purchase orders', { description: poRes?.error || 'Check the backend server.' });

    if (prodRes?.data) setProducts(prodRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await post('suppliers', supplierForm);
    if (res?.data) {
      toast.success('Supplier added', { description: `${res.data.name} can now be ordered from.` });
      setAddingSupplier(false);
      setSupplierForm({ name: '', contact_name: '', phone: '', email: '', tpin: '', zamra_licence: '' });
      await load();
    } else {
      toast.error('Could not add the supplier', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const toggleSupplier = async (supplier) => {
    const res = await put(`suppliers/${supplier.supplier_id}`, { is_active: !supplier.is_active });
    if (res?.data) {
      setSuppliers((prev) => prev.map((s) => (s.supplier_id === supplier.supplier_id ? res.data : s)));
      toast.success(res.data.is_active ? `${res.data.name} is active again` : `${res.data.name} is no longer used`);
    } else {
      toast.error('Could not update the supplier', { description: res?.error || 'The server rejected it.' });
    }
  };

  const handleRaise = async (e) => {
    e.preventDefault();
    const items = poLines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost || 0)
      }));

    if (items.length === 0) {
      toast.error('Nothing to order', { description: 'Add at least one line with a product and a quantity.' });
      return;
    }

    setBusy(true);
    const res = await post('purchase-orders', { ...poForm, items });
    if (res?.data) {
      toast.success('Purchase order raised', { description: `${res.data.po_number} sent to the supplier.` });
      setRaising(false);
      setPoForm({ supplierId: '', expectedDate: '', notes: '' });
      setPoLines([{ productId: '', quantity: '', unitCost: '' }]);
      await load();
    } else {
      toast.error('Could not raise the order', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const openReceive = async (po) => {
    const res = await get(`purchase-orders/${po.po_id}`);
    if (!res?.data) {
      toast.error('Could not open the order', { description: res?.error || 'The server did not answer.' });
      return;
    }
    setReceiving(res.data);
    setReceiveLines({});
  };

  const handleReceive = async (e) => {
    e.preventDefault();

    const lines = Object.entries(receiveLines)
      .filter(([, l]) => Number(l.quantity) > 0)
      .map(([poItemId, l]) => ({
        poItemId,
        quantity: Number(l.quantity),
        batchNumber: l.batchNumber,
        expiryDate: l.expiryDate
      }));

    if (lines.length === 0) {
      toast.error('Nothing to receive', { description: 'Enter a quantity against at least one line.' });
      return;
    }
    if (lines.some((l) => !l.expiryDate)) {
      // Without an expiry date the batch cannot be checked by the expiry guard
      // at the till, so it must not be bookable without one.
      toast.error('An expiry date is required', { description: 'Every batch received needs the date it expires.' });
      return;
    }

    setBusy(true);
    const res = await post(`purchase-orders/${receiving.po_id}/receive`, { lines });
    if (res?.data) {
      toast.success('Stock received', { description: `Order is now ${statusLabel(res.data.status)}.` });
      setReceiving(null);
      await load();
    } else {
      toast.error('Could not receive the delivery', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const setLine = (poItemId, field, value) =>
    setReceiveLines((prev) => ({ ...prev, [poItemId]: { ...prev[poItemId], [field]: value } }));

  return (
    <div style={{ padding: '24px', maxWidth: '1040px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <div>
          <h1>Procurement</h1>
          <p style={{ color: 'var(--text-2)', marginTop: '4px' }}>
            Who stock is bought from, and what has been ordered and received. Every batch
            booked in here carries its supplier, so a recalled consignment can be traced back.
          </p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setAddingSupplier(true)}>
              <Truck size={15} /> Add supplier
            </button>
            <button className="btn btn-primary" onClick={() => setRaising(true)} disabled={suppliers.length === 0}>
              <Plus size={15} /> Raise order
            </button>
          </div>
        )}
      </div>

      <div className="role-tabs">
        <button className={`role-pill ${tab === 'orders' ? 'active' : ''}`} onClick={() => setTab('orders')}>
          Purchase orders
        </button>
        <button className={`role-pill ${tab === 'suppliers' ? 'active' : ''}`} onClick={() => setTab('suppliers')}>
          Suppliers
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-3)' }}>Loading procurement…</p>}

      {!loading && tab === 'orders' && (
        orders.length === 0 ? (
          <p style={{ color: 'var(--text-3)' }}>
            No purchase orders have been raised yet.
            {suppliers.length === 0 && ' Add a supplier first.'}
          </p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Supplier</th>
                  <th>Lines</th>
                  <th>Expected</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {orders.map((po, i) => (
                    <motion.tr
                      key={po.po_id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, ease: EASE, delay: Math.min(i * 0.03, 0.18) }}
                    >
                      <td style={{ fontFamily: 'monospace' }}>{po.po_number}</td>
                      <td>{po.supplier_name}</td>
                      <td>{po.line_count}</td>
                      <td>{po.expected_date ? new Date(po.expected_date).toLocaleDateString() : '—'}</td>
                      <td>
                        <span className={`badge ${STATUS_BADGE[po.status] || 'badge-blue'}`}>
                          {statusLabel(po.status)}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canManage && !['RECEIVED', 'CANCELLED'].includes(po.status) && (
                          <button className="btn btn-secondary" onClick={() => openReceive(po)}>
                            <PackageCheck size={14} /> Receive
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )
      )}

      {!loading && tab === 'suppliers' && (
        suppliers.length === 0 ? (
          <p style={{ color: 'var(--text-3)' }}>No suppliers recorded yet.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Contact</th>
                  <th>TPIN</th>
                  <th>ZAMRA licence</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.supplier_id}>
                    <td>{s.name}</td>
                    <td>
                      {s.contact_name || '—'}
                      {s.phone && <><br /><small style={{ color: 'var(--text-3)' }}>{s.phone}</small></>}
                    </td>
                    <td>{s.tpin || '—'}</td>
                    <td>
                      {/* Wholesalers must themselves be ZAMRA licensed, so a
                          missing licence is worth showing rather than blank. */}
                      {s.zamra_licence
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <ShieldCheck size={13} /> {s.zamra_licence}
                          </span>
                        : <span className="badge badge-yellow">not recorded</span>}
                    </td>
                    <td>
                      <span className={`badge ${s.is_active ? 'badge-green' : 'badge-red'}`}>
                        {s.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {canManage && (
                        <button className="btn btn-secondary" onClick={() => toggleSupplier(s)}>
                          {s.is_active ? 'Stop using' : 'Use again'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal isOpen={addingSupplier} onClose={() => setAddingSupplier(false)} title="Add a supplier">
        <form onSubmit={handleAddSupplier} className="login-form">
          <div>
            <label htmlFor="sup-name">Supplier name</label>
            <input id="sup-name" className="input-field" required value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sup-contact">Contact person</label>
            <input id="sup-contact" className="input-field" value={supplierForm.contact_name}
              onChange={(e) => setSupplierForm({ ...supplierForm, contact_name: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sup-phone">Phone</label>
            <input id="sup-phone" className="input-field" value={supplierForm.phone}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sup-email">Email</label>
            <input id="sup-email" type="email" className="input-field" value={supplierForm.email}
              onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sup-tpin">TPIN</label>
            <input id="sup-tpin" className="input-field" value={supplierForm.tpin}
              onChange={(e) => setSupplierForm({ ...supplierForm, tpin: e.target.value })} />
          </div>
          <div>
            <label htmlFor="sup-licence">ZAMRA licence number</label>
            <input id="sup-licence" className="input-field" value={supplierForm.zamra_licence}
              onChange={(e) => setSupplierForm({ ...supplierForm, zamra_licence: e.target.value })} />
          </div>

          <p className="form-note">
            <ShieldCheck size={13} /> A wholesaler supplying medicines must hold its own ZAMRA licence.
          </p>

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Adding…' : 'Add supplier'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={raising} onClose={() => setRaising(false)} title="Raise a purchase order">
        <form onSubmit={handleRaise} className="login-form">
          <div>
            <label htmlFor="po-supplier">Supplier</label>
            <select id="po-supplier" className="input-field" required value={poForm.supplierId}
              onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}>
              <option value="">Choose a supplier…</option>
              {suppliers.filter((s) => s.is_active).map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="po-date">Expected delivery</label>
            <input id="po-date" type="date" className="input-field" value={poForm.expectedDate}
              onChange={(e) => setPoForm({ ...poForm, expectedDate: e.target.value })} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label>Lines</label>
            {poLines.map((line, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 74px 90px 32px', gap: '6px' }}>
                <select className="input-field" value={line.productId}
                  onChange={(e) => setPoLines(poLines.map((l, i) => i === idx ? { ...l, productId: e.target.value } : l))}>
                  <option value="">Product…</option>
                  {products.map((p) => <option key={p.product_id} value={p.product_id}>{p.name}</option>)}
                </select>
                <input className="input-field" type="number" min="1" placeholder="Qty" value={line.quantity}
                  onChange={(e) => setPoLines(poLines.map((l, i) => i === idx ? { ...l, quantity: e.target.value } : l))} />
                <input className="input-field" type="number" min="0" step="0.01" placeholder="Cost" value={line.unitCost}
                  onChange={(e) => setPoLines(poLines.map((l, i) => i === idx ? { ...l, unitCost: e.target.value } : l))} />
                <button type="button" className="icon-btn" aria-label="Remove line"
                  onClick={() => setPoLines(poLines.length === 1 ? [{ productId: '', quantity: '', unitCost: '' }] : poLines.filter((_, i) => i !== idx))}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary"
              onClick={() => setPoLines([...poLines, { productId: '', quantity: '', unitCost: '' }])}>
              <Plus size={14} /> Add line
            </button>
          </div>

          <div>
            <label htmlFor="po-notes">Notes</label>
            <input id="po-notes" className="input-field" value={poForm.notes}
              onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })} />
          </div>

          <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
            {busy ? 'Raising…' : 'Raise order'}
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={!!receiving}
        onClose={() => setReceiving(null)}
        title={receiving ? `Receive against ${receiving.po_number}` : 'Receive'}
      >
        {receiving && (
          <form onSubmit={handleReceive} className="login-form">
            <p style={{ color: 'var(--text-2)', margin: 0 }}>
              From <strong>{receiving.supplier_name}</strong>. Enter what actually arrived —
              the order stays open until every line is satisfied.
            </p>

            {receiving.items.map((item) => {
              const outstanding = item.quantity_ordered - item.quantity_received;
              return (
                <div key={item.po_item_id} style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <strong>{item.product_name}</strong>
                    <small style={{ color: 'var(--text-3)' }}>
                      {item.quantity_received} of {item.quantity_ordered} received · {outstanding} outstanding
                      {item.unit_cost > 0 && ` · ${money(item.unit_cost)} each`}
                    </small>
                  </div>

                  {outstanding > 0 ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 140px', gap: '6px', marginTop: '6px' }}>
                      <input className="input-field" type="number" min="0" max={outstanding} placeholder="Qty"
                        aria-label={`Quantity received of ${item.product_name}`}
                        value={receiveLines[item.po_item_id]?.quantity || ''}
                        onChange={(e) => setLine(item.po_item_id, 'quantity', e.target.value)} />
                      <input className="input-field" placeholder="Batch number"
                        aria-label={`Batch number for ${item.product_name}`}
                        value={receiveLines[item.po_item_id]?.batchNumber || ''}
                        onChange={(e) => setLine(item.po_item_id, 'batchNumber', e.target.value)} />
                      <input className="input-field" type="date"
                        aria-label={`Expiry date for ${item.product_name}`}
                        value={receiveLines[item.po_item_id]?.expiryDate || ''}
                        onChange={(e) => setLine(item.po_item_id, 'expiryDate', e.target.value)} />
                    </div>
                  ) : (
                    <p style={{ color: 'var(--text-3)', margin: '6px 0 0' }}>Fully received.</p>
                  )}
                </div>
              );
            })}

            <p className="form-note">
              <PackageCheck size={13} /> The batch and the stock movement both record this supplier.
            </p>

            <button type="submit" className="btn btn-primary login-submit" disabled={busy}>
              {busy ? 'Booking in…' : 'Book stock in'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
