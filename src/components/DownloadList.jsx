import React, { useEffect, useState } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import DownloadItem from './DownloadItem';

const { ipcRenderer } = window.require ? window.require('electron') : { 
  ipcRenderer: { invoke: () => Promise.resolve([]), on: () => {}, removeListener: () => {} } 
};

function DownloadList() {
  const [downloads, setDownloads] = useState([]);

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
    if (active.id !== over.id) {
      const oldIndex = activeDownloads.findIndex(d => d.id === active.id);
      const newIndex = activeDownloads.findIndex(d => d.id === over.id);
      const newOrder = arrayMove(activeDownloads, oldIndex, newIndex);
      
      const newOrderedIds = newOrder.map(d => d.id);
      ipcRenderer.invoke('reorder-downloads', newOrderedIds);
      
      setDownloads(prev => {
        const others = prev.filter(d => ['completed', 'error'].includes(d.status) || d.hidden);
        return [...newOrder, ...others];
      });
    }
  };

  return (
    <div className="animated">
      <h1 className="page-title">Active Downloads</h1>
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
