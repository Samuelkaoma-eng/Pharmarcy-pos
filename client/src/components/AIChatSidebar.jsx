import React, { useState } from 'react';
import { X, Send } from 'lucide-react';

export default function AIChatSidebar({ isOpen, onClose }) {
  const [messages, setMessages] = useState([{ sender: 'bot', text: 'Ask about stock, expiry, prescriptions, queue status, or checkout preparation.' }]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages([...messages, { sender: 'user', text: input }]);
    setTimeout(() => {
      setMessages(prev => [...prev, { sender: 'bot', text: 'Open the full assistant workspace to review the suggested workflow action before execution.' }]);
    }, 500);
    setInput('');
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
      </div>
      <div className="chat-input-area">
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSend()} placeholder="Ask something..." className="input-field" />
        <button className="btn btn-primary" onClick={handleSend}><Send size={16}/></button>
      </div>
    </div>
  );
}
