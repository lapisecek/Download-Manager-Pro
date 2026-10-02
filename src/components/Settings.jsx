import React, { useState, useEffect } from 'react';
import { Save, Plus, X, FolderOpen, RotateCcw, Check } from 'lucide-react';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve({}) } 
};

const DEFAULT_SETTINGS = {
  downloadPath: '',
  urlPrefixes: [],
  maxConnections: 4,
  vtApiKey: '',
  smartCategorization: false,
  osNotifications: true,
  autoClearCompleted: false,
  speedLimit: 0,
  autoStart: false,
  maxFullSpeedDownloads: 2,
  throttledSpeedLimit: 500,
  autoVtScan: false,
  clipboardWatch: true
};

function Toggle({ checked, onChange, label, subtext }) {
  const handleClick = () => onChange(!checked);
  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <div
      className="setting-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="switch"
      aria-checked={checked}
    >
      <div className="setting-info">
        <span className="setting-name">{label}</span>
        {subtext && <span className="setting-subtext">{subtext}</span>}
      </div>
      <div className={`toggle-switch ${checked ? 'checked' : ''}`}>
        <div className="toggle-thumb" />
      </div>
    </div>
  );
}

function Settings() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [newPrefix, setNewPrefix] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ipcRenderer.invoke('get-settings').then(s => {
      if (s) setSettings(prev => ({ ...prev, ...s }));
    });
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleBrowse = async () => {
    try {
      const selected = await ipcRenderer.invoke('select-download-dir');
      if (selected) {
        handleChange('downloadPath', selected);
      }
    } catch {
      // Ignore if cancelled
    }
  };

  const handleSave = () => {
    ipcRenderer.invoke('save-settings', settings).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleResetDefaults = () => {
    if (window.confirm('Reset all settings to default values?')) {
      setSettings(prev => ({
        ...DEFAULT_SETTINGS,
        downloadPath: prev.downloadPath || ''
      }));
    }
  };

  const handleAddPrefix = () => {
    const trimmed = newPrefix.trim();
    if (trimmed && !settings.urlPrefixes.includes(trimmed)) {
      handleChange('urlPrefixes', [...settings.urlPrefixes, trimmed]);
      setNewPrefix('');
    }
  };

  const handleRemovePrefix = (prefix) => {
    handleChange('urlPrefixes', settings.urlPrefixes.filter(p => p !== prefix));
  };

  return (
    <div className="animated">
      <h1 className="page-title">Settings</h1>
      
      {/* General Storage & Automation */}
      <div className="settings-section">
        <h2 className="settings-title">Storage & Automation</h2>
        <p className="settings-desc">Manage destination paths and background behavior.</p>

        <div className="form-group">
          <label>Default Download Directory</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="text" 
              className="input-field" 
              value={settings.downloadPath} 
              onChange={(e) => handleChange('downloadPath', e.target.value)} 
              placeholder="e.g. C:\Users\Downloads"
            />
            <button type="button" className="btn-secondary" onClick={handleBrowse} title="Browse for folder">
              <FolderOpen size={16} /> Browse
            </button>
          </div>
        </div>

        <div className="settings-grid">
          <Toggle 
            checked={!!settings.autoStart} 
            onChange={(val) => handleChange('autoStart', val)} 
            label="Start with Windows" 
            subtext="Automatically launch Veloce DM minimized on system boot."
          />
          <Toggle 
            checked={!!settings.smartCategorization} 
            onChange={(val) => handleChange('smartCategorization', val)} 
            label="Smart Categorization" 
            subtext="Automatically sort files into Images, Videos, Documents, and Software."
          />
          <Toggle 
            checked={!!settings.osNotifications} 
            onChange={(val) => handleChange('osNotifications', val)} 
            label="OS Notifications" 
            subtext="Display a native desktop alert when a file finishes downloading."
          />
          <Toggle 
            checked={!!settings.autoClearCompleted} 
            onChange={(val) => handleChange('autoClearCompleted', val)} 
            label="Auto-Clear Completed" 
            subtext="Automatically remove completed downloads from active view after 5 seconds."
          />
        </div>
      </div>

      {/* Bandwidth & Priority */}
      <div className="settings-section">
        <h2 className="settings-title">Bandwidth & Priority Engine</h2>
        <p className="settings-desc">Allocate maximum bandwidth to high-priority downloads.</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Global Speed Limit (KB/s, 0 = Unlimited)
            </label>
            <input 
              type="number" 
              className="input-field" 
              value={settings.speedLimit} 
              onChange={(e) => handleChange('speedLimit', Math.max(0, parseInt(e.target.value, 10) || 0))} 
              min="0" 
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Max Full Speed Downloads
            </label>
            <input 
              type="number" 
              className="input-field" 
              value={settings.maxFullSpeedDownloads} 
              onChange={(e) => handleChange('maxFullSpeedDownloads', Math.max(1, parseInt(e.target.value, 10) || 1))} 
              min="1" 
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Throttled Speed Limit (KB/s)
            </label>
            <input 
              type="number" 
              className="input-field" 
              value={settings.throttledSpeedLimit} 
              onChange={(e) => handleChange('throttledSpeedLimit', Math.max(1, parseInt(e.target.value, 10) || 1))} 
              min="1" 
            />
          </div>
        </div>
      </div>

      {/* Security (VirusTotal) */}
      <div className="settings-section">
        <h2 className="settings-title">Security & VirusTotal</h2>
        <p className="settings-desc">Analyze files against 70+ antivirus engines using the VirusTotal API.</p>

        <div className="form-group">
          <label>API Key (Free tier supported)</label>
          <input 
            type="password" 
            className="input-field" 
            placeholder="Paste your VirusTotal API key..."
            value={settings.vtApiKey || ''} 
            onChange={(e) => handleChange('vtApiKey', e.target.value)} 
          />
        </div>

        <div style={{ marginTop: '12px' }}>
          <Toggle 
            checked={!!settings.autoVtScan} 
            onChange={(val) => handleChange('autoVtScan', val)} 
            label="Auto-Scan on Completion" 
            subtext="Automatically compute SHA-256 hash and query VirusTotal when downloads finish."
          />
        </div>
      </div>

      {/* Chrome Extension & Clipboard */}
      <div className="settings-section">
        <h2 className="settings-title">Browser Extension & Clipboard Interceptor</h2>
        <p className="settings-desc">Automatically catch matching URLs from Google Chrome or your system clipboard.</p>

        <div style={{ marginBottom: '16px' }}>
          <Toggle 
            checked={settings.clipboardWatch !== false} 
            onChange={(val) => handleChange('clipboardWatch', val)} 
            label="Clipboard Interceptor" 
            subtext="Automatically detect download URLs matching prefixes copied to your clipboard."
          />
        </div>

        <div className="form-group">
          <label>Add Monitored URL Prefix</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              className="input-field" 
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPrefix()} 
              placeholder="e.g. https://releases.ubuntu.com/ or https://speed.hetzner.de/" 
            />
            <button type="button" className="btn" onClick={handleAddPrefix}>
              <Plus size={16} /> Add
            </button>
          </div>
          
          <div className="tag-list">
            {settings.urlPrefixes && settings.urlPrefixes.length > 0 ? (
              settings.urlPrefixes.map(prefix => (
                <div className="tag" key={prefix}>
                  <span>{prefix}</span>
                  <button type="button" onClick={() => handleRemovePrefix(prefix)} title="Remove prefix">
                    <X size={14} />
                  </button>
                </div>
              ))
            ) : (
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                No active URL prefixes. Enter a website URL or toggle "Catch All Downloads" in the Chrome extension popup.
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginTop: '24px' }}>
        <button type="button" className="btn" onClick={handleSave} style={{ minWidth: '140px' }}>
          {saved ? <><Check size={18} /> Saved!</> : <><Save size={18} /> Save Settings</>}
        </button>
        <button type="button" className="btn-secondary" onClick={handleResetDefaults}>
          <RotateCcw size={16} /> Reset to Defaults
        </button>
      </div>
    </div>
  );
}

export default Settings;
