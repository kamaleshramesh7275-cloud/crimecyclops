import React, { useState, useEffect, useRef } from 'react';

interface SourceCitation {
  source: string;
  dataset: string;
  similarity_score: number;
  details: string;
  fir_id?: number;
  district?: string;
  station?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  sources?: SourceCitation[];
  confidence?: number;
  avatarState?: string;
}

type AvatarMood = '😊' | '🤔' | '⏳' | '💬' | '🎉' | '⚠️' | '❌';

const SUGGESTED_QUESTIONS = [
  "Cyber fraud incidents in Bengaluru?",
  "Drug trafficking & seizures data",
  "Top crime hotspots & open cases",
  "Court outcomes & conviction rates",
  "Police station officer workload",
];

export const AIChatbot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchStep, setSearchStep] = useState<string | null>(null);
  const [avatarMood, setAvatarMood] = useState<AvatarMood>('😊');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showSourcesForMsg, setShowSourcesForMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize with greeting message
  useEffect(() => {
    setMessages([
      {
        id: 'msg_welcome',
        sender: 'assistant',
        text: '👋 **Welcome to CrimeCyclops AI Assistant!**\n\nI am your Karnataka State Police intelligence companion. Ask me anything about FIR records, criminal networks, station workloads, district safety metrics, or court outcomes.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        avatarState: '😊',
      },
    ]);
  }, []);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, searchStep, isOpen, isMinimized]);

  // Reset unread count when opening
  const handleToggleOpen = () => {
    if (!isOpen) {
      setIsOpen(true);
      setIsMinimized(false);
      setUnreadCount(0);
    } else {
      setIsOpen(false);
    }
  };

  const handleClearChat = async () => {
    try {
      await fetch('/api/chat/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: 'default' }),
      });
      setMessages([
        {
          id: `msg_${Date.now()}`,
          sender: 'assistant',
          text: '🧹 *Chat history cleared.* Ask me any question from the Karnataka Crime dataset!',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          avatarState: '😊',
        },
      ]);
      setAvatarMood('😊');
    } catch {
      // ignore
    }
  };

  const sendMessage = async (queryText: string) => {
    const query = queryText.trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setAvatarMood('🤔');

    // Step 1: Searching knowledge base
    setSearchStep('🔍 Searching the Karnataka Crime dataset...');
    await new Promise((r) => setTimeout(r, 600));

    // Step 2: Reading relevant documents
    setAvatarMood('⏳');
    setSearchStep('📖 Reading relevant FIR records & police station data...');
    await new Promise((r) => setTimeout(r, 700));

    // Step 3: Generating response
    setAvatarMood('💬');
    setSearchStep('🧠 Synthesizing intelligence response...');

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query, session_id: 'default' }),
      });

      const data = await resp.json().catch(() => null);

      if (!resp.ok || !data) {
        throw new Error(data?.detail || 'Failed to reach RAG backend service.');
      }

      let mood: AvatarMood = '🎉';
      if (data.avatar_state === 'no_answer') mood = '⚠️';

      const assistantMsg: ChatMessage = {
        id: `ast_${Date.now()}`,
        sender: 'assistant',
        text: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        sources: data.sources,
        confidence: data.confidence,
        avatarState: mood,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setAvatarMood(mood);

      if (!isOpen) {
        setUnreadCount((prev) => prev + 1);
      }
    } catch (err: any) {
      setAvatarMood('❌');
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Service Error**: ${err.message || 'Unable to fetch answer. Please check backend connection.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          avatarState: '❌',
        },
      ]);
    } finally {
      setLoading(false);
      setSearchStep(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Simple Markdown Parser Helper
  const renderMarkdown = (content: string) => {
    const lines = content.split('\n');
    return (
      <div className="markdown-content">
        {lines.map((line, idx) => {
          let trimmed = line.trim();
          if (!trimmed) return <div key={idx} className="md-spacer" />;

          // Headings
          if (trimmed.startsWith('### ')) {
            return <h4 key={idx} className="md-h4">{trimmed.replace('### ', '')}</h4>;
          }
          if (trimmed.startsWith('## ')) {
            return <h3 key={idx} className="md-h3">{trimmed.replace('## ', '')}</h3>;
          }
          if (trimmed.startsWith('# ')) {
            return <h2 key={idx} className="md-h2">{trimmed.replace('# ', '')}</h2>;
          }

          // Blockquote
          if (trimmed.startsWith('> ')) {
            return <blockquote key={idx} className="md-blockquote">{trimmed.replace('> ', '')}</blockquote>;
          }

          // Bullet List
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            const listText = trimmed.substring(2);
            return (
              <li key={idx} className="md-li">
                {parseInlineFormatting(listText)}
              </li>
            );
          }

          // Divider
          if (trimmed === '---') {
            return <hr key={idx} className="md-hr" />;
          }

          return <p key={idx} className="md-p">{parseInlineFormatting(line)}</p>;
        })}
      </div>
    );
  };

  const parseInlineFormatting = (text: string) => {
    // Bold parsing
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  return (
    <>
      {/* Floating Trigger Button */}
      {!isOpen && (
        <button
          className="chatbot-fab"
          onClick={handleToggleOpen}
          title="Open CrimeCyclops AI Assistant"
        >
          <span className="fab-avatar">{avatarMood}</span>
          <span className="fab-pulse" />
          {unreadCount > 0 && <span className="fab-badge">{unreadCount}</span>}
        </button>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div
          className={`chatbot-container ${isMinimized ? 'minimized' : ''} ${
            isFullscreen ? 'fullscreen' : ''
          }`}
        >
          {/* Header */}
          <div className="chatbot-header">
            <div className="header-left">
              <span className="avatar-badge">{avatarMood}</span>
              <div className="header-info">
                <span className="header-title">CrimeCyclops AI</span>
                <span className="header-status">
                  <span className="status-dot" /> Online • KSP RAG Engine
                </span>
              </div>
            </div>

            <div className="header-actions">
              <button
                className="hdr-btn"
                onClick={() => setIsMinimized(!isMinimized)}
                title={isMinimized ? 'Expand' : 'Minimize'}
              >
                {isMinimized ? '🗖' : '🗕'}
              </button>
              {!isMinimized && (
                <button
                  className="hdr-btn"
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  title={isFullscreen ? 'Restore' : 'Fullscreen'}
                >
                  {isFullscreen ? '❐' : '⛶'}
                </button>
              )}
              {!isMinimized && (
                <button className="hdr-btn" onClick={handleClearChat} title="Clear Chat History">
                  🗑️
                </button>
              )}
              <button className="hdr-btn close-btn" onClick={handleToggleOpen} title="Close">
                ✕
              </button>
            </div>
          </div>

          {/* Body */}
          {!isMinimized && (
            <>
              <div className="chatbot-messages">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`message-row ${msg.sender === 'user' ? 'user-row' : 'assistant-row'}`}
                  >
                    {msg.sender === 'assistant' && (
                      <div className="msg-avatar">{msg.avatarState || '😊'}</div>
                    )}

                    <div className={`message-bubble ${msg.sender}-bubble`}>
                      {renderMarkdown(msg.text)}

                      <div className="msg-meta">
                        <span className="msg-time">{msg.timestamp}</span>
                        {msg.confidence !== undefined && (
                          <span className="msg-confidence" title="Retrieval Confidence Score">
                            🎯 Match: {Math.round(msg.confidence * 100)}%
                          </span>
                        )}
                      </div>

                      {/* Source Citations Accordion */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="sources-container">
                          <button
                            className="sources-toggle"
                            onClick={() =>
                              setShowSourcesForMsg(showSourcesForMsg === msg.id ? null : msg.id)
                            }
                          >
                            📚 {msg.sources.length} Grounded Sources{' '}
                            {showSourcesForMsg === msg.id ? '▲' : '▼'}
                          </button>

                          {showSourcesForMsg === msg.id && (
                            <div className="sources-list">
                              {msg.sources.map((src, i) => (
                                <div key={i} className="source-card">
                                  <div className="source-header">
                                    <span className="source-name">📌 {src.source}</span>
                                    <span className="source-score">
                                      Score: {(src.similarity_score * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                  <p className="source-details">{src.details}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Search / Multi-step Progress Animation */}
                {loading && (
                  <div className="message-row assistant-row">
                    <div className="msg-avatar pulse-avatar">{avatarMood}</div>
                    <div className="message-bubble assistant-bubble loading-bubble">
                      <div className="typing-steps">
                        <span className="spinner-dot" />
                        <span className="step-text">{searchStep}</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Suggested Questions */}
              {messages.length < 5 && !loading && (
                <div className="suggested-chips">
                  <span className="chips-label">💡 Suggested Queries:</span>
                  <div className="chips-scroll">
                    {SUGGESTED_QUESTIONS.map((q, idx) => (
                      <button key={idx} className="chip-btn" onClick={() => sendMessage(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Form */}
              <form className="chatbot-input-area" onSubmit={handleFormSubmit}>
                <input
                  type="text"
                  className="chat-input"
                  placeholder="Ask CrimeCyclops AI about FIRs, stations, or crime metrics..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="chat-send-btn"
                  disabled={loading || !input.trim()}
                  title="Send Message"
                >
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
};
