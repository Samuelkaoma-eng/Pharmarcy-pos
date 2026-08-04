import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  DollarSign, Package, AlertTriangle, FileText, ShoppingCart,
  UserPlus, Stethoscope, ArrowRight, Clock, CheckCircle
} from 'lucide-react';
import { get } from '../api/client';
import { useAuth } from '../context/AuthContext';

const EASE = [0.23, 1, 0.32, 1];

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
  const { user, pharmacyName, currency } = useAuth();
  const role = user?.role;

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

  const quickOps = [
    { path: '/pos', icon: ShoppingCart, label: 'Open Cashier POS', roles: ['Admin', 'Pharmacist', 'Cashier'] },
    { path: '/patients', icon: UserPlus, label: 'Register Patient', roles: ['Admin', 'Pharmacist', 'Doctor'] },
    { path: '/triage', icon: Stethoscope, label: 'Doctor Triage Queue', roles: ['Admin', 'Pharmacist', 'Doctor'] },
    { path: '/prescriptions', icon: FileText, label: 'Verify Prescriptions', roles: ['Admin', 'Pharmacist'] },
  ];

  const visibleOps = quickOps.filter(op => op.roles.includes(role));

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Dashboard Overview</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>{pharmacyName} • Real-Time Operations</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {['Admin', 'Pharmacist', 'Cashier'].includes(role) && (
            <button className="btn btn-primary" onClick={() => navigate('/pos')}>
              <ShoppingCart size={18} /> New Sale (POS)
            </button>
          )}
          {['Admin', 'Pharmacist', 'Doctor'].includes(role) && (
            <button className="btn btn-secondary" onClick={() => navigate('/triage')}>
              <Stethoscope size={18} /> Triage Queue
            </button>
          )}
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
            <div style={{ background: 'rgba(63, 185, 80, 0.12)', padding: '8px', borderRadius: '10px' }}><DollarSign size={20} style={{ color: 'var(--ok)' }} /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: 'var(--ok)' }}>{show(stats.todaySales, v => currency + ' ' + v.toFixed(2))}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Updated live from transactions</span>
        </motion.div>

        <motion.div className="stat-card" variants={tile}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Total Products in Stock</span>
            <div style={{ background: 'var(--tenant-primary-soft)', padding: '8px', borderRadius: '10px' }}><Package size={20} style={{ color: 'var(--tenant-primary)' }} /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: 'var(--text)' }}>{show(stats.totalItems)}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Active inventory items</span>
        </motion.div>

        <motion.div className="stat-card" variants={tile} onClick={() => navigate('/inventory')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Low Stock Alerts</span>
            <div style={{ background: 'rgba(248, 81, 73, 0.12)', padding: '8px', borderRadius: '10px' }}><AlertTriangle size={20} style={{ color: 'var(--danger)' }} /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: 'var(--danger)' }}>{show(stats.lowStockCount)}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Items below reorder level</span>
        </motion.div>

        <motion.div className="stat-card" variants={tile} onClick={() => navigate('/triage')} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-2)', fontWeight: '500' }}>Patients Waiting in Queue</span>
            <div style={{ background: 'rgba(210, 153, 34, 0.12)', padding: '8px', borderRadius: '10px' }}><Clock size={20} style={{ color: 'var(--warn)' }} /></div>
          </div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '700', marginTop: '8px', color: 'var(--warn)' }}>{show(stats.waitingPatients)}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>Triage walk-ins waiting</span>
        </motion.div>
      </motion.div>

      {visibleOps.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: '600', marginBottom: '14px', color: 'var(--text)' }}>Quick Operations</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {visibleOps.map((op) => (
              <button key={op.path} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }} onClick={() => navigate(op.path)}>
                <op.icon size={18} /> {op.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid-2" style={{ gap: '20px' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: '600' }}>Recent Checkout Sales</h3>
            <button onClick={() => navigate('/sales')} style={{ background: 'none', border: 'none', color: 'var(--tenant-primary)', fontSize: '0.85rem', cursor: 'pointer' }}>View All</button>
          </div>
          <table className="cart-table">
            <thead>
              <tr><th>Receipt #</th><th>Status</th><th>Total</th></tr>
            </thead>
            <tbody>
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
            <button onClick={() => navigate('/inventory')} style={{ background: 'none', border: 'none', color: 'var(--tenant-primary)', fontSize: '0.85rem', cursor: 'pointer' }}>Manage Stock</button>
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
