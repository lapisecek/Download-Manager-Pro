import React, { useEffect, useState } from 'react';
import DownloadItem from './DownloadItem';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve([]), on: () => {}, removeListener: () => {} } 
};

function HistoryList() {
  const [downloads, setDownloads] = useState([]);

  useEffect(() => {
    ipcRenderer.invoke('get-downloads').then(setDownloads);
    const handleUpdate = (event, updatedDownloads) => setDownloads(updatedDownloads);
    ipcRenderer.on('downloads-updated', handleUpdate);
    return () => ipcRenderer.removeListener('downloads-updated', handleUpdate);
  }, []);

  const finishedDownloads = downloads.filter(d => d.status === 'completed');
  const errorDownloads = downloads.filter(d => d.status === 'error');

  return (
    <div className="animated">
      <h1 className="page-title">Download History</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>All finished and errored downloads, including those cleared from the dashboard.</p>
      
      {finishedDownloads.length === 0 && errorDownloads.length === 0 && (
        <div style={{ color: 'var(--text-muted)' }}>No history available.</div>
      )}

      {finishedDownloads.length > 0 && (
        <div className="downloads-container" style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--success)' }}>Finished</h2>
          {finishedDownloads.map(dl => (
            <DownloadItem key={dl.id} download={dl} isHistoryView={true} />
          ))}
        </div>
      )}

      {errorDownloads.length > 0 && (
        <div className="downloads-container">
          <h2 style={{ fontSize: '18px', marginBottom: '16px', color: 'var(--danger)' }}>Errored</h2>
          {errorDownloads.map(dl => (
            <DownloadItem key={dl.id} download={dl} isHistoryView={true} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HistoryList;
