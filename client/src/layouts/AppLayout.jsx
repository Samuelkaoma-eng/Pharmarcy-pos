import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { LayoutDashboard, ShoppingCart, Package, Users, UsersRound, Activity, FileText, History, Bot, Settings, LogOut, MessageSquare, Search, Truck, HeartHandshake, Wallet, FileSpreadsheet } from 'lucide-react';
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

  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/pos', icon: ShoppingCart, label: 'POS Checkout' },
    { path: '/inventory', icon: Package, label: 'Inventory' },
    { path: '/patients', icon: Users, label: 'Patients' },
    { path: '/triage', icon: Activity, label: 'Triage Queue' },
    { path: '/prescriptions', icon: FileText, label: 'Prescriptions' },
    { path: '/sales', icon: History, label: 'Sales History' },
    { path: '/till', icon: Wallet, label: 'Till Sessions' },
    { path: '/reports', icon: FileSpreadsheet, label: 'Reports' },
    { path: '/procurement', icon: Truck, label: 'Procurement' },
    { path: '/insurance', icon: HeartHandshake, label: 'Insurance' },
    { path: '/agent', icon: Bot, label: 'Assistant' },
    { path: '/staff', icon: UsersRound, label: 'Staff & Roles' },
    { path: '/settings', icon: Settings, label: 'Site Settings' },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="pos-layout">
      <Toaster position="top-right" theme="dark" richColors />

      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>PharmaPOS</h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', display: 'block', marginTop: '2px' }}>Role: {user?.role || 'Staff'}</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
