import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ArrowUpRight, ArrowDownRight, Search, RefreshCw, Sparkles, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../api/client';
import Modal from '../components/Modal';

const CATEGORIES = ['Pain Relief', 'Antibiotic', 'Cold & Flu', 'Diabetes', 'Vitamins', 'Sundries'];

// Medicines are zero-rated under Group 6 of the Zambian VAT (Zero-Rating)
// Order. Sundries sold alongside them carry the standard rate. This is chosen
// per product because charging one blanket rate overcharged on every
// dispensed item.
const VAT_TREATMENTS = [
  { value: 'ZERO_RATED', label: 'Zero-rated — medicine (Group 6)' },
  { value: 'STANDARD', label: 'Standard 16% — sundry or non-medicine' },
  { value: 'EXEMPT', label: 'Exempt' }
];

const EMPTY_PRODUCT = {
  name: '', barcode: '', category: 'Pain Relief', dosage: '',
  cost_price: '', selling_price: '', unit_of_measure: 'tablet',
  requires_prescription: false, vat_treatment: 'ZERO_RATED',
  generic_name: '', manufacturer: '', ndc_code: ''
};

export default function Inventory() {
  const { currency } = useAuth();

  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [busy, setBusy] = useState(false);

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showReceiveStockModal, setShowReceiveStockModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [receiveForm, setReceiveForm] = useState({ batch_number: '', quantity: '', expiry_date: '', supplierId: '' });
  const [dispenseForm, setDispenseForm] = useState({ quantity: '1', batchId: '', notes: '' });

  // openFDA lookup for filling a catalogue entry from a reference source
  // rather than from memory.
  const [lookup, setLookup] = useState('');
  const [lookupResults, setLookupResults] = useState(null);
  const [looking, setLooking] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const endpoint =
      activeTab === 'LOW_STOCK' ? 'products/low-stock'
        : activeTab === 'EXPIRING' ? 'products/expiry-alerts'
          : 'products';

    const res = await get(endpoint);
    // No invented catalogue. A failed load says so; it does not show stock the
    // pharmacy does not have.
    if (res?.data) setProducts(res.data);
    else {
      setProducts([]);
      toast.error('Could not load inventory', { description: res?.error || 'Check the backend server.' });
    }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  useEffect(() => {
    get('suppliers').then((res) => { if (res?.data) setSuppliers(res.data); });
  }, []);

  const handleAddProductSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);

    const res = await post('products', {
      ...productForm,
      cost_price: Number(productForm.cost_price || 0),
      selling_price: Number(productForm.selling_price || 0)
    });

    if (res?.data) {
      setProducts((prev) => [res.data, ...prev]);
      toast.success('Product added', { description: `${res.data.name} is now in the catalogue.` });
      setShowAddProductModal(false);
      setProductForm(EMPTY_PRODUCT);
      setLookupResults(null);
      setLookup('');
    } else {
      // Reporting success regardless of outcome is how a catalogue ends up
      // disagreeing with what the server actually holds.
      toast.error('Could not add the product', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const handleDirectoryLookup = async () => {
    if (lookup.trim().length < 2) return;
    setLooking(true);

    const res = await get(`drugs/search?q=${encodeURIComponent(lookup.trim())}&limit=5`);
    if (res?.data) {
      setLookupResults(res.data);
      if (res.data.length === 0) toast.info('Nothing found in the directory for that name');
    } else {
      setLookupResults([]);
      toast.error('Directory unavailable', {
        description: res?.error || 'Enter the product by hand instead.'
      });
    }
    setLooking(false);
  };

  const applyDirectoryResult = (r) => {
    setProductForm((prev) => ({
      ...prev,
      name: r.brand_name || r.generic_name || prev.name,
      generic_name: r.generic_name || '',
      manufacturer: r.manufacturer || '',
      ndc_code: r.ndc_code || '',
      dosage: r.dosage_form || prev.dosage
    }));
    toast.success('Filled from openFDA', {
      description: 'This describes a US-registered product — check it against the ZAMRA register.'
    });
  };

  const handleReceiveStockSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setBusy(true);

    const res = await post('inventory/receive', {
      productId: selectedProduct.product_id,
      batchNumber: receiveForm.batch_number,
      quantity: parseInt(receiveForm.quantity, 10),
      expiryDate: receiveForm.expiry_date,
      supplierId: receiveForm.supplierId || null,
      notes: 'Received at the counter'
    });

    if (res?.message && !res?.error) {
      toast.success('Stock received', {
        description: `${receiveForm.quantity} of ${selectedProduct.name} booked in.`
      });
      setShowReceiveStockModal(false);
      setSelectedProduct(null);
      setReceiveForm({ batch_number: '', quantity: '', expiry_date: '', supplierId: '' });
      // Reload rather than guessing the new figure locally: the server is the
      // only thing that knows what the stock actually is now.
      await loadProducts();
    } else {
      toast.error('Could not receive the stock', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const handleDispenseStockSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    setBusy(true);

    const res = await post('inventory/dispense', {
      productId: selectedProduct.product_id,
      batchId: dispenseForm.batchId || null,
      quantity: parseInt(dispenseForm.quantity, 10),
      notes: dispenseForm.notes || 'Manual counter dispensing'
    });

    if (res?.message && !res?.error) {
      toast.success('Stock dispensed', {
        description: `${dispenseForm.quantity} of ${selectedProduct.name} taken out.`
      });
      setShowDispenseModal(false);
      setSelectedProduct(null);
      setDispenseForm({ quantity: '1', batchId: '', notes: '' });
      await loadProducts();
    } else {
      toast.error('Could not dispense', { description: res?.error || 'The server rejected it.' });
    }
    setBusy(false);
  };

  const openDispense = async (p) => {
    setSelectedProduct(p);
    setDispenseForm({ quantity: '1', batchId: '', notes: '' });
    // Batches are needed so the dispenser can name the box they took it from,
    // which is what makes the movement traceable.
    const res = await get(`products/${p.product_id}`);
    if (res?.data?.batches) setSelectedProduct({ ...p, batches: res.data.batches });
    setShowDispenseModal(true);
  };

  const filteredProducts = products.filter((p) => {
    const name = p.name || p.product_name || '';
    const matchesSearch =
      name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.barcode && p.barcode.includes(searchQuery));
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Inventory ledger and stock</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>
            Audit-first stock ledger with batch, expiry and prescription controls.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-success" onClick={() => setShowAddProductModal(true)}>
            <Plus size={18} /> Add medication
          </button>
          <button className="btn btn-secondary" onClick={loadProducts}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '12px 16px', borderRadius: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['ALL', 'LOW_STOCK', 'EXPIRING'].map((tab) => (
            <button
              key={tab}
              className={`btn ${activeTab === tab ? 'btn-success' : 'btn-secondary'}`}
              onClick={() => setActiveTab(tab)}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              {tab === 'ALL' && 'All products'}
              {tab === 'LOW_STOCK' && 'Low stock'}
              {tab === 'EXPIRING' && 'Expiring batches'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <input
              type="text"
              className="input-field"
              placeholder="Search product or SKU…"
              aria-label="Search products"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={16} color="var(--text-2)" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          </div>

          <select
            className="input-field"
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: '160px' }}
          >
            <option value="ALL">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="table-card">
        <table className="cart-table">
          <thead>
            <tr>
              <th>Barcode / SKU</th>
              <th>Medication</th>
              <th>Category</th>
              <th>Selling price</th>
              <th>VAT</th>
              <th>On hand</th>
              <th>Prescription</th>
              <th>Stock actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-3)' }}>Loading inventory…</td></tr>
            ) : filteredProducts.length > 0 ? filteredProducts.map((p) => (
              <tr key={p.product_id || p.batch_id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--text-2)' }}>{p.barcode || '—'}</td>
                <td style={{ fontWeight: '600', color: 'var(--text)' }}>
                  {p.name || p.product_name}
                  {p.dosage && <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Dosage: {p.dosage}</div>}
                  {p.expiry_date && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                      Batch {p.batch_number || '—'} · expires {new Date(p.expiry_date).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td>{p.category ? <span className="badge badge-blue">{p.category}</span> : '—'}</td>
                <td style={{ color: '#4ade80', fontWeight: '600' }}>
                  {p.selling_price !== undefined ? `${currency} ${parseFloat(p.selling_price).toFixed(2)}` : '—'}
                </td>
                <td>
                  {p.vat_treatment === 'STANDARD'
                    ? <span className="badge badge-yellow">16%</span>
                    : p.vat_treatment === 'EXEMPT'
                      ? <span className="badge badge-blue">exempt</span>
                      : <span className="badge badge-green">zero</span>}
                </td>
                <td>
                  <span className={`badge ${(p.quantity_on_hand ?? 0) > (p.reorder_level ?? 10) ? 'badge-green' : 'badge-red'}`}>
                    {p.quantity_on_hand ?? 0} units
                  </span>
                </td>
                <td>
                  {p.requires_prescription
                    ? <span className="badge badge-yellow">Rx required</span>
                    : <span style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>OTC</span>}
                </td>
                <td>
                  {p.product_id && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={() => { setSelectedProduct(p); setShowReceiveStockModal(true); }}
                      >
                        <ArrowUpRight size={14} /> Receive
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                        onClick={() => openDispense(p)}
                      >
                        <ArrowDownRight size={14} /> Dispense
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-3)' }}>
                  {products.length === 0 ? 'No products in this view.' : 'No products match the filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAddProductModal} onClose={() => setShowAddProductModal(false)} title="Add a medication">
        <form onSubmit={handleAddProductSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: 'var(--surface-2)', padding: '10px', borderRadius: 'var(--r-md)' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Look up in the openFDA directory</label>
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. amoxicillin"
                value={lookup}
                onChange={(e) => setLookup(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleDirectoryLookup(); } }}
              />
              <button type="button" className="btn btn-secondary" onClick={handleDirectoryLookup} disabled={looking}>
                <Sparkles size={14} /> {looking ? 'Searching…' : 'Search'}
              </button>
            </div>

            {lookupResults?.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px' }}>
                {lookupResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    className="btn btn-secondary"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', fontSize: '0.8rem' }}
                    onClick={() => applyDirectoryResult(r)}
                  >
                    {r.brand_name || r.generic_name}
                    {r.manufacturer && ` — ${r.manufacturer}`}
                  </button>
                ))}
              </div>
            )}

            {lookupResults?.length === 0 && (
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', margin: '6px 0 0' }}>
                Nothing to fill in from the directory. Enter the product by hand.
              </p>
            )}

            <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: '8px 0 0' }}>
              openFDA describes products registered in the United States. Anything filled in
              from it still needs checking against the ZAMRA register.
            </p>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Product name</label>
            <input type="text" className="input-field" required placeholder="e.g. Amoxicillin 500mg"
              value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Barcode / SKU</label>
            <input type="text" className="input-field" placeholder="e.g. 600123456709"
              value={productForm.barcode} onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })} />
          </div>
          <div className="grid-2" style={{ gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Category</label>
              <select className="input-field" value={productForm.category}
                onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Dosage</label>
              <input type="text" className="input-field" placeholder="500mg"
                value={productForm.dosage} onChange={(e) => setProductForm({ ...productForm, dosage: e.target.value })} />
            </div>
          </div>
          <div className="grid-2" style={{ gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Cost price ({currency})</label>
              <input type="number" step="0.01" min="0" className="input-field" placeholder="0.00"
                value={productForm.cost_price} onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Selling price ({currency})</label>
              <input type="number" step="0.01" min="0" className="input-field" required placeholder="0.00"
                value={productForm.selling_price} onChange={(e) => setProductForm({ ...productForm, selling_price: e.target.value })} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>
              <Receipt size={13} style={{ verticalAlign: '-2px' }} /> VAT treatment
            </label>
            <select className="input-field" value={productForm.vat_treatment}
              onChange={(e) => setProductForm({ ...productForm, vat_treatment: e.target.value })}>
              {VAT_TREATMENTS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <input type="checkbox" id="rxCheck" checked={productForm.requires_prescription}
              onChange={(e) => setProductForm({ ...productForm, requires_prescription: e.target.checked })} />
            <label htmlFor="rxCheck" style={{ fontSize: '0.85rem' }}>
              Requires a prescription before it can be sold
            </label>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddProductModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={busy}>
              {busy ? 'Saving…' : 'Save product'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showReceiveStockModal} onClose={() => setShowReceiveStockModal(false)} title={`Receive stock — ${selectedProduct?.name || ''}`}>
        <form onSubmit={handleReceiveStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Supplier</label>
            <select className="input-field" value={receiveForm.supplierId}
              onChange={(e) => setReceiveForm({ ...receiveForm, supplierId: e.target.value })}>
              <option value="">Not recorded</option>
              {suppliers.filter((s) => s.is_active).map((s) => (
                <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
              ))}
            </select>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', margin: '4px 0 0' }}>
              Naming the supplier is what makes this batch traceable in a recall.
            </p>
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Batch number</label>
            <input type="text" className="input-field" required placeholder="e.g. BATCH-2026-X"
              value={receiveForm.batch_number} onChange={(e) => setReceiveForm({ ...receiveForm, batch_number: e.target.value })} />
          </div>
          <div className="grid-2" style={{ gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Quantity received</label>
              <input type="number" className="input-field" required min="1"
                value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Expiry date</label>
              <input type="date" className="input-field" required
                value={receiveForm.expiry_date} onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReceiveStockModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }} disabled={busy}>
              {busy ? 'Booking in…' : 'Confirm received'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDispenseModal} onClose={() => setShowDispenseModal(false)} title={`Manual dispense — ${selectedProduct?.name || ''}`}>
        <form onSubmit={handleDispenseStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {selectedProduct?.batches?.length > 0 && (
            <div>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Batch</label>
              <select className="input-field" value={dispenseForm.batchId}
                onChange={(e) => setDispenseForm({ ...dispenseForm, batchId: e.target.value })}>
                <option value="">Not from a tracked batch</option>
                {selectedProduct.batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_number || 'unnumbered'} — {b.quantity_on_hand} left, expires {new Date(b.expiry_date).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Quantity to dispense</label>
            <input type="number" className="input-field" required min="1"
              value={dispenseForm.quantity} onChange={(e) => setDispenseForm({ ...dispenseForm, quantity: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-2)' }}>Notes / reason</label>
            <input type="text" className="input-field" placeholder="Why this was taken out"
              value={dispenseForm.notes} onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDispenseModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger" style={{ flex: 1 }} disabled={busy}>
              {busy ? 'Dispensing…' : 'Confirm dispense'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
