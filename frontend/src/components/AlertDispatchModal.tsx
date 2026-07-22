import React, { useState } from 'react';

const AUTH_KEY = 'crimecyclops-session';
function getToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw)?.token : null;
  } catch { return null; }
}

type AlertItem = {
  id: string;
  type: string;
  district: string;
  severity: string;
  crime_category?: string;
  message: string;
  recommended_action?: string;
};

type AlertDispatchModalProps = {
  alert: AlertItem | null;
  onClose: () => void;
  onDispatchSuccess: (entry: any) => void;
};

export const AlertDispatchModal: React.FC<AlertDispatchModalProps> = ({ alert, onClose, onDispatchSuccess }) => {
  if (!alert) return null;

  const [channel, setChannel] = useState<'sms' | 'email'>('sms');
  const [recipient, setRecipient] = useState('+91 94808 01100');
  const [customNote, setCustomNote] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; success: boolean } | null>(null);

  const defaultMsg = `[CrimeCyclops ${alert.severity.toUpperCase()} ALERT] ${alert.district} - ${alert.message}`;

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatusMsg(null);

    const dispatchText = customNote ? `${defaultMsg}\nOfficer Note: ${customNote}` : defaultMsg;

    try {
      const res = await fetch('/api/alerts/dispatch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { 'Authorization': `Bearer ${getToken()}` } : {}),
        },
        body: JSON.stringify({
          alert_id: alert.id,
          channel,
          recipient,
          message: dispatchText
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Dispatch failed');

      setStatusMsg({ text: `Alert dispatched successfully via ${channel.toUpperCase()} to ${recipient}!`, success: true });
      if (data.entry) {
        onDispatchSuccess(data.entry);
      }

      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Failed to dispatch alert.', success: false });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.05em', color: '#c084fc', textTransform: 'uppercase', fontWeight: 600 }}>
              Field Dispatch Handoff
            </div>
            <h3 style={{ margin: '4px 0 0 0', color: '#f8fafc', fontSize: 18 }}>{alert.id}: {alert.district}</h3>
          </div>
          <button className="close-btn" onClick={onClose}>x</button>
        </div>

        <div className="modal-body" style={{ marginTop: 16 }}>
          <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: 12, borderRadius: 8, border: '1px solid rgba(148,163,184,0.15)', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 12 }}>
              <span className={`severity-badge severity-${alert.severity}`}>{alert.severity.toUpperCase()}</span>
              <span style={{ color: '#94a3b8' }}>• {alert.crime_category || alert.type}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: '#e2e8f0', lineHeight: 1.4 }}>{alert.message}</p>
            {alert.recommended_action && (
              <div style={{ marginTop: 8, fontSize: 12, color: '#38bdf8' }}>
                <strong>Action:</strong> {alert.recommended_action}
              </div>
            )}
          </div>

          <form onSubmit={handleDispatch}>
            <div className="form-field" style={{ marginBottom: 12 }}>
              <label>Dispatch Channel</label>
              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <button
                  type="button"
                  className={`chip-button ${channel === 'sms' ? 'active' : ''}`}
                  onClick={() => { setChannel('sms'); setRecipient('+91 94808 01100'); }}
                >
                  SMS Dispatch
                </button>
                <button
                  type="button"
                  className={`chip-button ${channel === 'email' ? 'active' : ''}`}
                  onClick={() => { setChannel('email'); setRecipient('sp-command@ksp.gov.in'); }}
                >
                  Official Email
                </button>
              </div>
            </div>

            <div className="form-field" style={{ marginBottom: 12 }}>
              <label>Target Contact / Official Endpoint</label>
              <input
                type="text"
                value={recipient}
                onChange={e => setRecipient(e.target.value)}
                placeholder={channel === 'sms' ? '+91 Mobile Number' : 'officer@ksp.gov.in'}
                required
              />
            </div>

            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>Additional Command Instructions (Optional)</label>
              <textarea
                rows={2}
                value={customNote}
                onChange={e => setCustomNote(e.target.value)}
                placeholder="e.g. Initiate mobile checkpost within 15 minutes and report status to SP HQ."
                style={{ width: '100%', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.25)', color: '#fff', borderRadius: 8, padding: 8, fontSize: 12 }}
              />
            </div>

            {statusMsg && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13,
                background: statusMsg.success ? 'rgba(52, 211, 153, 0.15)' : 'rgba(251, 113, 133, 0.15)',
                color: statusMsg.success ? '#34d399' : '#fb7185',
                border: `1px solid ${statusMsg.success ? 'rgba(52, 211, 153, 0.3)' : 'rgba(251, 113, 133, 0.3)'}`
              }}>
                {statusMsg.text}
              </div>
            )}

            <div style={{ display: 'flex', justifySelf: 'flex-end', gap: 10 }}>
              <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
              <button type="submit" className="primary-button" disabled={sending}>
                {sending ? 'Dispatching...' : `Send ${channel.toUpperCase()} Alert`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
