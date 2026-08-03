import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { get } from '../api/client';

const AuthContext = createContext();

const FALLBACK_PRIMARY = '#3b82f6';

// Expands #rgb or #rrggbb into an rgba() string. The soft variant is used for
// glows and shadows so they tint with the pharmacy's colour instead of staying
// the hardcoded blue they were before.
const withAlpha = (hex, alpha) => {
  if (typeof hex !== 'string') return `rgba(59, 130, 246, ${alpha})`;
  let value = hex.trim().replace('#', '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(value)) return `rgba(59, 130, 246, ${alpha})`;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const applyTheme = (themeColor) => {
  const primary = themeColor || FALLBACK_PRIMARY;
  const root = document.documentElement;
  root.style.setProperty('--tenant-primary', primary);
  root.style.setProperty('--tenant-primary-soft', withAlpha(primary, 0.3));
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('pos_user')) || null);
  const [token, setToken] = useState(() => localStorage.getItem('pos_auth_token') || null);
  const [tenant, setTenant] = useState(null);

  const loadTenant = useCallback(async () => {
    if (!localStorage.getItem('pos_auth_token')) return;
    const res = await get('tenants/config');
    if (res?.data) {
      setTenant(res.data);
      applyTheme(res.data.theme_color);
    }
  }, []);

  // Branding follows the signed-in pharmacy, so it is loaded on sign-in and
  // whenever the app is reopened with a stored session.
  useEffect(() => {
    if (token) loadTenant();
  }, [token, loadTenant]);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    localStorage.setItem('pos_auth_token', authToken);
    if (userData?.tenantId) localStorage.setItem('pos_tenant_id', userData.tenantId);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    setTenant(null);
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_auth_token');
    localStorage.removeItem('pos_tenant_id');
    applyTheme(FALLBACK_PRIMARY);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        tenant,
        login,
        logout,
        refreshTenant: loadTenant,
        currency: tenant?.currency_symbol || 'K',
        pharmacyName: tenant?.name || 'Pharmacy POS',
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
