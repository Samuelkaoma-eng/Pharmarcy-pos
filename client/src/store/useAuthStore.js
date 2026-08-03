import { create } from 'zustand';

export const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem('pos_user')) || null,
  token: localStorage.getItem('pos_auth_token') || null,
  tenantId: localStorage.getItem('pos_tenant_id') || '11111111-1111-1111-1111-111111111111',
  isAuthenticated: !!localStorage.getItem('pos_auth_token'),

  login: (userData, authToken) => {
    const tenantId = userData.tenantId || userData.tenant_id || '11111111-1111-1111-1111-111111111111';
    localStorage.setItem('pos_user', JSON.stringify(userData));
    localStorage.setItem('pos_auth_token', authToken);
    localStorage.setItem('pos_tenant_id', tenantId);
    set({ user: userData, token: authToken, tenantId, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('pos_user');
    localStorage.removeItem('pos_auth_token');
    localStorage.removeItem('pos_tenant_id');
    set({ user: null, token: null, tenantId: '11111111-1111-1111-1111-111111111111', isAuthenticated: false });
  }
}));
