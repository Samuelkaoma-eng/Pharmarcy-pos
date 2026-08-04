import React from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Toaster } from 'sonner';
import { LayoutDashboard, Building2, FileCheck2, GitPullRequestArrow, LogOut, Command } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ControlHubLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const items = [
    { path: '/controlhub/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/controlhub/tenants', icon: Building2, label: 'Tenants' },
    { path: '/controlhub/onboarding', icon: FileCheck2, label: 'Onboarding' },
    { path: '/controlhub/approvals', icon: GitPullRequestArrow, label: 'Approvals' }
  ];

  const handleLogout = () => {
    logout();
    navigate('/controlhub/login');
  };

  return (
    <div className="pos-layout controlhub-layout">
      <Toaster position="top-right" theme="dark" richColors />

      <aside className="sidebar">
        <div className="sidebar-header">
          <h2><Command size={16} /> ControlHub</h2>
          <span>Platform administration</span>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link key={item.path} to={item.path} className={`nav-item ${isActive ? 'active' : ''}`}>
                {isActive && (
                  <motion.span
                    layoutId="ch-nav-pill"
                    className="nav-pill"
                    transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                  />
                )}
                <item.icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="main-content">
        <header className="top-header">
          <div className="pharmacy-name">Platform administration</div>
          <div className="user-info">
            <span>{user?.full_name || user?.username || 'Platform staff'}</span>
            <button onClick={handleLogout} className="logout-btn" title="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </header>

        <main className="page-content">
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
    </div>
  );
}
