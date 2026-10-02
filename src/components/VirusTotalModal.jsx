import React from 'react';
import { createPortal } from 'react-dom';
import { Shield, X, CheckCircle, AlertTriangle, Scan, HelpCircle } from 'lucide-react';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve() } 
};

function VirusTotalModal({ vtStats, vtStatus, downloadId, onClose }) {
  const handleScan = () => {
    ipcRenderer.invoke('scan-file', downloadId);
  };

  const total = vtStats ? (vtStats.harmless || 0) + (vtStats.malicious || 0) + (vtStats.suspicious || 0) + (vtStats.undetected || 0) : 0;
  const isMalicious = vtStats ? (vtStats.malicious || 0) > 0 : false;

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={24} color={isMalicious ? 'var(--danger)' : vtStatus === 'clean' ? 'var(--success)' : 'var(--accent)'} />
            <h2 style={{ margin: 0, fontSize: '18px' }}>VirusTotal Analysis</h2>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={20}/></button>
        </div>
        
        <div className="modal-body">
          {vtStatus === 'none' && (
            <div style={{ textAlign: 'center', padding: '32px 16px' }}>
              <Shield size={48} color="var(--text-muted)" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p style={{ color: 'var(--text-muted)', marginBottom: '20px', fontSize: '14px' }}>
                This file has not been analyzed yet.
              </p>
              <button className="btn" onClick={handleScan} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Scan size={18} /> Scan File Now
              </button>
            </div>
          )}

          {vtStatus === 'scanning' && (
            <div style={{ textAlign: 'center', padding: '36px 16px' }}>
              <div className="dot connected" style={{ width: '16px', height: '16px', margin: '0 auto 16px auto', animation: 'pulse 1.5s infinite' }}></div>
              <p style={{ color: 'var(--accent)', fontSize: '14px', fontWeight: '500' }}>Computing hash and querying VirusTotal API...</p>
            </div>
          )}

          {vtStatus === 'unknown' && (
            <div style={{ textAlign: 'center', padding: '28px 16px' }}>
              <HelpCircle size={44} color="var(--warning)" style={{ marginBottom: '14px' }} />
              <h3 style={{ fontSize: '16px', marginBottom: '8px', color: 'var(--text-main)' }}>No Prior VirusTotal Record</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: '1.5', marginBottom: '20px' }}>
                The SHA-256 hash of this file was not found in VirusTotal database, or an API key has not been configured in Settings.
              </p>
              <button className="btn" onClick={handleScan} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Scan size={16} /> Re-scan
              </button>
            </div>
          )}

          {vtStats && vtStatus !== 'none' && vtStatus !== 'scanning' && vtStatus !== 'unknown' && (
            <>
              <div className="vt-summary">
                <div className="vt-score">
                  <span style={{ fontSize: '36px', fontWeight: '700', color: isMalicious ? 'var(--danger)' : 'var(--success)' }}>
                    {vtStats.malicious || 0}
                  </span>
                  <span style={{ fontSize: '18px', color: 'var(--text-muted)' }}> / {total}</span>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {isMalicious ? 'Security vendors flagged this file as malicious' : 'All reporting security vendors marked this file clean'}
                </div>
              </div>

              <div className="vt-stats-grid">
                <div className="vt-stat-box">
                  <CheckCircle size={16} color="var(--success)" />
                  <span>Harmless: {vtStats.harmless || 0}</span>
                </div>
                <div className="vt-stat-box">
                  <AlertTriangle size={16} color="var(--danger)" />
                  <span>Malicious: {vtStats.malicious || 0}</span>
                </div>
                <div className="vt-stat-box">
                  <AlertTriangle size={16} color="var(--warning)" />
                  <span>Suspicious: {vtStats.suspicious || 0}</span>
                </div>
                <div className="vt-stat-box">
                  <Shield size={16} color="var(--text-muted)" />
                  <span>Undetected: {vtStats.undetected || 0}</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default VirusTotalModal;
