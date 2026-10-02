import React, { useEffect, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import DownloadItem from './DownloadItem';
import AddDownloadModal from './AddDownloadModal';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve([]), on: () => {}, removeListener: () => {} } 
};

function DownloadList() {
  const [downloads, setDownloads] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    ipcRenderer.invoke('get-downloads').then(setDownloads);
    const handleUpdate = (event, updatedDownloads) => setDownloads(updatedDownloads);
    ipcRenderer.on('downloads-updated', handleUpdate);
    return () => ipcRenderer.removeListener('downloads-updated', handleUpdate);
  }, []);

  const activeDownloads = downloads.filter(d => !['completed', 'error'].includes(d.status) && !d.hidden);
  const finishedDownloads = downloads.filter(d => d.status === 'completed' && !d.hidden);
  const errorDownloads = downloads.filter(d => d.status === 'error' && !d.hidden);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeDownloads.findIndex(d => d.id === active.id);
    const newIndex = activeDownloads.findIndex(d => d.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(activeDownloads, oldIndex, newIndex);
    const newOrderedIds = newOrder.map(d => d.id);
    ipcRenderer.invoke('reorder-downloads', newOrderedIds);
    
    setDownloads(prev => {
      const others = prev.filter(d => ['completed', 'error'].includes(d.status) || d.hidden);
      return [...newOrder, ...others];
    });
  };

  return (
    <div className="animated">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 className="page-title" style={{ margin: 0 }}>Active Downloads</h1>
        <button 
          type="button"
          className="btn" 
          onClick={() => setShowAddModal(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={16} /> Add Download
        </button>
      </div>

      {activeDownloads.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>No active downloads.</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={activeDownloads.map(d => d.id)} strategy={verticalListSortingStrategy}>
            <div className="downloads-container" style={{ marginBottom: '24px' }}>
              {activeDownloads.map(dl => <DownloadItem key={dl.id} download={dl} />)}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {showAddModal && <AddDownloadModal onClose={() => setShowAddModal(false)} />}

      {finishedDownloads.length > 0 && (
        <>
          <h1 className="page-title" style={{ marginTop: '32px', color: 'var(--success)', fontSize: '22px' }}>Finished Downloads</h1>
          <div className="downloads-container">
            {finishedDownloads.map(dl => <DownloadItem key={dl.id} download={dl} />)}
          </div>
        </>
      )}

      {errorDownloads.length > 0 && (
        <>
          <h1 className="page-title" style={{ marginTop: '32px', color: 'var(--danger)', fontSize: '22px' }}>Errored Downloads</h1>
          <div className="downloads-container">
            {errorDownloads.map(dl => <DownloadItem key={dl.id} download={dl} />)}
          </div>
        </>
      )}
    </div>
  );
}

export default DownloadList;
