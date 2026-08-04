import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import AppLayout from './layouts/AppLayout';
import ControlHubLayout from './layouts/ControlHubLayout';

import Landing from './pages/Landing';
import Register from './pages/Register';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POSCheckout from './pages/POSCheckout';
import Inventory from './pages/Inventory';
import Patients from './pages/Patients';
import TriageQueue from './pages/TriageQueue';
import Prescriptions from './pages/Prescriptions';
import SalesHistory from './pages/SalesHistory';
import AgentChat from './pages/AgentChat';
import Settings from './pages/Settings';
import TillSessions from './pages/TillSessions';
import Procurement from './pages/Procurement';
import Insurance from './pages/Insurance';
import Staff from './pages/Staff';

import CHLogin from './pages/controlhub/CHLogin';
import CHDashboard from './pages/controlhub/CHDashboard';
import CHTenants from './pages/controlhub/CHTenants';
import CHOnboarding from './pages/controlhub/CHOnboarding';
import CHApprovals from './pages/controlhub/CHApprovals';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (user?.role === 'SuperAdmin') return <Navigate to="/controlhub/dashboard" />;
  return children;
};

const ControlHubRoute = ({ children }) => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/controlhub/login" />;
  if (user?.role !== 'SuperAdmin') return <Navigate to="/login" />;
  return children;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Landing />} />
          <Route path="/register" element={<Register />} />
          <Route path="/login" element={<Login />} />
          <Route path="/controlhub/login" element={<CHLogin />} />

          {/* The workspace is a layout route with no path of its own, so the
              public landing page can own "/" while these stay top level. */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pos" element={<POSCheckout />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/patients" element={<Patients />} />
            <Route path="/triage" element={<TriageQueue />} />
            <Route path="/prescriptions" element={<Prescriptions />} />
            <Route path="/sales" element={<SalesHistory />} />
            <Route path="/agent" element={<AgentChat />} />
            <Route path="/till" element={<TillSessions />} />
            <Route path="/procurement" element={<Procurement />} />
            <Route path="/insurance" element={<Insurance />} />
            <Route path="/staff" element={<Staff />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          <Route path="/controlhub" element={<ControlHubRoute><ControlHubLayout /></ControlHubRoute>}>
            <Route index element={<Navigate to="/controlhub/dashboard" />} />
            <Route path="dashboard" element={<CHDashboard />} />
            <Route path="tenants" element={<CHTenants />} />
            <Route path="onboarding" element={<CHOnboarding />} />
            <Route path="approvals" element={<CHApprovals />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
);
