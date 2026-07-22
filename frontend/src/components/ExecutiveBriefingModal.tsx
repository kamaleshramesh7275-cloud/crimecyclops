import React from 'react';

type ExecutiveBriefingModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const ExecutiveBriefingModal: React.FC<ExecutiveBriefingModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '90%', height: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header" style={{ paddingBottom: 12, borderBottom: '1px solid rgba(148,163,184,0.15)' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.05em', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 600 }}>
              Karnataka State Police Intelligence Command
            </div>
            <h3 style={{ margin: '2px 0 0 0', color: '#f8fafc', fontSize: 18 }}>Executive Briefing Sheet</h3>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="action-button"
              onClick={() => {
                const win = window.open('/api/reports/executive-briefing', '_blank');
                win?.focus();
              }}
            >
              🖨️ Open Printable Tab
            </button>
            <button className="close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, marginTop: 12, borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
          <iframe
            src="/api/reports/executive-briefing"
            title="Executive Briefing Preview"
            style={{ width: '100%', height: '100%', border: 'none' }}
          />
        </div>
      </div>
    </div>
  );
};
