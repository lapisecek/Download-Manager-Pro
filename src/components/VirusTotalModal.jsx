import React from 'react';
import { createPortal } from 'react-dom';
import { Shield, X, CheckCircle, AlertTriangle, Scan } from 'lucide-react';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve() } 
};

function VirusTotalModal({ vtStats, vtStatus, downloadId, onClose }) {
  const handleScan = () => {
    ipcRenderer.invoke('scan-file', downloadId);
  };

  const total = vtStats ? vtStats.harmless + vtStats.malicious + vtStats.suspicious + vtStats.undetected : 0;
  const isMalicious = vtStats ? vtStats.malicious > 0 : false;

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Shield size={24} color={isMalicious ? 'var(--danger)' : 'var(--success)'} />
            <h2 style={{ margin: 0 }}>VirusTotal Report</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={20}/></button>
        </div>
        
        <div className="modal-body">
          {vtStatus === 'none' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Shield size={48} color="var(--text-muted)" style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>This file has not been scanned yet.</p>
              <button className="btn" onClick={handleScan} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <Scan size={18} /> Scan File Now
              </button>
            </div>
          )}

          {vtStatus === 'scanning' && (
            <div style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="dot connected" style={{ width: '16px', height: '16px', margin: '0 auto 16px auto', animation: 'pulse 1.5s infinite' }}></div>
              <p style={{ color: 'var(--accent)' }}>Uploading and analyzing file...</p>
            </div>
          )}

          {vtStats && vtStatus !== 'none' && vtStatus !== 'scanning' && (
            <>
              <div className="vt-summary">
                <div className="vt-score">
                  <span style={{ fontSize: '32px', fontWeight: '700', color: isMalicious ? 'var(--danger)' : 'var(--success)' }}>
                    {vtStats.malicious}
                  </span>
                  <span style={{ fontSize: '18px', color: 'var(--text-muted)' }}>/ {total}</span>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Security vendors flagged this file as malicious</div>
              </div>

              <div className="vt-stats-grid">
                <div className="vt-stat-box">
                  <CheckCircle size={16} color="var(--success)" />
                  <span>Harmless: {vtStats.harmless}</span>
                </div>
                <div className="vt-stat-box">
                  <AlertTriangle size={16} color="var(--danger)" />
                  <span>Malicious: {vtStats.malicious}</span>
                </div>
                <div className="vt-stat-box">
                  <AlertTriangle size={16} color="var(--warning)" />
                  <span>Suspicious: {vtStats.suspicious}</span>
                </div>
                <div className="vt-stat-box">
                  <Shield size={16} color="var(--text-muted)" />
                  <span>Undetected: {vtStats.undetected}</span>
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
