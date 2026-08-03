import React, { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Package, Users, Activity, FileText, History, Bot, Settings, LogOut, MessageSquare, Search } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { Toaster } from 'sonner';
import AIChatSidebar from '../components/AIChatSidebar';
import CommandPalette from '../components/CommandPalette';

export default function AppLayout() {
  const { user, logout } = useAuthStore();
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
    { path: '/agent', icon: Bot, label: 'Assistant' },
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
          <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block', marginTop: '2px' }}>Role: {user?.role || 'Admin'}</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path} className={`nav-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}>
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div className="pharmacy-name">Central Care Pharmacy</div>
            <button 
              onClick={() => setCmdOpen(true)}
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Search size={14} /> Quick Search <kbd style={{ background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem' }}>Ctrl+K</kbd>
            </button>
          </div>

          <div className="user-info">
            <span style={{ fontWeight: '500', color: '#f8fafc' }}>{user?.username || user?.full_name || 'Staff User'}</span>
            <button onClick={handleLogout} className="logout-btn" title="Logout">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
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
