import React, { useState, useEffect } from 'react';
import { Save, Plus, X } from 'lucide-react';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve({}) } 
};

function Settings() {
  const [settings, setSettings] = useState({
    downloadPath: '',
    urlPrefixes: [],
    maxConnections: 4,
    vtApiKey: '',
    smartCategorization: false,
    autoClearCompleted: false,
    speedLimit: 0,
    autoStart: false,
    maxFullSpeedDownloads: 2,
    throttledSpeedLimit: 500,
    autoVtScan: false
  });
  const [newPrefix, setNewPrefix] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    ipcRenderer.invoke('get-settings').then(s => setSettings(s));
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    ipcRenderer.invoke('save-settings', settings).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const handleAddPrefix = () => {
    if (newPrefix.trim() && !settings.urlPrefixes.includes(newPrefix.trim())) {
      handleChange('urlPrefixes', [...settings.urlPrefixes, newPrefix.trim()]);
      setNewPrefix('');
    }
  };

  const handleRemovePrefix = (prefix) => {
    handleChange('urlPrefixes', settings.urlPrefixes.filter(p => p !== prefix));
  };

  return (
    <div className="animated">
      <h1 className="page-title">Settings</h1>
      
      <div className="settings-section">
        <h2 className="settings-title">General Automation</h2>
        
        <div className="form-group">
          <label>Default Download Directory</label>
          <input type="text" className="input-field" 
            value={settings.downloadPath} onChange={(e) => handleChange('downloadPath', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.autoStart} onChange={e => handleChange('autoStart', e.target.checked)} />
            Start with Windows (Auto-Start)
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.smartCategorization} onChange={e => handleChange('smartCategorization', e.target.checked)} />
            Smart Categorization (Folders by type)
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.osNotifications} onChange={e => handleChange('osNotifications', e.target.checked)} />
            OS Notifications on Complete
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.autoClearCompleted} onChange={e => handleChange('autoClearCompleted', e.target.checked)} />
            Auto-Clear Completed (after 5s)
          </label>
        </div>

        <div className="form-group" style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <div>
            <label>Global Speed Limit (KB/s, 0=None)</label>
            <input type="number" className="input-field" 
              value={settings.speedLimit} onChange={(e) => handleChange('speedLimit', parseInt(e.target.value) || 0)} min="0" />
          </div>
          <div>
            <label>Max Full Speed Downloads</label>
            <input type="number" className="input-field" 
              value={settings.maxFullSpeedDownloads} onChange={(e) => handleChange('maxFullSpeedDownloads', parseInt(e.target.value) || 2)} min="1" />
          </div>
          <div>
            <label>Throttled Speed Limit (KB/s)</label>
            <input type="number" className="input-field" 
              value={settings.throttledSpeedLimit} onChange={(e) => handleChange('throttledSpeedLimit', parseInt(e.target.value) || 500)} min="1" />
          </div>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-title">Security (VirusTotal)</h2>
        <p className="settings-desc">Automatically hash and scan completed files in the background.</p>
        <div className="form-group">
          <label>API Key (Free)</label>
          <input type="password" className="input-field" placeholder="Enter VT API Key..."
            value={settings.vtApiKey} onChange={(e) => handleChange('vtApiKey', e.target.value)} />
        </div>
        <div style={{ marginTop: '16px' }}>
          <label className="checkbox-label">
            <input type="checkbox" checked={settings.autoVtScan} onChange={e => handleChange('autoVtScan', e.target.checked)} />
            Auto-Scan finished downloads immediately
          </label>
        </div>
      </div>

      <div className="settings-section">
        <h2 className="settings-title">Chrome Extension & Clipboard</h2>
        <p className="settings-desc">Auto-catches matching URLs from Chrome or your Clipboard.</p>

        <div className="form-group">
          <label>Add URL Prefix</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input type="text" className="input-field" value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddPrefix()} placeholder="e.g., https://example.com/downloads/" />
            <button className="btn" onClick={handleAddPrefix}><Plus size={16}/></button>
          </div>
          
          <div className="tag-list">
            {settings.urlPrefixes && settings.urlPrefixes.map(prefix => (
              <div className="tag" key={prefix}>
                {prefix}
                <button onClick={() => handleRemovePrefix(prefix)}><X size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <button className="btn" onClick={handleSave}>
        <Save size={18} /> {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

export default Settings;
