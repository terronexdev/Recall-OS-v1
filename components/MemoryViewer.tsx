import React, { useState, useEffect } from 'react';
import { RecallFile, RecallType, SemanticDiff } from '../types';
import { remixMemory, runAgenticCommand } from '../services/geminiService';

interface MemoryViewerProps {
  memory: RecallFile;
  onClose: () => void;
  onUpdate: (updatedMemory: RecallFile) => void;
}

export const MemoryViewer: React.FC<MemoryViewerProps> = ({ memory, onClose, onUpdate }) => {
  const [activeContent, setActiveContent] = useState(memory.content); 
  const [agentPrompt, setAgentPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(memory.history.length - 1);

  // Sync state when memory changes or time-travel happens
  useEffect(() => {
    // If the memory object itself updates (e.g. from parent), reset to latest
    // But if we are navigating history locally, we might not want this to reset unless the memory ID changes
    setActiveContent(memory.content);
    setHistoryIndex(memory.history.length - 1);
  }, [memory.id, memory.updatedAt]);

  const handleAgentAction = async () => {
    if (!agentPrompt.trim()) return;
    setIsProcessing(true);
    
    try {
      let newContent = activeContent;
      let description = '';

      if (memory.type === RecallType.IMAGE) {
        // Image Path: Use Remix
        newContent = await remixMemory(activeContent, agentPrompt);
        description = `Visual Remix: "${agentPrompt}"`;
      } else {
        // Text/Doc Path: Use Agent
        // We pass ONLY this memory to the agent to force it to focus on this file
        const result = await runAgenticCommand(
          `Edit this file: ${agentPrompt}. Content: ${activeContent}`, 
          [{ ...memory, content: activeContent }]
        );

        if (result.type === 'update') {
          newContent = result.content;
          description = result.reasoning;
        } else {
          throw new Error("Agent did not return an update.");
        }
      }
      
      // Update State
      const newDiff: SemanticDiff = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        description: description || `Edited: "${agentPrompt}"`,
        previewImage: memory.type === RecallType.IMAGE ? newContent : undefined,
        content: newContent,
        author: 'gemini'
      };

      const updatedMemory = {
        ...memory,
        content: newContent,
        thumbnail: memory.type === RecallType.IMAGE ? newContent : memory.thumbnail,
        updatedAt: Date.now(),
        history: [...memory.history, newDiff]
      };

      onUpdate(updatedMemory);
      // activeContent will update via useEffect
      setAgentPrompt('');
      
    } catch (e) {
      console.error(e);
      alert("Agent failed to process request.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestoreVersion = () => {
      // Create a restoration event
      const restoredContent = activeContent; // The content currently being viewed
      
      const newDiff: SemanticDiff = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        description: `Restored version from ${new Date(memory.history[historyIndex].timestamp).toLocaleTimeString()}`,
        content: restoredContent,
        author: 'user'
      };

      const updatedMemory = {
        ...memory,
        content: restoredContent,
        thumbnail: memory.type === RecallType.IMAGE ? restoredContent : memory.thumbnail,
        updatedAt: Date.now(),
        history: [...memory.history, newDiff]
      };
      
      onUpdate(updatedMemory);
  };

  const handleHistoryClick = (idx: number) => {
      const item = memory.history[idx];
      if (item.content) {
          setActiveContent(item.content);
          setHistoryIndex(idx);
      } else if (idx === 0 && !item.content && memory.history.length === 1) {
          // Fallback for legacy files where initial content wasn't stored in history
          // If it's the only item, we assume it matches memory.content
          setActiveContent(memory.content);
          setHistoryIndex(idx);
      }
  };

  const renderContent = () => {
    if (memory.type === RecallType.IMAGE || memory.type === RecallType.HYBRID) {
      return (
        <img 
          src={`data:image/jpeg;base64,${activeContent}`} 
          className="max-h-full max-w-full object-contain rounded shadow-lg border border-white/5"
          alt="Memory content"
        />
      );
    } 

    if (memory.type === RecallType.DOCUMENT) {
        // If content is Base64 (PDF) or starts with data:application/pdf
        const isPdf = activeContent.startsWith('JVBER') || (memory.title.endsWith('.pdf'));
        
        if (isPdf) {
            return (
                <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden border border-white/10">
                    <iframe 
                        src={`data:application/pdf;base64,${activeContent}`} 
                        className="w-full h-full"
                        title="PDF Viewer"
                    />
                </div>
            );
        }

        // If content is HTML (DOCX parsed via Mammoth)
        // We render it in a styled container that looks like a page
        return (
            <div className="w-full h-full bg-gray-200 text-gray-900 rounded-lg border border-white/10 p-8 overflow-auto shadow-inner">
                <div 
                    className="prose max-w-none"
                    dangerouslySetInnerHTML={{ __html: activeContent }} 
                />
            </div>
        );
    }
    
    // Text / Code / Markdown View
    return (
        <div className="w-full h-full bg-gray-900 rounded-lg border border-white/10 p-6 overflow-auto shadow-inner">
            <pre className="text-sm font-mono text-gray-300 whitespace-pre-wrap">{activeContent}</pre>
        </div>
    );
  };

  const isCurrentVersion = historyIndex === memory.history.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-6xl h-[90vh] glass-panel rounded-2xl flex flex-col md:flex-row overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        
        {/* Left: Content Canvas */}
        <div className="flex-grow bg-black/40 relative flex flex-col p-6 overflow-hidden">
            {/* Version Warning Overlay */}
            {!isCurrentVersion && (
                 <div className="absolute top-4 left-0 right-0 z-20 flex justify-center pointer-events-none">
                     <div className="bg-yellow-500/10 backdrop-blur-md border border-yellow-500/40 text-yellow-200 px-4 py-2 rounded-full text-xs font-mono flex items-center gap-3 pointer-events-auto">
                         <span>VIEWING OLD VERSION</span>
                         <button 
                            onClick={handleRestoreVersion}
                            className="bg-yellow-500/20 hover:bg-yellow-500/40 px-3 py-1 rounded text-white font-bold transition-colors"
                         >
                             RESTORE
                         </button>
                     </div>
                 </div>
            )}

            <div className="flex-grow flex items-center justify-center overflow-hidden relative">
                {renderContent()}
            </div>
            
            {/* Agent Input Bar */}
            <div className="mt-4 w-full">
                <div className={`glass-panel rounded-full p-2 flex items-center gap-2 ${!isCurrentVersion ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                    </div>
                    <input 
                        type="text" 
                        value={agentPrompt}
                        onChange={(e) => setAgentPrompt(e.target.value)}
                        placeholder={memory.type === RecallType.IMAGE ? "Remix this image..." : "Edit this file (e.g., 'Fix bugs', 'Add section')..."}
                        className="bg-transparent border-none outline-none text-white text-sm px-2 flex-grow placeholder-white/30"
                        onKeyDown={(e) => e.key === 'Enter' && handleAgentAction()}
                    />
                    <button 
                        onClick={handleAgentAction}
                        disabled={isProcessing}
                        className="bg-white/10 hover:bg-white/20 text-white rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 uppercase tracking-wider"
                    >
                        {isProcessing ? 'Working...' : 'Execute'}
                    </button>
                </div>
            </div>
        </div>

        {/* Right: Sidebar / Semantic History */}
        <div className="w-full md:w-80 border-l border-white/10 bg-black/20 flex flex-col">
            <div className="p-6 border-b border-white/10">
                <h2 className="text-xl font-bold font-mono truncate">{memory.title}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                    {memory.metadata.tags.map(t => (
                        <span key={t} className="text-xs bg-white/5 px-2 py-1 rounded text-white/60">#{t}</span>
                    ))}
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-6">
                <h3 className="text-xs font-mono text-cyan-500 uppercase tracking-widest mb-4">Evolution History</h3>
                
                <div className="space-y-6 relative border-l border-white/10 ml-2 pl-6">
                    {memory.history.map((diff, idx) => (
                        <div 
                            key={diff.id} 
                            onClick={() => handleHistoryClick(idx)}
                            className={`relative cursor-pointer transition-all ${idx === historyIndex ? 'opacity-100 scale-105' : 'opacity-40 hover:opacity-80'}`}
                        >
                            {/* Dot */}
                            <div className={`absolute -left-[31px] top-1 w-3 h-3 rounded-full border-2 border-black transition-colors ${idx === historyIndex ? 'bg-cyan-500 shadow-[0_0_10px_cyan]' : 'bg-gray-600'}`} />
                            
                            <div className="text-xs text-gray-500 mb-1">{new Date(diff.timestamp).toLocaleTimeString()}</div>
                            <div className="text-sm text-white font-medium">{diff.description}</div>
                            {idx === historyIndex && !isCurrentVersion && <div className="text-[10px] text-yellow-500 mt-1 font-bold">PREVIEWING</div>}
                        </div>
                    ))}
                    {memory.history.length === 0 && <div className="text-xs text-gray-600 italic">No edits yet.</div>}
                </div>
            </div>

            <div className="p-4 border-t border-white/10 bg-black/40">
               <button onClick={onClose} className="w-full py-3 rounded-lg border border-white/10 hover:bg-white/5 text-sm transition-colors text-gray-400 hover:text-white">
                 Close File
               </button>
            </div>
        </div>

      </div>
    </div>
  );
};