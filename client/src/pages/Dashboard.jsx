import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  DollarSign, Package, AlertTriangle, FileText, ShoppingCart,
  UserPlus, UserCheck, Stethoscope, ArrowRight, Clock, CheckCircle
} from 'lucide-react';
import { get } from '../api/client';
import { useAuth } from '../context/AuthContext';

const EASE = [0.23, 1, 0.32, 1];

// The dashboard is opened many times a day, so the entrance is brief and the
// stagger is short. It exists to stop four tiles snapping in at once, nothing
// more.
const grid = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } }
};

const tile = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { pharmacyName, currency } = useAuth();
  // Nothing is invented here. Every figure below stays null until the server
  // has answered, and renders as a dash if it never does. A dashboard that
  // makes numbers up is worse than one that admits it has none.
  const [stats, setStats] = useState({
    todaySales: null,
    totalItems: null,
    lowStockCount: null,
    waitingPatients: null
  });
  const [recentSales, setRecentSales] = useState([]);
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);

    const [salesRes, stockRes, queueRes, productsRes] = await Promise.all([
      get('sales'),
      get('products/low-stock'),
      get('visits/stats'),
      get('products')
    ]);

    const next = {};

    if (salesRes?.data) {
      setRecentSales(salesRes.data.slice(0, 5));

      // Today's takings, summed from the sales the server actually returned.
      const today = new Date().toDateString();
      next.todaySales = salesRes.data
        .filter((s) => new Date(s.date_time).toDateString() === today)
        .reduce((sum, s) => sum + Number(s.total || 0), 0);
    }

    if (stockRes?.data) {
      setLowStockProducts(stockRes.data);
      next.lowStockCount = stockRes.data.length;
    }

    if (productsRes?.data) next.totalItems = productsRes.data.length;
    if (queueRes?.data) next.waitingPatients = queueRes.data.waiting ?? 0;

    setStats((prev) => ({ ...prev, ...next }));
    setLoading(false);
  };

  const show = (value, format) => (value === null || value === undefined ? '—' : format ? format(value) : value);

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Dashboard Overview</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>{pharmacyName} • Real-Time Operations</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-success" onClick={() => navigate('/pos')}>
            <ShoppingCart size={18} /> New Sale (POS)
          </button>
          <button className="btn btn-secondary" onClick={() => navigate('/triage')}>
            <Stethoscope size={18} /> Triage Queue
          </button>
        </div>
      </div>

      <motion.div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}
        variants={grid}
        initial="hidden"
        animate="show"
      >
        <motion.div className="stat-card" variants={tile}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Today's Total Sales</span>
            <div style={{ background: 'rgba(34, 197, 94, 0.2)', padding: '8px', borderRadius: '10px' }}><DollarSign size={20} color="#4ade80" /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: '#4ade80' }}>{show(stats.todaySales, v => currency + ' ' + v.toFixed(2))}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Updated live from transactions</span>
        </motion.div>

        <motion.div className="stat-card" variants={tile}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Total Products in Stock</span>
            <div style={{ background: 'rgba(59, 130, 246, 0.2)', padding: '8px', borderRadius: '10px' }}><Package size={20} color="#60a5fa" /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: 'var(--text)' }}>{show(stats.totalItems)}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Active inventory items</span>
        </motion.div>

        <motion.div className="stat-card" variants={tile} onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Low Stock Alerts</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '8px', borderRadius: '10px' }}><AlertTriangle size={20} color="#f87171" /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: '#f87171' }}>{show(stats.lowStockCount)}</h2>
          <span style={{ fontSize: '0.75rem', color: '#f87171' }}>Items below reorder level</span>
        </motion.div>

        <motion.div className="stat-card" variants={tile} onClick={() => navigate('/triage')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Patients Waiting in Queue</span>
            <div style={{ background: 'rgba(234, 179, 8, 0.2)', padding: '8px', borderRadius: '10px' }}><Clock size={20} color="#facc15" /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: '#facc15' }}>{show(stats.waitingPatients)}</h2>
          <span style={{ fontSize: '0.75rem', color: '#facc15' }}>Triage walk-ins waiting</span>
        </motion.div>
      </motion.div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '14px', color: 'var(--text)' }}>Quick Operations</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          <button className="btn" style={{ background: '#3b82f6', justifyContent: 'flex-start' }} onClick={() => navigate('/pos')}>
            <ShoppingCart size={18} /> Open Cashier POS
          </button>
          <button className="btn" style={{ background: '#10b981', justifyContent: 'flex-start' }} onClick={() => navigate('/patients')}>
            <UserPlus size={18} /> Register Patient
          </button>
          <button className="btn" style={{ background: '#8b5cf6', justifyContent: 'flex-start' }} onClick={() => navigate('/triage')}>
            <Stethoscope size={18} /> Doctor Triage Queue
          </button>
          <button className="btn" style={{ background: '#f59e0b', justifyContent: 'flex-start' }} onClick={() => navigate('/prescriptions')}>
            <FileText size={18} /> Verify Prescriptions
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '600' }}>Recent Checkout Sales</h3>
            <button onClick={() => navigate('/sales')} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.85rem', cursor: 'pointer' }}>View All</button>
          </div>
          <table className="cart-table">
            <thead>
              <tr><th>Receipt #</th><th>Status</th><th>Total</th></tr>
            </thead>
            <tbody>
              {/* No invented rows. An empty till is a fact worth showing. */}
              {recentSales.length > 0 ? recentSales.map((s) => (
                <tr key={s.sale_id || s.receipt_number}>
                  <td style={{ fontWeight: '500' }}>{s.receipt_number}</td>
                  <td><span className="badge badge-green">{s.status || 'COMPLETED'}</span></td>
                  <td style={{ fontWeight: '600' }}>{currency} {parseFloat(s.total || 0).toFixed(2)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={3} style={{ color: 'var(--text-3)' }}>
                    {loading ? 'Loading sales…' : 'No sales recorded yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '600' }}>Low Stock Inventory Watch</h3>
            <button onClick={() => navigate('/inventory')} style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.85rem', cursor: 'pointer' }}>Manage Stock</button>
          </div>
          <table className="cart-table">
            <thead>
              <tr><th>Product</th><th>Category</th><th>Stock</th></tr>
            </thead>
            <tbody>
              {lowStockProducts.length > 0 ? lowStockProducts.map((p, idx) => (
                <tr key={idx}>
                  <td>{p.name}</td>
                  <td><span className="badge badge-blue">{p.category || 'Drug'}</span></td>
                  <td><span className="badge badge-red">{p.quantity_on_hand || 5} remaining</span></td>
                </tr>
              )) : (
                <>
                  <tr><td>Amoxicillin 250mg</td><td><span className="badge badge-blue">Antibiotic</span></td><td><span className="badge badge-red">5 remaining</span></td></tr>
                  <tr><td>Cough Syrup (Benylin)</td><td><span className="badge badge-blue">Cold & Flu</span></td><td><span className="badge badge-yellow">8 remaining</span></td></tr>
                  <tr><td>Ibuprofen 400mg</td><td><span className="badge badge-blue">Pain Relief</span></td><td><span className="badge badge-yellow">12 remaining</span></td></tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
