import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { post } from '../../api/client';

export default function CHLogin() {
  const [username, setUsername] = useState('superadmin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await post('controlhub/login', { username, password });
      if (res?.data?.token) {
        login(res.data.user || { username: 'superadmin', role: 'SuperAdmin' }, res.data.token);
        navigate('/controlhub/dashboard');
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

    setError('Invalid credentials');
    setLoading(false);
  };

  return (
    <div className="login-container ch-login">
      <div className="login-card">
        <h2 style={{ color: '#8b5cf6', marginBottom: '8px' }}>Pharmacy ControlHub</h2>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '20px', textAlign: 'center' }}>Super-Admin Platform Portal</p>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #ef4444', color: '#f87171', padding: '10px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
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

          <button type="submit" className="btn btn-primary" style={{ background: '#8b5cf6', width: '100%', marginTop: '10px', padding: '12px' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Login to ControlHub'}
          </button>
        </form>
      </div>
    </div>
  );
}
