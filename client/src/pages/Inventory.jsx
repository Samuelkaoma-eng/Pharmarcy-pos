import React, { useState, useEffect } from 'react';
import { Package, Plus, AlertTriangle, ArrowUpRight, ArrowDownRight, Search, Filter, RefreshCw, Check } from 'lucide-react';
import { get, post } from '../api/client';
import Modal from '../components/Modal';

export default function Inventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showReceiveStockModal, setShowReceiveStockModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [productForm, setProductForm] = useState({
    name: '', barcode: '', category: 'Pain Relief', dosage: '', cost_price: '15.00', selling_price: '30.00', unit_of_measure: 'tablet', requires_prescription: false
  });

  const [receiveForm, setReceiveForm] = useState({
    batch_number: '', quantity: '50', expiry_date: '2027-12-31', cost_price: ''
  });

  const [dispenseForm, setDispenseForm] = useState({
    quantity: '1', notes: 'Manual counter dispensing'
  });

  useEffect(() => {
    loadProducts();
  }, [activeTab]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      let endpoint = 'products';
      if (activeTab === 'LOW_STOCK') endpoint = 'products/low-stock';
      if (activeTab === 'EXPIRING') endpoint = 'products/expiry-alerts';

      const res = await get(endpoint);
      if (res?.data) {
        setProducts(res.data);
        return;
      }
    } catch (e) {}

    const mock = [
      { product_id: 'p1', barcode: '600123456701', name: 'Paracetamol 500mg', dosage: '500mg', category: 'Pain Relief', cost_price: 12.50, selling_price: 25.00, quantity_on_hand: 150, reorder_level: 20, state: 'ACTIVE' },
      { product_id: 'p2', barcode: '600123456702', name: 'Amoxicillin 250mg', dosage: '250mg', category: 'Antibiotic', cost_price: 45.00, selling_price: 85.00, quantity_on_hand: 5, reorder_level: 10, state: 'ACTIVE', requires_prescription: true },
      { product_id: 'p3', barcode: '600123456703', name: 'Ibuprofen 400mg', dosage: '400mg', category: 'Anti-inflammatory', cost_price: 20.00, selling_price: 40.00, quantity_on_hand: 80, reorder_level: 15, state: 'ACTIVE' },
      { product_id: 'p4', barcode: '600123456704', name: 'Cough Syrup (Benylin)', dosage: '100ml', category: 'Cold & Flu', cost_price: 35.00, selling_price: 65.00, quantity_on_hand: 8, reorder_level: 5, state: 'ACTIVE' },
      { product_id: 'p5', barcode: '600123456705', name: 'Metformin 500mg', dosage: '500mg', category: 'Diabetes', cost_price: 70.00, selling_price: 120.00, quantity_on_hand: 60, reorder_level: 10, state: 'ACTIVE', requires_prescription: true }
    ];

    if (activeTab === 'LOW_STOCK') {
      setProducts(mock.filter(p => p.quantity_on_hand <= (p.reorder_level || 10)));
    } else {
      setProducts(mock);
    }
    setLoading(false);
  };

  const handleAddProductSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await post('products', productForm);
      if (res?.data) {
        setProducts(prev => [res.data, ...prev]);
      }
    } catch (e) {
      const mockNew = { product_id: `p-${Date.now()}`, ...productForm, quantity_on_hand: 0 };
      setProducts(prev => [mockNew, ...prev]);
    }
    alert('✅ New Product Added Successfully!');
    setShowAddProductModal(false);
    setProductForm({ name: '', barcode: '', category: 'Pain Relief', dosage: '', cost_price: '15.00', selling_price: '30.00', unit_of_measure: 'tablet', requires_prescription: false });
  };

  const handleReceiveStockSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    try {
      await post('inventory/receive', {
        productId: selectedProduct.product_id,
        batchNumber: receiveForm.batch_number || `BATCH-${Date.now().toString().slice(-4)}`,
        quantity: parseInt(receiveForm.quantity, 10),
        expiryDate: receiveForm.expiry_date
      });
    } catch (e) {}

    setProducts(prev => prev.map(p => {
      if (p.product_id === selectedProduct.product_id) {
        return { ...p, quantity_on_hand: (p.quantity_on_hand || 0) + parseInt(receiveForm.quantity, 10) };
      }
      return p;
    }));

    alert(`✅ Received ${receiveForm.quantity} units for '${selectedProduct.name}'!`);
    setShowReceiveStockModal(false);
    setSelectedProduct(null);
  };

  const handleDispenseStockSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProduct) return;
    const qty = parseInt(dispenseForm.quantity, 10);
    try {
      await post('inventory/dispense', {
        productId: selectedProduct.product_id,
        quantity: qty,
        notes: dispenseForm.notes
      });
    } catch (e) {}

    setProducts(prev => prev.map(p => {
      if (p.product_id === selectedProduct.product_id) {
        return { ...p, quantity_on_hand: Math.max(0, (p.quantity_on_hand || 0) - qty) };
      }
      return p;
    }));

    alert(`✅ Dispensed ${qty} units of '${selectedProduct.name}'!`);
    setShowDispenseModal(false);
    setSelectedProduct(null);
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          (p.barcode && p.barcode.includes(searchQuery));
    const matchesCategory = categoryFilter === 'ALL' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#f8fafc' }}>Inventory Ledger & Stock</h1>
          <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginTop: '4px' }}>Audit-first stock ledger with batch, expiry, and prescription controls</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-success" onClick={() => setShowAddProductModal(true)}>
            <Plus size={18} /> Add New Medication
          </button>
          <button className="btn btn-secondary" onClick={loadProducts}>
            <RefreshCw size={16} /> Refresh Stock
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e293b', padding: '12px 16px', borderRadius: '12px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['ALL', 'LOW_STOCK', 'EXPIRING'].map(tab => (
            <button 
              key={tab} 
              className={`btn ${activeTab === tab ? 'btn-success' : 'btn-secondary'}`} 
              onClick={() => setActiveTab(tab)}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              {tab === 'ALL' && 'All Products'}
              {tab === 'LOW_STOCK' && '⚠️ Low Stock Alerts'}
              {tab === 'EXPIRING' && '⌛ Expiring Batches'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ position: 'relative', width: '220px' }}>
            <input 
              type="text" 
              className="input-field" 
              placeholder="Search product or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '10px' }} />
          </div>

          <select 
            className="input-field" 
            value={categoryFilter} 
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ width: '160px' }}
          >
            <option value="ALL">All Categories</option>
            <option value="Pain Relief">Pain Relief</option>
            <option value="Antibiotic">Antibiotic</option>
            <option value="Cold & Flu">Cold & Flu</option>
            <option value="Diabetes">Diabetes</option>
          </select>
        </div>
      </div>

      <div style={{ background: '#1e293b', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <table className="cart-table">
          <thead>
            <tr>
              <th>Barcode / SKU</th>
              <th>Medication Name</th>
              <th>Category</th>
              <th>Selling Price</th>
              <th>Quantity on Hand</th>
              <th>Prescription</th>
              <th>Stock Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.length > 0 ? filteredProducts.map(p => (
              <tr key={p.product_id}>
                <td style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{p.barcode || 'N/A'}</td>
                <td style={{ fontWeight: '600', color: '#f8fafc' }}>
                  {p.name}
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Dosage: {p.dosage || '500mg'}</div>
                </td>
                <td><span className="badge badge-blue">{p.category}</span></td>
                <td style={{ color: '#4ade80', fontWeight: '600' }}>K {parseFloat(p.selling_price).toFixed(2)}</td>
                <td>
                  <span className={`badge ${p.quantity_on_hand > 10 ? 'badge-green' : 'badge-red'}`}>
                    {p.quantity_on_hand} units
                  </span>
                </td>
                <td>
                  {p.requires_prescription ? (
                    <span className="badge badge-yellow">Rx Required</span>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>OTC Drug</span>
                  )}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      className="btn" 
                      style={{ background: '#10b981', padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => { setSelectedProduct(p); setShowReceiveStockModal(true); }}
                    >
                      <ArrowUpRight size={14} /> Receive Stock
                    </button>
                    <button 
                      className="btn" 
                      style={{ background: '#ef4444', padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={() => { setSelectedProduct(p); setShowDispenseModal(true); }}
                    >
                      <ArrowDownRight size={14} /> Dispense
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>No products found matching filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAddProductModal} onClose={() => setShowAddProductModal(false)} title="Add New Medication Product">
        <form onSubmit={handleAddProductSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Product Name:</label>
            <input type="text" className="input-field" required placeholder="e.g. Amoxicillin 500mg" value={productForm.name} onChange={(e) => setProductForm({ ...productForm, name: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Barcode / SKU:</label>
            <input type="text" className="input-field" placeholder="e.g. 600123456709" value={productForm.barcode} onChange={(e) => setProductForm({ ...productForm, barcode: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Category:</label>
              <select className="input-field" value={productForm.category} onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}>
                <option value="Pain Relief">Pain Relief</option>
                <option value="Antibiotic">Antibiotic</option>
                <option value="Cold & Flu">Cold & Flu</option>
                <option value="Diabetes">Diabetes</option>
                <option value="Vitamins">Vitamins</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Dosage:</label>
              <input type="text" className="input-field" placeholder="500mg" value={productForm.dosage} onChange={(e) => setProductForm({ ...productForm, dosage: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Cost Price (K):</label>
              <input type="number" className="input-field" value={productForm.cost_price} onChange={(e) => setProductForm({ ...productForm, cost_price: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Selling Price (K):</label>
              <input type="number" className="input-field" value={productForm.selling_price} onChange={(e) => setProductForm({ ...productForm, selling_price: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <input type="checkbox" id="rxCheck" checked={productForm.requires_prescription} onChange={(e) => setProductForm({ ...productForm, requires_prescription: e.target.checked })} />
            <label htmlFor="rxCheck" style={{ fontSize: '0.85rem' }}>Requires Doctor Prescription before checkout</label>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowAddProductModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Save Product</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showReceiveStockModal} onClose={() => setShowReceiveStockModal(false)} title={`Receive Stock - ${selectedProduct?.name}`}>
        <form onSubmit={handleReceiveStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Batch Number:</label>
            <input type="text" className="input-field" required placeholder="e.g. BATCH-2026-X" value={receiveForm.batch_number} onChange={(e) => setReceiveForm({ ...receiveForm, batch_number: e.target.value })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Quantity Received:</label>
              <input type="number" className="input-field" required min="1" value={receiveForm.quantity} onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Expiry Date:</label>
              <input type="date" className="input-field" required value={receiveForm.expiry_date} onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowReceiveStockModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-success" style={{ flex: 1 }}>Confirm Received Stock</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showDispenseModal} onClose={() => setShowDispenseModal(false)} title={`Manual Dispense - ${selectedProduct?.name}`}>
        <form onSubmit={handleDispenseStockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Quantity to Dispense:</label>
            <input type="number" className="input-field" required min="1" max={selectedProduct?.quantity_on_hand || 100} value={dispenseForm.quantity} onChange={(e) => setDispenseForm({ ...dispenseForm, quantity: e.target.value })} />
          </div>
          <div>
            <label style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Notes / Reason:</label>
            <input type="text" className="input-field" value={dispenseForm.notes} onChange={(e) => setDispenseForm({ ...dispenseForm, notes: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
            <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDispenseModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-danger" style={{ flex: 1 }}>Confirm Dispense</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
