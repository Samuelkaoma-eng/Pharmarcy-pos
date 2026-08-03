import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ShoppingCart, Package, Users, Activity, FileText, Settings, X } from 'lucide-react';
import { get } from '../api/client';

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClose ? onClose(!isOpen) : null;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (query.trim().length > 1) {
      get(`products?search=${encodeURIComponent(query)}`).then((res) => {
        if (res?.data) setSearchResults(res.data);
      });
    } else {
      setSearchResults([]);
    }
  }, [query]);

  if (!isOpen) return null;

  const pages = [
    { label: 'Open POS Checkout', path: '/pos', icon: ShoppingCart },
    { label: 'View Inventory Stock', path: '/inventory', icon: Package },
    { label: 'Patient Registry', path: '/patients', icon: Users },
    { label: 'Triage Queue', path: '/triage', icon: Activity },
    { label: 'Prescriptions', path: '/prescriptions', icon: FileText },
    { label: 'Settings', path: '/settings', icon: Settings }
  ];

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div 
        className="modal-content" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '600px', padding: '16px', background: 'var(--surface)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '16px' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
          <Search size={20} color="#60a5fa" />
          <input 
            type="text" 
            placeholder="Type a command, search drugs, or jump to page... (Esc to close)" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.05rem', width: '100%', outline: 'none' }}
            autoFocus
          />
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ marginTop: '16px', maxHeight: '350px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {searchResults.length > 0 && (
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Products Found:</span>
              {searchResults.map((p) => (
                <div 
                  key={p.product_id}
                  onClick={() => { navigate('/pos'); onClose(); }}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', cursor: 'pointer', marginTop: '6px' }}
                >
                  <span style={{ color: '#fff', fontWeight: '500' }}>{p.name}</span>
                  <span style={{ color: '#4ade80' }}>K {parseFloat(p.selling_price).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Quick Navigation:</span>
            {pages.map((p) => (
              <div 
                key={p.path}
                onClick={() => { navigate(p.path); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', borderRadius: '8px', cursor: 'pointer', marginTop: '4px' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(59,130,246,0.2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <p.icon size={18} color="#60a5fa" />
                <span style={{ color: 'var(--text)', fontSize: '0.95rem' }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
