import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { get, logout as apiLogout, setSessionLostHandler } from '../api/client';

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

const PRODUCT_NAME = 'PharmaPOS';

const applyTheme = (themeColor) => {
  const primary = themeColor || FALLBACK_PRIMARY;
  const root = document.documentElement;
  root.style.setProperty('--tenant-primary', primary);
  root.style.setProperty('--tenant-primary-soft', withAlpha(primary, 0.3));
};

// The browser tab is part of the branding a pharmacy owns. It was fixed in the
// markup as one seeded tenant's name, so every other pharmacy on the platform
// ran the day with somebody else's pharmacy on the tab.
const applyTitle = (name) => {
  document.title = name ? `${name} — ${PRODUCT_NAME}` : PRODUCT_NAME;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('pos_user')) || null);
  const [token, setToken] = useState(() => localStorage.getItem('pos_auth_token') || null);
  const [tenant, setTenant] = useState(null);
  // A stored user is a claim, not proof. Until the server confirms the session
  // the app must not render a workspace — the previous version trusted
  // localStorage, so an expired token still showed the whole shell with empty
  // panels and "Authentication required" scattered through it.
  const [checking, setChecking] = useState(() => Boolean(localStorage.getItem('pos_auth_token')));

  // Confirms who the session actually belongs to, and loads the branding that
  // follows from it.
  //
  // The role decides which console renders — the dispensary or the platform
  // ControlHub — and it used to be read from `pos_user` in localStorage and
  // never checked. localStorage belongs to whoever is sitting at the browser:
  // editing that one field to "SuperAdmin" was enough to make the ControlHub
  // shell render, and a stale entry left by an earlier ControlHub sign-in did
  // the same thing by accident. Every request was still refused by the server,
  // which reads the role from the signed token, so no platform data was ever
  // exposed — but a console nobody is entitled to should not draw at all.
  //
  // So the identity is now taken from `auth/profile`, which reads it from the
  // database under the token, and the stored copy is only ever a cache for the
  // first paint. A session whose identity cannot be confirmed is not a session.
  const loadSession = useCallback(async () => {
    if (!localStorage.getItem('pos_auth_token')) return;

    const [profileRes, tenantRes] = await Promise.all([
      get('auth/profile'),
      get('tenants/config')
    ]);

    if (profileRes?.data) {
      const confirmed = {
        id: profileRes.data.user_id,
        username: profileRes.data.username,
        full_name: profileRes.data.full_name,
        role: profileRes.data.role,
        tenantId: profileRes.data.tenant_id
      };
      setUser(confirmed);
      localStorage.setItem('pos_user', JSON.stringify(confirmed));
    } else {
      // Fail closed. An identity the server would not confirm is not one to
      // fall back on, and falling back is precisely what would restore the
      // unverified stored role this exists to stop trusting.
      setUser(null);
      localStorage.removeItem('pos_user');
    }

    if (tenantRes?.data) {
      setTenant(tenantRes.data);
      applyTheme(tenantRes.data.theme_color);
      applyTitle(tenantRes.data.name);
    }
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    setTenant(null);
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_auth_token');
    localStorage.removeItem('pos_tenant_id');
    applyTheme(FALLBACK_PRIMARY);
    applyTitle(null);
  }, []);

  // The API client calls this when a refresh could not recover the session, so
  // one dead request tears the workspace down rather than leaving the user
  // clicking a screen where nothing works.
  useEffect(() => {
    setSessionLostHandler(() => {
      clearSession();
      setChecking(false);
    });
    return () => setSessionLostHandler(null);
  }, [clearSession]);

  // Identity and branding both follow the signed-in session, so both are read
  // on sign-in and whenever the app is reopened with a stored one.
  //
  // This is also the session check: both calls are authenticated, so a stored
  // token the server will not accept fails here. The API client attempts one
  // rotation first, and only a failed rotation clears the session.
  useEffect(() => {
    let active = true;
    if (!token) {
      setChecking(false);
      return undefined;
    }
    (async () => {
      await loadSession();
      if (active) setChecking(false);
    })();
    return () => { active = false; };
  }, [token, loadSession]);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    setChecking(false);
    localStorage.setItem('pos_user', JSON.stringify(userData));
    localStorage.setItem('pos_auth_token', authToken);
    if (userData?.tenantId) localStorage.setItem('pos_tenant_id', userData.tenantId);
  };

  // Tell the server first, so the refresh family is revoked. Clearing
  // localStorage alone left a copied token working until it expired.
  const logout = () => {
    void apiLogout();
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        tenant,
        login,
        logout,
        refreshTenant: loadSession,
        currency: tenant?.currency_symbol || 'K',
        pharmacyName: tenant?.name || PRODUCT_NAME,
        // True only while a stored session is still being confirmed. Routes use
        // it to hold rather than to decide, so nothing renders on a guess.
        checking,
        isAuthenticated: !!user && !!token
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
