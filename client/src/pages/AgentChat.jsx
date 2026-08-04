import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Package, AlertTriangle, Clock, ShoppingCart } from 'lucide-react';
import { post } from '../api/client';

export default function AgentChat() {
  const [messages, setMessages] = useState([
    { sender: 'bot', text: 'Hi — I can help with stock checks, expiry reviews, patient lookup, prescription status, queue status, or sale preparation. Ask me anything.' }
  ]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (textToSend) => {
    const query = textToSend || prompt;
    if (!query || loading) return;

    setMessages(prev => [...prev, { sender: 'user', text: query }]);
    if (!textToSend) setPrompt('');
    setLoading(true);

    try {
      const res = await post('agent/query', { prompt: query });
      if (res?.data) {
        const confirmation = res.data.requires_confirmation ? ' Confirmation required before execution.' : '';
        const action = res.data.proposed_action ? ` Suggested action: ${res.data.proposed_action}.` : '';
        setMessages(prev => [...prev, { sender: 'bot', text: `${res.data.response}${action}${confirmation}` }]);
        setLoading(false);
        return;
      }
    } catch (e) {
      // Falls through to the message below.
    }

    setMessages(prev => [...prev, { sender: 'bot', text: `I could not reach the pharmacy service for "${query}". Try again once the backend connection is available.` }]);
    setLoading(false);
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Bot size={28} color="var(--tenant-primary)" />
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text)' }}>Pharmacy Workflow Assistant</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>Natural-language support with confirmation gates for stock and sales actions</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => handleSend('Check live stock levels')}>
          <Package size={14} /> Stock Levels
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => handleSend('Check drug expiry alerts')}>
          <AlertTriangle size={14} /> Expiry Warnings
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => handleSend('Show triage queue status')}>
          <Clock size={14} /> Queue Status
        </button>
        <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }} onClick={() => handleSend("Summary of today's sales")}>
          <ShoppingCart size={14} /> Today's Sales
        </button>
      </div>

      <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{
            alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
            background: m.sender === 'user' ? 'var(--tenant-primary)' : 'var(--surface-3)',
            color: '#fff',
            padding: '12px 16px',
            borderRadius: '14px',
            maxWidth: '75%',
            fontSize: '0.95rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}>
            {m.text}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            background: 'var(--surface-3)',
            color: 'var(--text-2)',
            padding: '12px 16px',
            borderRadius: '14px',
            fontSize: '0.95rem'
          }}>
            Thinking...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          className="input-field"
          placeholder="Type a question or command..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }} disabled={loading}>
          <Send size={18} /> Send
        </button>
      </form>
    </div>
  );
}
