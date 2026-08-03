import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, UserPlus, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ControlHubLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const items = [
    { path: '/controlhub/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { path: '/controlhub/tenants', icon: Users, label: 'Tenants' },
    { path: '/controlhub/onboarding', icon: UserPlus, label: 'Onboarding' },
  ];

  return (
    <div className="pos-layout controlhub-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h2>ControlHub</h2>
        </div>
        <nav className="sidebar-nav">
          {items.map((item) => (
            <Link key={item.path} to={item.path} className={`nav-item ${location.pathname.startsWith(item.path) ? 'active' : ''}`}>
              <item.icon size={20} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
      </aside>
      <div className="main-content">
        <header className="top-header">
          <div className="pharmacy-name">Super Admin Panel</div>
          <div className="user-info">
            <span>{user?.name}</span>
            <button onClick={logout} className="logout-btn"><LogOut size={16} /></button>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
