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
  // SIMFIS, the simulated fiscalisation service. Held separately from the sale
  // because it is not part of the sale: it is a demonstration of a mechanism
  // this system is not authorised to perform for real.
  const [fiscal, setFiscal] = useState(null);
  const [fiscalising, setFiscalising] = useState(false);
  // Interaction screening. `undefined` means not yet asked; the shape that
  // comes back distinguishes "screened and clear" from "could not be screened",
  // and those two must never be shown the same way.
  const [screen, setScreen] = useState(undefined);

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
            setFiscal(null);
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

  // Screen the basket whenever it holds two or more medicines. Advisory: it
  // informs the pharmacist and never blocks the sale, because a directory
  // outage must not stop a pharmacy trading.
  useEffect(() => {
    const productIds = cart.map((i) => i.product_id);
    if (productIds.length < 2) { setScreen(undefined); return; }

    let cancelled = false;
    (async () => {
      const res = await post('drugs/interactions', { productIds });
      if (cancelled) return;
      // A missing response is itself "could not be screened". It must not read
      // as clear.
      setScreen(res?.data ? { ...res.data, message: res.message } : { available: false, interactions: [] });
    })();

    return () => { cancelled = true; };
  }, [cart]);

  const handleFiscalise = async () => {
    if (!receiptData?.sale_id) return;
    setFiscalising(true);

    const res = await post(`fiscal/sales/${receiptData.sale_id}/fiscalise`, {});
    if (res?.data) {
      setFiscal(res.data);
      toast.success('Fiscalised by SIMFIS', {
        description: 'Simulated only — this is not a valid ZRA tax invoice.'
      });
    } else {
      toast.error('Could not fiscalise the sale', { description: res?.error || 'The server rejected it.' });
    }
    setFiscalising(false);
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
            <div
              key={p.product_id}
              className="product-card"
              onClick={() => {
                // Out of stock is refused here as well as by the checkout
                // guard, so the cashier finds out before the patient is at the
                // counter rather than after.
                if ((p.quantity_on_hand ?? 0) <= 0) {
                  toast.error(`${p.name} is out of stock`);
                  return;
                }
                addToCart(p);
                toast.success(`Added ${p.name}`);
              }}
              style={{ opacity: (p.quantity_on_hand ?? 0) <= 0 ? 0.55 : 1 }}
            >
              <div>
                <h4 style={{ color: '#fff', fontSize: '1rem' }}>{p.name}</h4>
                <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                  <span className="badge badge-blue">{p.category}</span>
                  {p.requires_prescription && <span className="badge badge-yellow">Rx Required</span>}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
                {/* The real figure. `|| 100` here showed "Stock: 100" for
                    anything with none left, which is the catalogue inventing
                    stock the pharmacy does not hold. */}
                <span className="stock-text" style={{ fontSize: '0.8rem', color: (p.quantity_on_hand ?? 0) <= 0 ? 'var(--danger)' : 'var(--text-2)' }}>
                  {(p.quantity_on_hand ?? 0) <= 0 ? 'Out of stock' : `Stock: ${p.quantity_on_hand}`}
                </span>
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
          {screen && (
            <div
              className="summary-card"
              style={{
                marginBottom: '12px',
                borderLeft: `3px solid ${
                  !screen.available ? 'var(--warn)' : screen.interactions.length > 0 ? 'var(--danger)' : 'var(--ok)'
                }`
              }}
            >
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>
                    {!screen.available
                      ? 'Basket could not be screened'
                      : screen.interactions.length > 0
                        ? 'Possible interactions'
                        : 'No known interactions'}
                  </strong>
                  {/* Never claim a clear basket when nothing ran. The free NLM
                      interaction API was withdrawn in January 2024 and the
                      check fails closed until a licensed source is configured. */}
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', margin: '3px 0 0' }}>
                    {!screen.available
                      ? 'No interaction source is configured, so nothing was checked. Use your own judgement.'
                      : screen.interactions.length > 0
                        ? screen.interactions.map((i) => i.description || i.summary).join(' · ')
                        : `${screen.checked} medicines screened.`}
                  </p>
                </div>
              </div>
            </div>
          )}

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
          fiscal={fiscal}
          onFiscalise={handleFiscalise}
          fiscalising={fiscalising}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
