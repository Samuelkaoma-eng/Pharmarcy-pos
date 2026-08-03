import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { get, post } from '../api/client';

export default function Login() {
  const [role, setRole] = useState('Admin');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pharmacies, setPharmacies] = useState([]);
  const [tenantId, setTenantId] = useState('');

  const { login } = useAuth();
  const navigate = useNavigate();

  // Usernames are only unique within a pharmacy, so staff pick theirs first.
  useEffect(() => {
    let active = true;
    get('tenants/directory').then(res => {
      if (!active || !res?.data) return;
      setPharmacies(res.data);
      if (res.data.length > 0) setTenantId(res.data[0].tenant_id);
    });
    return () => { active = false; };
  }, []);

  const handleRoleSelect = (r) => {
    setRole(r);
    setUsername(r.toLowerCase());
    setPassword('');
    setError('');
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await post('auth/login', { username, password, tenantId });
      if (res?.data?.token) {
        login(res.data.user || { username, role }, res.data.token);
        navigate('/dashboard');
        return;
      } else if (res?.error) {
        setError(res.error);
        setLoading(false);
        return;
      }
    } catch (err) {
      setError('Connection failed. Please check backend server.');
      setLoading(false);
      return;
    }

    setError('Invalid login response from server.');
    setLoading(false);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: '700', color: '#3b82f6', marginBottom: '6px' }}>Pharmacy POS</h2>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Staff Portal</p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <div className="role-tabs">
          {['Admin', 'Pharmacist', 'Cashier'].map(r => (
            <button key={r} type="button" className={role === r ? 'active' : ''} onClick={() => handleRoleSelect(r)}>
              {r}
            </button>
          ))}
        </div>

        <form onSubmit={handleLoginSubmit}>
          {pharmacies.length > 0 && (
            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Pharmacy:</label>
              <select
                className="input-field"
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
              >
                {pharmacies.map(p => (
                  <option key={p.tenant_id} value={p.tenant_id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Username:</label>
            <input 
              type="text" 
              className="input-field" 
              required 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
            />
          </div>

          <div>
            <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: '4px' }}>Password:</label>
            <input 
              type="password" 
              className="input-field" 
              required 
              placeholder="Enter password..."
              value={password} 
              onChange={e => setPassword(e.target.value)} 
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '10px' }} disabled={loading}>
            {loading ? 'Authenticating...' : `Login as ${role}`}
          </button>
        </form>
      </div>
    </div>
  );
}
