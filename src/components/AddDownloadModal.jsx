import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DownloadCloud, X, ArrowRight } from 'lucide-react';

const { ipcRenderer, clipboard } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve(false) },
  clipboard: { readText: () => '' }
};

function AddDownloadModal({ onClose }) {
  const [url, setUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus URL input on open
    inputRef.current?.focus();

    // Check clipboard for http/https URL
    try {
      if (clipboard && clipboard.readText) {
        const text = clipboard.readText() || '';
        const trimmed = text.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          setUrl(trimmed);
        }
      }
    } catch {}

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError('Please provide a download URL.');
      return;
    }
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      setError('Only HTTP and HTTPS links are supported.');
      return;
    }

    setLoading(true);
    try {
      const ok = await ipcRenderer.invoke('add-download', {
        url: trimmedUrl,
        filename: filename.trim() || null
      });
      if (ok) {
        onClose();
      } else {
        setError('Failed to queue download. Check URL format.');
      }
    } catch (err) {
      setError(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '480px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <DownloadCloud size={22} color="var(--accent)" />
            <h2 style={{ margin: 0, fontSize: '18px', color: 'var(--text-main)' }}>Add New Download</h2>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Download URL
              </label>
              <input
                ref={inputRef}
                type="text"
                className="input-field"
                placeholder="https://example.com/file.zip"
                value={url}
                onChange={e => { setUrl(e.target.value); setError(''); }}
                required
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Custom Filename (Optional)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Leave blank to use server filename"
                value={filename}
                onChange={e => setFilename(e.target.value)}
              />
            </div>

            {error && (
              <div style={{ color: 'var(--danger)', fontSize: '13px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {loading ? 'Adding...' : <>Start Download <ArrowRight size={16} /></>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export default AddDownloadModal;
