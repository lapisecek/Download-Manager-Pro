import React, { useState } from 'react';
import DownloadList from './components/DownloadList';
import HistoryList from './components/HistoryList';
import Settings from './components/Settings';
import ServerConsole from './components/ServerConsole';
import TitleBar from './components/TitleBar';
import { DownloadCloud, Settings as SettingsIcon, LayoutDashboard, Server, History } from 'lucide-react';
import './index.css';

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}

function App() {
  const [activeTab, setActiveTab] = useState('downloads');
  const [downloads, setDownloads] = useState([]);

  React.useEffect(() => {
    const { ipcRenderer } = window.require ? window.require('electron') : { 
      ipcRenderer: { invoke: () => Promise.resolve([]), on: () => {}, removeListener: () => {} } 
    };
    ipcRenderer.invoke('get-downloads').then(setDownloads);
    const handleUpdate = (event, updatedDownloads) => setDownloads(updatedDownloads);
    ipcRenderer.on('downloads-updated', handleUpdate);
    return () => ipcRenderer.removeListener('downloads-updated', handleUpdate);
  }, []);

  const activeDownloads = downloads.filter(d => !['completed', 'error'].includes(d.status));
  let totalRemainingBytes = 0;
  let totalSpeed = 0;
  let globalDownloaded = 0;
  let globalTotal = 0;

  activeDownloads.forEach(d => {
    if (d.totalBytes > 0) {
      globalDownloaded += d.downloadedBytes;
      globalTotal += d.totalBytes;
      if (d.downloadedBytes < d.totalBytes) {
        totalRemainingBytes += (d.totalBytes - d.downloadedBytes);
        totalSpeed += d.speed || 0;
      }
    }
  });

  const globalEtaSeconds = totalSpeed > 0 ? Math.round(totalRemainingBytes / totalSpeed) : 0;
  const globalProgress = globalTotal > 0 ? Math.round((globalDownloaded / globalTotal) * 100) : 0;

  return (
    <>
      <TitleBar />
      <div className="app-container">
      <div className="sidebar">
        <div 
          className={`nav-item ${activeTab === 'downloads' ? 'active' : ''}`}
          onClick={() => setActiveTab('downloads')}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'server' ? 'active' : ''}`}
          onClick={() => setActiveTab('server')}
        >
          <Server size={18} />
          <span>Server</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={18} />
          <span>History</span>
        </div>
        <div 
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <SettingsIcon size={18} />
          <span>Settings</span>
        </div>
        <div style={{ flex: 1 }}></div>
        {activeDownloads.length > 0 && (
          <div className="global-stats-widget">
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Global ETA</span>
              <span>{globalProgress}%</span>
            </div>
            <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--accent)', marginTop: '4px' }}>
              {formatTime(globalEtaSeconds)}
            </div>
            <div className="progress-bg" style={{ marginTop: '8px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div className="progress-bar" style={{ width: `${globalProgress}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s' }}></div>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              {activeDownloads.length} active downloads
            </div>
          </div>
        )}
      </div>

      <div className="main-content">
        {activeTab === 'downloads' && <DownloadList />}
        {activeTab === 'history' && <HistoryList />}
        {activeTab === 'server' && <ServerConsole />}
        {activeTab === 'settings' && <Settings />}
      </div>
    </div>
    </>
  );
}

export default App;
