import React, { useState, useEffect } from 'react';
import { MemoryViewer } from './components/MemoryViewer';
import { SpatialCanvas } from './components/SpatialCanvas';
import { ingestRecall, runAgenticCommand } from './services/geminiService';
import { RecallFile, RecallType, SemanticDiff } from './types';
import mammoth from 'mammoth';

// --- Helper Functions ---
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]); 
    reader.onerror = error => reject(error);
  });
};

const fileToText = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsText(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

// --- Smart Positioning Logic ---
const getSmartPosition = (type: RecallType, currentMemories: RecallFile[]) => {
  const peers = currentMemories.filter(m => m.type === type);
  const jitter = () => (Math.random() * 120) - 60; // +/- 60px spread

  // 1. If peers exist, cluster around their center of gravity
  if (peers.length > 0) {
    const sumX = peers.reduce((acc, m) => acc + (m.x || 0), 0);
    const sumY = peers.reduce((acc, m) => acc + (m.y || 0), 0);
    const avgX = sumX / peers.length;
    const avgY = sumY / peers.length;

    return {
      x: avgX + jitter(),
      y: avgY + jitter()
    };
  }

  // 2. If no peers, snap to Archetype Anchors (zones)
  // Assumes a virtual canvas center around 500, 400
  switch (type) {
    case RecallType.IMAGE:
    case RecallType.HYBRID:
      return { x: 900 + jitter(), y: 200 + jitter() }; // Top Right (Gallery)
    case RecallType.DOCUMENT:
      return { x: 200 + jitter(), y: 200 + jitter() }; // Top Left (Filing Cabinet)
    case RecallType.AUDIO:
    case RecallType.VIDEO:
      return { x: 200 + jitter(), y: 700 + jitter() }; // Bottom Left (AV Studio)
    case RecallType.TEXT:
    default:
      return { x: 600 + jitter(), y: 500 + jitter() }; // Center (Workbench)
  }
};

export default function App() {
  // --- Global State ---
  const [memories, setMemories] = useState<RecallFile[]>([]);
  const [activeMemory, setActiveMemory] = useState<RecallFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState("System Ready");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('recall_memories');
    if (saved) {
      setMemories(JSON.parse(saved));
    } else {
      // Seed Data
      setMemories([{
          id: '1',
          title: 'Welcome to Recall',
          description: 'System initialization manifest.',
          type: RecallType.TEXT,
          content: 'Welcome to Recall OS v2.0.\n\nSpatial interface active.\nNeural core online.',
          thumbnail: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          metadata: { tags: ['system', 'welcome'], mood: 'neutral' },
          history: [],
          x: 600,
          y: 400
      }]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('recall_memories', JSON.stringify(memories));
  }, [memories]);

  // --- Actions ---

  const handleUpdateMemoryPosition = (id: string, x: number, y: number) => {
    setMemories(prev => prev.map(m => m.id === id ? { ...m, x, y } : m));
  };

  const handleDeleteMemory = (id: string) => {
      setMemories(prev => prev.filter(m => m.id !== id));
      setStatus("Memory Deleted");
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;

    setStatus("Ingesting Material...");
    
    // Create a local copy of memories to calculate positions for the batch
    const newMemoriesBatch: RecallFile[] = [];
    const currentMemoryState = [...memories]; 

    for (const file of files) {
        try {
          let content = '';
          const mimeType = file.type || 'application/octet-stream';
          const isDocx = file.name.endsWith('.docx');
          const isText = mimeType.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.ts');
          
          if (isDocx) {
             const buf = await file.arrayBuffer();
             const res = await mammoth.convertToHtml({ arrayBuffer: buf });
             content = res.value;
          } else if (isText) {
             content = await fileToText(file);
          } else {
             content = await fileToBase64(file);
          }
          
          const analysis = await ingestRecall(content, isDocx ? 'text/html' : mimeType, file.name);
          
          // Determine Type strictly for positioning
          const type = isDocx ? RecallType.DOCUMENT : (analysis.type || RecallType.DOCUMENT);
          
          // Calculate Smart Position
          // We pass [current + batch] to ensure files dropped together clump together
          const pos = getSmartPosition(type, [...currentMemoryState, ...newMemoriesBatch]);
          
          const newMemory: RecallFile = {
            id: crypto.randomUUID(),
            title: analysis.title || file.name,
            description: analysis.description || '',
            type: type,
            content: content,
            thumbnail: (analysis.type === RecallType.IMAGE) ? content : '', 
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: analysis.metadata as any,
            history: [{
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                description: 'Original Import',
                author: 'user',
                content: content
            }],
            x: pos.x, 
            y: pos.y
          };
          
          newMemoriesBatch.push(newMemory);
        } catch (err) {
          console.error(err);
        }
    }
    
    setMemories(prev => [...newMemoriesBatch, ...prev]);
    setStatus("System Ready");
  };

  const handleCommand = async () => {
      if (!searchQuery.trim()) return;
      setIsProcessing(true);
      setStatus("Agent Thinking...");
      
      const result = await runAgenticCommand(searchQuery, memories);
      
      if (result.type === 'move') {
          // Animate movement
          setMemories(prev => prev.map(m => {
              const target = result.layout.find(l => l.id === m.id);
              return target ? { ...m, x: target.x, y: target.y } : m;
          }));
          setStatus(result.reasoning);
      } else if (result.type === 'update') {
          // Handle update logic if needed at top level, usually handled in viewer
          setStatus(result.reasoning);
      } else {
          setStatus(result.message);
      }
      
      setIsProcessing(false);
      setSearchQuery('');
  };

  return (
    <div 
        className="w-screen h-screen bg-[#050505] text-white overflow-hidden relative"
        onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDrop}
    >
        {/* Background Ambient Glow */}
        <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-20%] left-[20%] w-[800px] h-[800px] bg-purple-900/10 rounded-full blur-[120px] animate-pulse" />
            <div className="absolute bottom-[-20%] right-[20%] w-[600px] h-[600px] bg-cyan-900/10 rounded-full blur-[100px] animate-pulse" style={{animationDelay: '2s'}} />
        </div>

        {/* 1. Spatial Engine */}
        <SpatialCanvas 
            memories={memories}
            onUpdateMemoryPosition={handleUpdateMemoryPosition}
            onMemoryClick={setActiveMemory}
            onDeleteMemory={handleDeleteMemory}
        />

        {/* 2. Spotlight Command Bar (Floating) */}
        <div className="fixed top-8 left-1/2 -translate-x-1/2 w-full max-w-xl z-50 px-4">
            <div className="glass-pill rounded-full flex items-center p-1 pr-4 shadow-2xl transition-all focus-within:ring-2 focus-within:ring-cyan-500/30 ring-1 ring-white/10">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-800 to-black flex items-center justify-center border border-white/10 shadow-inner ml-1">
                    <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-ping' : 'bg-cyan-500 shadow-[0_0_10px_cyan]'}`} />
                </div>
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
                    placeholder="Ask Recall Agent..." 
                    className="bg-transparent border-none outline-none text-white text-sm font-mono flex-grow px-4 h-full placeholder-gray-500"
                />
                <span className="text-[10px] text-gray-600 font-mono hidden sm:block">CMD+K</span>
            </div>
            
            {/* Status Text (Below Pill) */}
            <div className="text-center mt-3">
                <span className="text-[10px] font-mono text-white/30 tracking-[0.2em] uppercase">{status}</span>
            </div>
        </div>

        {/* 3. Ingestion Overlay */}
        {isDraggingFile && (
            <div className="absolute inset-0 z-[60] bg-cyan-500/10 backdrop-blur-sm flex items-center justify-center border-4 border-cyan-500/30 m-4 rounded-3xl">
                <h1 className="text-4xl font-black text-cyan-400 tracking-widest animate-pulse">INGEST DATA</h1>
            </div>
        )}

        {/* 4. Memory Viewer (Modal) */}
        {activeMemory && (
            <MemoryViewer 
                memory={activeMemory} 
                onClose={() => setActiveMemory(null)}
                onUpdate={(updated) => {
                    setMemories(prev => prev.map(m => m.id === updated.id ? updated : m));
                    setActiveMemory(updated);
                }}
            />
        )}
    </div>
  );
}
