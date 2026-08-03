import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, Plus, Minus, Trash2, Barcode, Printer, CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import NumberFlow from '@number-flow/react';
import { get, post } from '../api/client';
import { useCartStore } from '../store/useCartStore';
import { useAuth } from '../context/AuthContext';
import Receipt from '../components/Receipt';

export default function POSCheckout() {
  const { tenant, pharmacyName, currency, user } = useAuth();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState(null);
  // The cart is emptied the moment the sale succeeds, so what was sold has to
  // be captured before that or the receipt renders with no lines.
  const [receiptItems, setReceiptItems] = useState([]);
  const [receiptTotals, setReceiptTotals] = useState({ subtotal: 0, vat: 0, total: 0 });

  const { 
    cart, 
    prescriptionId, 
    paymentType, 
    setPrescriptionId, 
    setPaymentType, 
    addToCart, 
    updateQty, 
    removeFromCart, 
    clearCart,
    getSubtotal,
    getVat,
    getGrandTotal
  } = useCartStore();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const res = await get('products');
      if (res?.data) {
        setProducts(res.data);
        return;
      }
    } catch (e) {
      toast.error('Failed to load products from database');
    }

    // No invented catalogue. A failed load is reported, not disguised as stock.
    setProducts([]);
  };

  const handleBarcodeScan = (e) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const found = products.find(p => p.barcode === barcodeInput);
    if (found) {
      addToCart(found);
      toast.success(`Added ${found.name} to cart`);
      setBarcodeInput('');
    } else {
      toast.error(`Product with barcode '${barcodeInput}' not found`);
    }
  };

  const subtotal = getSubtotal();
  const vat = getVat();
  const grandTotal = getGrandTotal();

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    const hasRx = cart.some(i => i.requires_prescription);
    if (hasRx && !prescriptionId) {
      toast.error('Prescription ID is required for prescription drugs');
      return;
    }

    const soldItems = cart.map((i) => ({ ...i }));
    const soldTotals = { subtotal, vat, total: grandTotal };

    toast.promise(
      post('sales', {
        items: cart.map(i => ({ productId: i.product_id, quantity: i.qty })),
        paymentType,
        prescriptionId: prescriptionId || null
      }),
      {
        loading: 'Processing transaction...',
        success: (res) => {
          if (res?.data) {
            setReceiptData(res.data);
            setReceiptItems(soldItems);
            setReceiptTotals(soldTotals);
            setShowReceipt(true);
            clearCart();
            return 'Sale completed successfully!';
          }
          throw new Error(res?.error || 'Sale transaction failed');
        },
        error: (err) => err.message || 'Failed to complete transaction'
      }
    );
  };

  const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.barcode && p.barcode.includes(search)));

  return (
    <div className="pos-main">
      {/* LEFT CATALOG */}
      <div className="catalog-section">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
          <form onSubmit={handleBarcodeScan} style={{ display: 'flex', gap: '8px', flex: 1 }}>
            <input 
              type="text" 
              placeholder="Scan Barcode (e.g. 600123456701)..." 
              className="input-field" 
              value={barcodeInput} 
              onChange={e => setBarcodeInput(e.target.value)} 
            />
            <button type="submit" className="btn btn-primary"><Barcode size={18} /> Scan</button>
          </form>

          <input 
            type="text" 
            placeholder="Search drug..." 
            className="input-field" 
            style={{ width: '200px' }}
            value={search} 
            onChange={e => setSearch(e.target.value)} 
          />
        </div>

        <div className="product-grid">
          {filteredProducts.map(p => (
            <div key={p.product_id} className="product-card" onClick={() => { addToCart(p); toast.success(`Added ${p.name}`); }}>
              <div>
                <h4 style={{ color: '#fff', fontSize: '1rem' }}>{p.name}</h4>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <span className="badge badge-blue">{p.category}</span>
                  {p.requires_prescription && <span className="badge badge-yellow">Rx Required</span>}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
                <span className="stock-text" style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Stock: {p.quantity_on_hand || 100}</span>
                <span className="price-text" style={{ color: '#4ade80', fontWeight: '700', fontSize: '1.1rem' }}>
                  {currency} <NumberFlow value={parseFloat(p.selling_price)} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT BASKET */}
      <div className="cart-section">
        <div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <ShoppingCart size={20} color="#3b82f6" /> Active Sale Basket ({cart.length})
          </h3>

          {cart.length === 0 ? (
            <p style={{ color: 'var(--text-3)', textAlign: 'center', margin: '40px 0' }}>Scan barcode or click items to add to cart.</p>
          ) : (
            <table className="cart-table">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Subtotal</th><th></th></tr>
              </thead>
              <tbody>
                {cart.map(item => (
                  <tr key={item.product_id}>
                    <td>{item.name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <button className="qty-btn" onClick={() => updateQty(item.product_id, -1)}><Minus size={12}/></button>
                        <span>{item.qty}</span>
                        <button className="qty-btn" onClick={() => updateQty(item.product_id, 1)}><Plus size={12}/></button>
                      </div>
                    </td>
                    <td style={{ color: '#4ade80' }}>
                      {currency} <NumberFlow value={item.subtotal} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
                    </td>
                    <td><button className="icon-btn text-danger" onClick={() => removeFromCart(item.product_id)}><Trash2 size={16}/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          {cart.some(i => i.requires_prescription) && (
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-2)', display: 'block', marginBottom: '4px' }}>Prescription ID (Required):</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Enter Prescription #" 
                value={prescriptionId} 
                onChange={e => setPrescriptionId(e.target.value)} 
              />
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            {['cash', 'card', 'mobile'].map(type => (
              <button 
                key={type} 
                className={`btn ${paymentType === type ? 'btn-success' : 'btn-secondary'}`}
                style={{ flex: 1, textTransform: 'capitalize', padding: '6px' }}
                onClick={() => setPaymentType(type)}
              >
                {type}
              </button>
            ))}
          </div>

          <div className="summary-card">
            <div className="summary-row">
              <span>Subtotal:</span>
              <span>{currency} <NumberFlow value={subtotal} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} /></span>
            </div>
            <div className="summary-row">
              <span>VAT (16%):</span>
              <span>{currency} <NumberFlow value={vat} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} /></span>
            </div>
            <div className="summary-row summary-total">
              <span>Total:</span>
              <span style={{ color: '#4ade80' }}>
                {currency} <NumberFlow value={grandTotal} format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }} />
              </span>
            </div>
          </div>

          <button className="btn btn-success" style={{ marginTop: '12px', width: '100%', padding: '12px', fontSize: '1rem' }} onClick={handleCompleteSale} disabled={cart.length === 0}>
            <CheckCircle size={18} /> Complete Sale & Print Receipt
          </button>
        </div>
      </div>

      {showReceipt && (
        <Receipt
          sale={receiptData}
          items={receiptItems}
          totals={receiptTotals}
          tenant={tenant}
          servedBy={user?.full_name || user?.username}
          currency={currency}
          paymentType={paymentType}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
