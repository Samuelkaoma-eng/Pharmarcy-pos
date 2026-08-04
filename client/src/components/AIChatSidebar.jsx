import React, { useState, useRef, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { post } from '../api/client';

export default function AIChatSidebar({ isOpen, onClose }) {
  const [messages, setMessages] = useState([{ sender: 'bot', text: 'Ask about stock, expiry, prescriptions, queue status, or anything pharmacy-related.' }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const query = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text: query }]);
    setInput('');
    setLoading(true);

    try {
      const res = await post('agent/query', { prompt: query });
      if (res?.data) {
        setMessages(prev => [...prev, { sender: 'bot', text: res.data.response }]);
        setLoading(false);
        return;
      }
    } catch (e) {
      // Falls through to the message below.
    }

    setMessages(prev => [...prev, { sender: 'bot', text: 'Could not reach the assistant. Try again shortly.' }]);
    setLoading(false);
  };

  return (
    <div className={`ai-chat-sidebar ${isOpen ? 'open' : ''}`}>
      <div className="chat-header">
        <h3>Workflow Assistant</h3>
        <button onClick={onClose} className="close-btn"><X size={20}/></button>
      </div>
      <div className="chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble ${m.sender}`}>
            {m.text}
          </div>
        ))}
        {loading && <div className="chat-bubble bot">Thinking...</div>}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input-area">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyPress={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask something..."
          className="input-field"
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={handleSend} disabled={loading}><Send size={16}/></button>
      </div>
    </div>
  );
}
