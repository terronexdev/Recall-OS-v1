
import React, { useRef, useState, useMemo, useEffect } from 'react';
import { RecallFile } from '../types';
import { MemoryCard } from './MemoryCard';

interface SpatialCanvasProps {
  memories: RecallFile[];
  onUpdateMemoryPosition: (id: string, x: number, y: number) => void;
  onMemoryClick: (memory: RecallFile) => void;
  onDeleteMemory: (id: string) => void;
}

interface Viewport {
  x: number;
  y: number;
  scale: number;
}

interface Connection {
  fromId: string;
  toId: string;
  strength: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  memoryId: string;
}

export const SpatialCanvas: React.FC<SpatialCanvasProps> = ({ 
  memories, 
  onUpdateMemoryPosition,
  onMemoryClick,
  onDeleteMemory
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const centerViewport = () => {
    if (memories.length === 0) {
        setViewport({ x: window.innerWidth/2 - 400, y: window.innerHeight/2 - 300, scale: 1 });
        return;
    }
    
    let sumX = 0, sumY = 0;
    memories.forEach(m => { sumX += (m.x || 0); sumY += (m.y || 0); });
    const cx = sumX / memories.length;
    const cy = sumY / memories.length;
    
    setViewport({
        x: (window.innerWidth / 2) - (cx * 1),
        y: (window.innerHeight / 2) - (cy * 1),
        scale: 1
    });
  };

  useEffect(() => {
    centerViewport();
  }, []);

  const handleWheel = (e: React.WheelEvent) => {
    if (contextMenu) setContextMenu(null);
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const newScale = Math.min(Math.max(0.2, viewport.scale - e.deltaY * zoomSensitivity), 4);
    setViewport(prev => ({ ...prev, scale: newScale }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);
    if (e.button === 2) return; 
    
    if (!draggedNodeId) {
        setIsPanning(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;
        setViewport(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
        return;
    }

    if (draggedNodeId) {
        const memory = memories.find(m => m.id === draggedNodeId);
        if (memory) {
            const dx = e.movementX / viewport.scale;
            const dy = e.movementY / viewport.scale;
            onUpdateMemoryPosition(draggedNodeId, (memory.x || 0) + dx, (memory.y || 0) + dy);
        }
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setDraggedNodeId(null);
  };

  const handleNodeMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 0) {
        e.stopPropagation(); 
        setDraggedNodeId(id);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, id: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      if (id) {
        setContextMenu({ x: e.clientX, y: e.clientY, memoryId: id });
      } else {
        setContextMenu(null);
      }
  };

  const connections = useMemo(() => {
    const conns: Connection[] = [];
    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const m1 = memories[i];
        const m2 = memories[j];
        const common = m1.metadata.tags.filter(t => m2.metadata.tags.includes(t));
        if (common.length > 0) {
          conns.push({ fromId: m1.id, toId: m2.id, strength: Math.min(common.length, 3) });
        }
      }
    }
    return conns;
  }, [memories]);

  const renderConnection = (conn: Connection) => {
      const m1 = memories.find(m => m.id === conn.fromId);
      const m2 = memories.find(m => m.id === conn.toId);
      if (!m1 || !m2) return null;

      const x1 = (m1.x || 0) + 72; 
      const y1 = (m1.y || 0) + 72;
      const x2 = (m2.x || 0) + 72;
      const y2 = (m2.y || 0) + 72;
      
      return (
        <line 
            key={`${conn.fromId}-${conn.toId}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="rgba(6, 182, 212, 0.2)"
            strokeWidth={conn.strength}
            strokeDasharray="4 4"
            className="pointer-events-none"
        />
      );
  };

  return (
    <div 
        ref={containerRef}
        className={`w-full h-full relative overflow-hidden bg-[#050505] cursor-crosshair ${isPanning ? 'cursor-grabbing' : ''}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
    >
        <div 
            className="absolute inset-0 opacity-10 pointer-events-none transition-transform duration-75 ease-out" 
            style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
                backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', 
                backgroundSize: '40px 40px'
            }} 
        />

        <div 
            className="absolute top-0 left-0 w-full h-full transition-transform duration-75 ease-out"
            style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
            }}
        >
            <svg className="absolute top-[-5000px] left-[-5000px] w-[10000px] h-[10000px] pointer-events-none overflow-visible">
                {connections.map(renderConnection)}
            </svg>

            {memories.map(memory => (
                <div 
                    key={memory.id} 
                    onContextMenu={(e) => handleContextMenu(e, memory.id)}
                >
                    <MemoryCard 
                        memory={memory}
                        style={{
                            left: memory.x || 100,
                            top: memory.y || 100,
                        }}
                        onMouseDown={(e) => handleNodeMouseDown(e, memory.id)}
                        onClick={() => {
                            if (!draggedNodeId) onMemoryClick(memory);
                        }}
                    />
                </div>
            ))}
        </div>
        
        <div className="absolute bottom-8 right-8 flex flex-col gap-2 z-40">
            <button 
                onClick={centerViewport} 
                className="w-10 h-10 bg-gray-800/80 backdrop-blur text-white rounded-full border border-white/10 hover:bg-cyan-500 hover:text-black flex items-center justify-center transition-all shadow-lg"
                title="Recenter View"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M7 21H5a2 2 0 01-2-2v-2M21 17v2a2 2 0 01-2 2h-2"/></svg>
            </button>
        </div>

        {contextMenu && (
            <div 
                className="fixed z-50 bg-[#111] border border-white/10 rounded-lg shadow-2xl py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onMouseLeave={() => setContextMenu(null)}
            >
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors"
                    onClick={() => {
                        const m = memories.find(x => x.id === contextMenu.memoryId);
                        if(m) onMemoryClick(m);
                        setContextMenu(null);
                    }}
                >
                    Open
                </button>
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    onClick={() => {
                        onDeleteMemory(contextMenu.memoryId);
                        setContextMenu(null);
                    }}
                >
                    Delete
                </button>
            </div>
        )}
    </div>
  );
};
