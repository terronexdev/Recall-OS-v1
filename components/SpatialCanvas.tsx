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
  
  // Viewport State
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  
  // Interaction State
  const [isPanning, setIsPanning] = useState(false);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  
  // UX State
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // --- Helpers ---
  const screenToWorld = (screenX: number, screenY: number) => {
    return {
      x: (screenX - viewport.x) / viewport.scale,
      y: (screenY - viewport.y) / viewport.scale
    };
  };

  const centerViewport = () => {
    // Find centroid of memories or default to 0,0
    if (memories.length === 0) {
        setViewport({ x: window.innerWidth/2 - 400, y: window.innerHeight/2 - 300, scale: 1 });
        return;
    }
    
    let sumX = 0, sumY = 0;
    memories.forEach(m => { sumX += (m.x || 0); sumY += (m.y || 0); });
    const cx = sumX / memories.length;
    const cy = sumY / memories.length;
    
    // Center logic: ScreenCenter - (WorldCenter * Scale)
    setViewport({
        x: (window.innerWidth / 2) - (cx * 1),
        y: (window.innerHeight / 2) - (cy * 1),
        scale: 1
    });
  };

  // Initial Center
  useEffect(() => {
    centerViewport();
  }, []); // Run once on mount

  // --- Input Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    if (contextMenu) setContextMenu(null);
    e.preventDefault();
    const zoomSensitivity = 0.001;
    const newScale = Math.min(Math.max(0.2, viewport.scale - e.deltaY * zoomSensitivity), 4);
    setViewport(prev => ({ ...prev, scale: newScale }));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (contextMenu) setContextMenu(null);

    // Right Click
    if (e.button === 2) return; 

    // If clicking on a node (bubbled up), the node handler will fire first and stopPropagation if needed.
    // However, we want "Click Background = Pan", "Click Node = Drag Node".
    // We'll rely on handleNodeMouseDown to set draggedNodeId. 
    // If draggedNodeId is null here, it means we clicked background.
    
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
    // Left click only for drag
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

  // --- Renderers ---

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

      const x1 = (m1.x || 0) + 64; 
      const y1 = (m1.y || 0) + 64;
      const x2 = (m2.x || 0) + 64;
      const y2 = (m2.y || 0) + 64;
      const dist = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      const cp1x = x1 + dist * 0.5;
      const cp1y = y1;
      const cp2x = x2 - dist * 0.5;
      const cp2y = y2;
      const pathData = `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;

      return (
        <path 
            key={`${conn.fromId}-${conn.toId}`}
            d={pathData}
            fill="none"
            stroke="url(#neuralGradient)"
            strokeWidth={conn.strength}
            strokeLinecap="round"
            className="opacity-40 pointer-events-none"
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
        onContextMenu={(e) => e.preventDefault()} // Disable global context menu
    >
        {/* Infinite Grid */}
        <div 
            className="absolute inset-0 opacity-20 pointer-events-none transition-transform duration-75 ease-out" 
            style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
                backgroundImage: 'radial-gradient(#444 1px, transparent 1px)', 
                backgroundSize: '50px 50px'
            }} 
        />

        {/* Empty State Guide */}
        {memories.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center opacity-30">
                    <div className="text-6xl mb-4">📂</div>
                    <h2 className="text-2xl font-mono text-white tracking-widest">SYSTEM EMPTY</h2>
                    <p className="mt-2 text-sm text-gray-400">Drag & drop files to initialize memory core.</p>
                </div>
            </div>
        )}

        {/* World Layer */}
        <div 
            className="absolute top-0 left-0 w-full h-full transform-layer transition-transform duration-75 ease-out"
            style={{
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: '0 0',
            }}
        >
            <svg className="absolute top-[-5000px] left-[-5000px] w-[10000px] h-[10000px] pointer-events-none overflow-visible">
                <defs>
                    <linearGradient id="neuralGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="rgba(6, 182, 212, 0.0)" />
                        <stop offset="50%" stopColor="rgba(6, 182, 212, 0.5)" />
                        <stop offset="100%" stopColor="rgba(6, 182, 212, 0.0)" />
                    </linearGradient>
                </defs>
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
        
        {/* HUD Controls */}
        <div className="absolute bottom-8 right-8 flex flex-col gap-2 z-40">
            <button 
                onClick={centerViewport} 
                className="w-10 h-10 bg-gray-800/80 backdrop-blur text-white rounded-full border border-white/10 hover:bg-cyan-500/20 hover:border-cyan-500/50 flex items-center justify-center transition-all shadow-lg"
                title="Recenter View"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </button>
            <div className="bg-gray-800/80 backdrop-blur rounded-full border border-white/10 flex flex-col overflow-hidden shadow-lg">
                <button 
                    onClick={() => setViewport(v => ({ ...v, scale: Math.min(v.scale + 0.2, 4) }))}
                    className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                    title="Zoom In"
                >
                    +
                </button>
                <div className="h-[1px] bg-white/10 w-full" />
                <button 
                    onClick={() => setViewport(v => ({ ...v, scale: Math.max(v.scale - 0.2, 0.2) }))}
                    className="w-10 h-10 text-white hover:bg-white/10 flex items-center justify-center transition-colors"
                    title="Zoom Out"
                >
                    -
                </button>
            </div>
        </div>

        {/* Custom Context Menu */}
        {contextMenu && (
            <div 
                className="fixed z-50 bg-[#111] border border-white/10 rounded-lg shadow-2xl py-1 w-48 animate-in fade-in zoom-in-95 duration-100"
                style={{ top: contextMenu.y, left: contextMenu.x }}
                onMouseLeave={() => setContextMenu(null)}
            >
                <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-gray-500 font-bold border-b border-white/5 mb-1">
                    Memory Options
                </div>
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-cyan-500/20 hover:text-cyan-400 transition-colors flex items-center gap-2"
                    onClick={() => {
                        const m = memories.find(x => x.id === contextMenu.memoryId);
                        if(m) onMemoryClick(m);
                        setContextMenu(null);
                    }}
                >
                    <span>👁️</span> Open Memory
                </button>
                <button 
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                    onClick={() => {
                        onDeleteMemory(contextMenu.memoryId);
                        setContextMenu(null);
                    }}
                >
                    <span>🗑️</span> Delete Permanently
                </button>
            </div>
        )}
    </div>
  );
};
