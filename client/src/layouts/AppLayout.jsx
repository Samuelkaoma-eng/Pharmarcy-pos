import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, ShoppingCart, Package, Users, UsersRound, Activity, FileText, History, Bot, Settings, LogOut, MessageSquare, Search, Truck, HeartHandshake, Wallet, FileSpreadsheet, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Toaster } from 'sonner';
import AIChatSidebar from '../components/AIChatSidebar';
import CommandPalette from '../components/CommandPalette';

export default function AppLayout() {
  const { user, logout, pharmacyName } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  // Below 900px the sidebar is a drawer rather than a column. It is closed on
  // every navigation because on a phone the drawer covers the page you have
  // just asked for, and leaving it open would hide the answer.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setNavOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/pos', icon: ShoppingCart, label: 'POS Checkout', roles: ['Admin', 'Pharmacist', 'Cashier'] },
    { path: '/inventory', icon: Package, label: 'Inventory', roles: ['Admin', 'Pharmacist'] },
    { path: '/patients', icon: Users, label: 'Patients', roles: ['Admin', 'Pharmacist', 'Doctor'] },
    { path: '/triage', icon: Activity, label: 'Triage Queue', roles: ['Admin', 'Pharmacist', 'Doctor'] },
    { path: '/prescriptions', icon: FileText, label: 'Prescriptions', roles: ['Admin', 'Pharmacist', 'Doctor'] },
    { path: '/sales', icon: History, label: 'Sales History', roles: ['Admin', 'Pharmacist', 'Cashier'] },
    { path: '/till', icon: Wallet, label: 'Till Sessions', roles: ['Admin', 'Pharmacist', 'Cashier'] },
    { path: '/reports', icon: FileSpreadsheet, label: 'Reports', roles: ['Admin'] },
    { path: '/procurement', icon: Truck, label: 'Procurement', roles: ['Admin', 'Pharmacist'] },
    { path: '/insurance', icon: HeartHandshake, label: 'Insurance', roles: ['Admin', 'Pharmacist'] },
    { path: '/agent', icon: Bot, label: 'Assistant' },
    { path: '/staff', icon: UsersRound, label: 'Staff & Roles', roles: ['Admin'] },
    { path: '/settings', icon: Settings, label: 'Site Settings', roles: ['Admin'] },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="pos-layout">
      <Toaster position="top-right" theme="dark" richColors />

      {/* Only ever visible below 900px, where the sidebar is off-canvas. It
          closes the drawer by tapping away from it, which is the gesture a
          phone user reaches for first. */}
      <div
        className={`nav-scrim ${navOpen ? 'is-open' : ''}`}
        onClick={() => setNavOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${navOpen ? 'is-open' : ''}`}>
        <div className="sidebar-header">
          {/* The pharmacy's own name, which is what the workspace belongs to.
              `pharmacyName` was already being read here and then ignored, so
              every tenant saw the product's name instead of their own. */}
          <h2 title={pharmacyName}>{pharmacyName}</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', display: 'block', marginTop: '2px' }}>Role: {user?.role || 'Staff'}</span>
          <button
            className="nav-close"
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="sidebar-nav">
          {navItems.filter(item => !item.roles || item.roles.includes(user?.role)).map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                {/* One pill shared across items, so switching pages slides it
                    rather than cross-fading two separate backgrounds. */}
                {isActive && (
                  <motion.span
                    layoutId="nav-pill"
                    className="nav-pill"
                    transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                  />
                )}
                <item.icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <button
              className="nav-toggle"
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              aria-expanded={navOpen}
            >
              <Menu size={20} />
            </button>
            <div className="pharmacy-name">{pharmacyName}</div>
            <button
              onClick={() => setCmdOpen(true)}
              className="quick-search-btn"
            >
              <Search size={14} /> Quick Search <kbd>Ctrl+K</kbd>
            </button>
          </div>

          <div className="user-info">
            <span style={{ fontWeight: '500', color: 'var(--text)' }}>{user?.full_name || user?.username || 'Staff User'}</span>
            <button onClick={handleLogout} className="logout-btn" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="page-content">
          {/* Page changes fade and lift very slightly. Navigation happens many
              times an hour, so this stays short and small. */}
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
              style={{ height: '100%' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <button className="floating-chat-btn" onClick={() => setChatOpen(!chatOpen)} title="Toggle workflow assistant">
        <MessageSquare size={24} />
      </button>

      <AIChatSidebar isOpen={chatOpen} onClose={() => setChatOpen(false)} />
      <CommandPalette isOpen={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
