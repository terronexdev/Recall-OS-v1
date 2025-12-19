
import React, { useState, useEffect, useMemo } from 'react';
import { MemoryViewer } from './components/MemoryViewer';
import { LibraryPanel } from './components/LibraryPanel';
import { AgentPanel } from './components/AgentPanel';
import { ingestRecall, runAgenticCommand } from './services/geminiService';
import { RecallFile, RecallType, ChatMessage } from './types';
import mammoth from 'mammoth';
import { read, utils } from 'xlsx';

export default function App() {
  // --- Global State ---
  const [memories, setMemories] = useState<RecallFile[]>([]);
  const [activeMemory, setActiveMemory] = useState<RecallFile | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState("System Ready");
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // UI States
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'type'>('date');

  // --- Persistence ---
  useEffect(() => {
    const saved = localStorage.getItem('recall_memories');
    if (saved) {
      try {
        setMemories(JSON.parse(saved));
      } catch (e) {
        localStorage.removeItem('recall_memories');
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('recall_memories', JSON.stringify(memories));
  }, [memories]);

  // --- Logic ---
  const filteredMemories = useMemo(() => {
      let filtered = memories.filter(m => 
        m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.metadata.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      if (filterTag) {
          filtered = filtered.filter(m => m.metadata.tags.includes(filterTag));
      }

      return [...filtered].sort((a, b) => {
          if (sortBy === 'name') return a.title.localeCompare(b.title);
          if (sortBy === 'type') return a.type.localeCompare(b.type);
          return b.updatedAt - a.updatedAt;
      });
  }, [memories, searchQuery, filterTag, sortBy]);

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0) return;

    setStatus("Ingesting Material...");
    for (const file of files) {
        try {
          let content = '';
          const fileName = file.name.toLowerCase();
          const isDocx = fileName.endsWith('.docx');
          const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv');
          const isImage = file.type.startsWith('image/');
          const isPdf = fileName.endsWith('.pdf') || file.type === 'application/pdf';
          
          if (isDocx) {
             const buf = await file.arrayBuffer();
             const res = await mammoth.convertToHtml({ arrayBuffer: buf });
             content = res.value;
          } else if (isExcel) {
             const buf = await file.arrayBuffer();
             const workbook = read(buf, { type: 'array' });
             
             const sheetsData = workbook.SheetNames.map(name => ({
                 name: name,
                 html: utils.sheet_to_html(workbook.Sheets[name])
             }));

             content = JSON.stringify({ 
                 appType: 'spreadsheet', 
                 sheets: sheetsData 
             });
          } else if (isImage || isPdf || file.type.startsWith('video/') || file.type.startsWith('audio/')) {
             const reader = new FileReader();
             content = await new Promise((resolve) => {
                 reader.onload = () => {
                     const res = reader.result as string;
                     resolve(res.split(',')[1]); // Extract Base64
                 };
                 reader.readAsDataURL(file);
             });
          } else {
             const reader = new FileReader();
             content = await new Promise((resolve) => {
                 reader.onload = () => resolve(reader.result as string);
                 reader.readAsText(file);
             });
          }
          
          const analysis = await ingestRecall(content, file.type || 'text/plain', file.name);
          
          let finalType = RecallType.DOCUMENT;
          if (isImage) finalType = RecallType.IMAGE;
          else if (file.type.startsWith('video/')) finalType = RecallType.VIDEO;
          else if (file.type.startsWith('audio/')) finalType = RecallType.AUDIO;
          else if (!isPdf && !isExcel && analysis.type) finalType = analysis.type as RecallType;

          const newMemory: RecallFile = {
            id: crypto.randomUUID(),
            title: analysis.title || file.name,
            description: analysis.description || '',
            type: finalType,
            content: content,
            thumbnail: (finalType === RecallType.IMAGE) ? content : '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: analysis.metadata as any,
            history: [{
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                description: 'Initial Recall State',
                author: 'user',
                content: content
            }]
          };
          setMemories(prev => [newMemory, ...prev]);
          setActiveMemory(newMemory);
        } catch (err) { 
          console.error("Ingestion error:", err);
        }
    }
    setStatus("System Ready");
  };

  const handleAgentCommand = async (input: string) => {
    if (!input.trim()) return;
    setIsProcessing(true);
    setChatHistory(prev => [...prev, { role: 'user', text: input, timestamp: Date.now() }]);
    
    const result = await runAgenticCommand(input, memories);
    
    if (result.type === 'chat') {
        setChatHistory(prev => [...prev, { role: 'model', text: result.message, timestamp: Date.now() }]);
    } else if (result.type === 'create') {
        setChatHistory(prev => [...prev, { role: 'model', text: `Memory Generated: ${result.title}`, timestamp: Date.now() }]);
        const newMem: RecallFile = {
            id: crypto.randomUUID(),
            title: result.title,
            description: result.reasoning,
            type: result.memoryType as RecallType,
            content: result.content,
            thumbnail: (result.memoryType === 'IMAGE') ? result.content : '',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            metadata: { tags: result.tags || ['agent-created'], mood: 'neutral', sourceApp: 'Agent Core' },
            history: [{ id: crypto.randomUUID(), timestamp: Date.now(), description: 'Generated by Agent', author: 'gemini', content: result.content }]
        };
        setMemories(p => [newMem, ...p]);
        setActiveMemory(newMem);
    }
    setIsProcessing(false);
  };

  return (
    <div 
        className="w-screen h-screen bg-[#050505] text-white overflow-hidden flex"
        onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDrop}
    >
        <LibraryPanel 
            memories={filteredMemories}
            onSelect={(m) => setActiveMemory(m)}
            sortBy={sortBy}
            onSortChange={setSortBy}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            activeId={activeMemory?.id}
            onFilterTag={setFilterTag}
            activeFilterTag={filterTag}
        />

        <main className="flex-grow flex flex-col border-x border-white/5 bg-[#080808] overflow-hidden h-full min-h-0">
            <header className="h-14 border-b border-white/5 flex-shrink-0 flex items-center justify-between px-6 bg-black/20 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                    <span className="text-[10px] font-mono tracking-widest text-gray-400 uppercase">Recall OS v1.2 // STABLE</span>
                </div>
                <div className="text-[10px] font-mono text-gray-600 tracking-widest uppercase">{status}</div>
            </header>

            <div className="flex-grow relative overflow-hidden min-h-0 h-full">
                {activeMemory ? (
                    <MemoryViewer 
                        memory={activeMemory}
                        isEmbedded={true}
                        onClose={() => setActiveMemory(null)}
                        onUpdate={(updated) => {
                            setMemories(p => p.map(m => m.id === updated.id ? updated : m));
                            setActiveMemory(updated);
                        }}
                        onDelete={(id) => { 
                            setMemories(p => p.filter(m => m.id !== id)); 
                            setActiveMemory(null);
                        }}
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-700">
                        <div className="w-24 h-24 mb-8 bg-cyan-500/5 border border-cyan-500/20 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-cyan-500/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                        </div>
                        <h2 className="text-xl font-bold text-gray-300 mb-2 font-mono uppercase tracking-tighter">System Idle</h2>
                        <p className="text-sm text-gray-500 max-w-xs mx-auto mb-8 font-mono leading-relaxed opacity-60">Select a recall from the library or drop a file anywhere to ingest into the neural core.</p>
                        
                        <div className="grid grid-cols-2 gap-4 w-full max-w-md">
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center">
                                <span className="text-2xl font-bold text-cyan-500 mb-1">{memories.length}</span>
                                <span className="text-[9px] font-mono text-gray-600 uppercase">Memories Logged</span>
                            </div>
                            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center">
                                <span className="text-2xl font-bold text-purple-500 mb-1">{(memories.length * 1.4).toFixed(1)}MB</span>
                                <span className="text-[9px] font-mono text-gray-600 uppercase">Core Capacity</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>

        <AgentPanel 
            history={chatHistory}
            onCommand={handleAgentCommand}
            isProcessing={isProcessing}
        />

        {isDraggingFile && (
            <div className="absolute inset-0 z-[100] bg-cyan-500/10 backdrop-blur-sm flex items-center justify-center border-4 border-cyan-500/30 m-4 rounded-3xl pointer-events-none">
                <h1 className="text-4xl font-black text-cyan-400 tracking-widest animate-pulse">DROP TO RECALL</h1>
            </div>
        )}
    </div>
  );
}
