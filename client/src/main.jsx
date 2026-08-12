import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { AuthProvider, useAuth } from './context/AuthContext';
import { canAccess, HOME_PATH } from './constants/navigation';
import AppLayout from './layouts/AppLayout';
import ControlHubLayout from './layouts/ControlHubLayout';

import Landing from './pages/Landing';
import Register from './pages/Register';
import OnboardingPortal from './pages/OnboardingPortal';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import POSCheckout from './pages/POSCheckout';
import Inventory from './pages/Inventory';
import Patients from './pages/Patients';
import TriageQueue from './pages/TriageQueue';
import Prescriptions from './pages/Prescriptions';
import SalesHistory from './pages/SalesHistory';
import TillSessions from './pages/TillSessions';
import Reports from './pages/Reports';
import AgentChat from './pages/AgentChat';
import Settings from './pages/Settings';
import Staff from './pages/Staff';
import Procurement from './pages/Procurement';
import Insurance from './pages/Insurance';

import CHLogin from './pages/controlhub/CHLogin';
import CHDashboard from './pages/controlhub/CHDashboard';
import CHTenants from './pages/controlhub/CHTenants';
import CHOnboarding from './pages/controlhub/CHOnboarding';
import CHApprovals from './pages/controlhub/CHApprovals';

// Held while a stored session is still being confirmed with the server. It
// renders nothing of the workspace — no navigation, no page, no data — because
// a token in localStorage is a claim and not proof.
const SessionGate = () => (
  <div
    style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: 'var(--text-2)', fontSize: '0.9rem'
    }}
  >
    Checking your session…
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, user, checking } = useAuth();
  // Order matters. Deciding before the check completes is what let an expired
  // token render the whole shell with empty panels behind it.
  if (checking) return <SessionGate />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role === 'SuperAdmin') return <Navigate to="/controlhub/dashboard" replace />;
  return children;
};

// A page is opened only by a role entitled to it. The sidebar has always hidden
// what a role cannot use, but hiding a link is not a control: the router
// rendered any page to anyone who typed its address, so a cashier could open
// Staff & Roles and read the staff list, or open Site Settings. The server
// refuses the actions either way and that remains the guarantee — this stops
// the page being reachable at all, from the same declaration the menu uses.
const RoleRoute = ({ path, children }) => {
  const { user } = useAuth();
  if (!canAccess(path, user?.role)) return <Navigate to={HOME_PATH} replace />;
  return children;
};

const ControlHubRoute = ({ children }) => {
  const { isAuthenticated, user, checking } = useAuth();
  if (checking) return <SessionGate />;
  if (!isAuthenticated) return <Navigate to="/controlhub/login" replace />;
  if (user?.role !== 'SuperAdmin') return <Navigate to="/login" replace />;
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
          {/* Opened from the link an applying pharmacy is sent. It is public
              because the applicant has no account until it is approved — the
              token in the link is what authorises it, not a session. */}
          <Route path="/onboarding/:tenantId" element={<OnboardingPortal />} />
          <Route path="/login" element={<Login />} />
          <Route path="/controlhub/login" element={<CHLogin />} />

          {/* The workspace is a layout route with no path of its own, so the
              public landing page can own "/" while these stay top level. */}
          <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<RoleRoute path="/dashboard"><Dashboard /></RoleRoute>} />
            <Route path="/pos" element={<RoleRoute path="/pos"><POSCheckout /></RoleRoute>} />
            <Route path="/inventory" element={<RoleRoute path="/inventory"><Inventory /></RoleRoute>} />
            <Route path="/patients" element={<RoleRoute path="/patients"><Patients /></RoleRoute>} />
            <Route path="/triage" element={<RoleRoute path="/triage"><TriageQueue /></RoleRoute>} />
            <Route path="/prescriptions" element={<RoleRoute path="/prescriptions"><Prescriptions /></RoleRoute>} />
            <Route path="/sales" element={<RoleRoute path="/sales"><SalesHistory /></RoleRoute>} />
            <Route path="/till" element={<RoleRoute path="/till"><TillSessions /></RoleRoute>} />
            <Route path="/reports" element={<RoleRoute path="/reports"><Reports /></RoleRoute>} />
            <Route path="/procurement" element={<RoleRoute path="/procurement"><Procurement /></RoleRoute>} />
            <Route path="/insurance" element={<RoleRoute path="/insurance"><Insurance /></RoleRoute>} />
            <Route path="/agent" element={<RoleRoute path="/agent"><AgentChat /></RoleRoute>} />
            <Route path="/staff" element={<RoleRoute path="/staff"><Staff /></RoleRoute>} />
            <Route path="/settings" element={<RoleRoute path="/settings"><Settings /></RoleRoute>} />
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
