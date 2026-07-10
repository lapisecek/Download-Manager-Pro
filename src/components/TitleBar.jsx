import React from 'react';
import { Minus, Square, X, DownloadCloud } from 'lucide-react';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve() } 
};

function TitleBar() {
  const handleMinimize = () => ipcRenderer.invoke('window-minimize');
  const handleMaximize = () => ipcRenderer.invoke('window-maximize');
  const handleClose = () => ipcRenderer.invoke('window-close');

  return (
    <div className="title-bar">
      <div className="title-bar-drag-area">
        <div className="title-brand">
          <DownloadCloud size={14} />
          <span>DM Pro</span>
        </div>
      </div>
      <div className="title-bar-controls">
        <button onClick={handleMinimize} className="control-btn"><Minus size={14} /></button>
        <button onClick={handleMaximize} className="control-btn"><Square size={12} /></button>
        <button onClick={handleClose} className="control-btn close"><X size={14} /></button>
      </div>
    </div>
  );
}

export default TitleBar;
