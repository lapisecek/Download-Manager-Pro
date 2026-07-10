import React, { useState } from 'react';
import { Play, Pause, X, FolderSearch, Shield, GripVertical, Trash2, Copy } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import VirusTotalModal from './VirusTotalModal';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve() } 
};

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatTime(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s remaining`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s remaining`;
}

function DownloadItem({ download, isHistoryView }) {
  const [showVt, setShowVt] = useState(false);
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: download.id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 999 : 1,
    position: 'relative',
    filter: isHistoryView ? 'grayscale(1) brightness(0.8)' : 'none'
  };

  const handlePause = () => ipcRenderer.invoke('pause-download', download.id);
  const handleResume = () => ipcRenderer.invoke('resume-download', download.id);
  const handleCancel = () => ipcRenderer.invoke('cancel-download', download.id);
  const handleOpenFolder = () => ipcRenderer.invoke('open-folder', download.filePath);
  const handleClear = () => ipcRenderer.invoke('clear-download', download.id);
  const handleDeleteFile = () => ipcRenderer.invoke('delete-file', download.id);
  const handleCopyError = () => {
    navigator.clipboard.writeText(download.errorMsg || 'Unknown Error');
  };

  let statusText = download.status;
  if (download.status === 'downloading') {
    statusText = `${formatBytes(download.speed)}/s - ${formatBytes(download.downloadedBytes)} / ${formatBytes(download.totalBytes)} | ${formatTime(download.etaSeconds)}`;
  } else if (download.status === 'retrying') {
    statusText = `Retrying (${download.retries}/3)...`;
  }

  const getVtColor = () => {
    if (download.vtStatus === 'clean') return 'var(--success)';
    if (download.vtStatus === 'malicious') return 'var(--danger)';
    if (download.vtStatus === 'scanning') return 'var(--accent)';
    return 'var(--text-muted)';
  };

  return (
    <>
      <div className="download-card" ref={setNodeRef} style={style}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center' }}>
          {(!isHistoryView && (download.status === 'downloading' || download.status === 'retrying' || download.status === 'paused' || download.status === 'starting')) && (
            <div {...attributes} {...listeners} style={{ cursor: 'grab', marginRight: '12px', color: 'var(--text-muted)' }}>
              <GripVertical size={20} />
            </div>
          )}
          <div className="file-info" style={{ flex: 1 }}>
            <div className="file-name" title={download.filename}>{download.filename}</div>
            <div className="file-meta">
              {statusText}
              {isHistoryView && download.dateFinished && <span style={{marginLeft:'8px', fontStyle:'italic'}}>{download.dateFinished}</span>}
              {download.status === 'error' && download.errorMsg && <div style={{color:'var(--danger)', fontSize:'12px', marginTop:'4px'}}>{download.errorMsg}</div>}
            </div>
          </div>
          <div className="actions" style={{ display: 'flex', gap: '8px' }}>
            {download.status === 'completed' && download.vtStatus !== 'none' && (
              <button className="icon-btn" style={{ borderColor: getVtColor() }} 
                onClick={() => setShowVt(true)} title="VirusTotal Scan">
                <Shield size={16} color={getVtColor()} />
              </button>
            )}
            {(download.status === 'downloading' || download.status === 'retrying') && (
              <button className="icon-btn pause" onClick={handlePause} title="Pause"><Pause size={16} /></button>
            )}
            {(download.status === 'paused' || download.status === 'error') && (
              <button className="icon-btn play" onClick={handleResume} title="Resume"><Play size={16} /></button>
            )}
            {(download.status === 'downloading' || download.status === 'paused' || download.status === 'retrying') && (
              <button className="icon-btn stop" onClick={handleCancel} title="Cancel"><X size={16} /></button>
            )}
            {(download.status === 'completed' || download.status === 'error') && (
              <>
                {download.status === 'completed' && <button className="icon-btn folder" onClick={handleOpenFolder} title="Show in folder"><FolderSearch size={16} /></button>}
                {download.status === 'error' && <button className="icon-btn" onClick={handleCopyError} title="Copy Error Message"><Copy size={16} /></button>}
                <button className="icon-btn stop" onClick={handleDeleteFile} title="Delete File & Remove"><Trash2 size={16} color="var(--danger)" /></button>
                <button className="icon-btn stop" onClick={handleClear} title="Clear from list"><X size={16} /></button>
              </>
            )}
          </div>
        </div>
        <div className="progress-container">
          <div 
            className={`progress-bar ${download.status}`} 
            style={{ width: `${download.progress}%` }}
          ></div>
        </div>
      </div>
      {showVt && <VirusTotalModal vtStats={download.vtStats} vtStatus={download.vtStatus} downloadId={download.id} onClose={() => setShowVt(false)} />}
    </>
  );
}

export default DownloadItem;
