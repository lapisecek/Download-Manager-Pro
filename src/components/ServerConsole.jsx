import React, { useState, useEffect, useRef } from 'react';
import { Activity, Server } from 'lucide-react';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { on: () => {}, removeListener: () => {} } 
};

function ServerConsole() {
  const [logs, setLogs] = useState([]);
  const [lastHeartbeat, setLastHeartbeat] = useState(0);
  const [activePort, setActivePort] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    // Fetch initial persistent logs
    if (ipcRenderer && ipcRenderer.invoke) {
      ipcRenderer.invoke('get-server-logs').then(history => {
        if (history) {
          setLogs(history);
        }
      }).catch(console.error);
    }

    const handleLog = (event, data) => {
      setLogs(prev => [...prev.slice(-99), data]);
    };
    
    const handleHeartbeat = (event, time) => {
      setLastHeartbeat(time);
    };

    const handlePort = (event, port) => {
      setActivePort(port);
    };

    ipcRenderer.on('server-log', handleLog);
    ipcRenderer.on('extension-heartbeat', handleHeartbeat);
    ipcRenderer.on('server-port-bound', handlePort);

    return () => {
      ipcRenderer.removeListener('server-log', handleLog);
      ipcRenderer.removeListener('extension-heartbeat', handleHeartbeat);
      ipcRenderer.removeListener('server-port-bound', handlePort);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Extension alarms fire every 60s. We allow 90s before declaring disconnected.
  const isConnected = lastHeartbeat > 0 && (Date.now() - lastHeartbeat) < 90000;

  const handleCopyLogs = () => {
    const logText = logs.map(l => `[${l.time}] ${l.msg}`).join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      setLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: '[SYSTEM] Logs copied to clipboard' }]);
    });
  };

  return (
    <div className="animated" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Server Console</h1>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {activePort && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Port: {activePort}</span>
              <button 
                onClick={() => window.open(`http://localhost:${activePort}/api/ping`, '_blank')}
                style={{ padding: '6px 12px', background: 'transparent', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}
                title="Open this link in your browser. If it works here but fails in the extension, the issue is Chrome Extension permissions."
              >
                Test in Browser
              </button>
            </div>
          )}

          <button 
            onClick={handleCopyLogs}
            style={{ padding: '6px 12px', background: 'var(--bg-glass)', color: 'white', border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            Copy Logs
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'var(--bg-glass)', borderRadius: '20px', border: '1px solid var(--border-glass)' }}>
            <Activity size={16} color={isConnected ? 'var(--success)' : 'var(--danger)'} />
            <span style={{ fontSize: '14px', color: isConnected ? 'var(--success)' : 'var(--danger)' }}>
              {lastHeartbeat === 0 ? 'Waiting...' : (isConnected ? 'Extension Connected' : 'Extension Disconnected')}
            </span>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, background: '#0d0d12', borderRadius: '12px', border: '1px solid var(--border-glass)', padding: '16px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '13px', userSelect: 'text' }}>
        {logs.map((log, i) => (
          <div key={i} style={{ marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>[{log.time}]</span>{' '}
            <span style={{ color: log.msg.includes('[SYSTEM]') ? 'var(--accent)' : log.msg.includes('[DOWNLOAD]') ? 'var(--success)' : 'var(--text-main)' }}>
              {log.msg}
            </span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export default ServerConsole;
