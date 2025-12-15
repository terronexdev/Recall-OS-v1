import React, { useState, useEffect, useRef } from 'react';
import { RecallFile, RecallType, SemanticDiff } from '../types';
import { remixMemory, runAgenticCommand, editSpecificSelection, editMemoryContent } from '../services/geminiService';

interface MemoryViewerProps {
  memory: RecallFile;
  onClose: () => void;
  onUpdate: (updatedMemory: RecallFile) => void;
}

interface SelectionState {
  text: string;
  start: number;
  end: number;
}

export const MemoryViewer: React.FC<MemoryViewerProps> = ({ memory, onClose, onUpdate }) => {
  const [activeContent, setActiveContent] = useState(memory.content); 
  const [agentPrompt, setAgentPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(memory.history.length - 1);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  
  // New: Toggle between rendered view and raw source for Documents
  const [viewSource, setViewSource] = useState(false);

  // Sync state when memory changes or time-travel happens
  useEffect(() => {
    setActiveContent(memory.content);
    setHistoryIndex(memory.history.length - 1);
    setSelection(null);
    setViewSource(false); // Reset to preview mode on new file
  }, [memory.id, memory.updatedAt]);

  const handleSelection = (e: React.SyntheticEvent<HTMLTextAreaElement | HTMLDivElement>) => {
      // Logic for Textarea (Precise index tracking)
      if (e.currentTarget instanceof HTMLTextAreaElement) {
          const start = e.currentTarget.selectionStart;
          const end = e.currentTarget.selectionEnd;
          if (start !== end) {
              const text = activeContent.substring(start, end);
              setSelection({ start, end, text });
          } else {
              setSelection(null);
          }
      } 
      // Fallback for HTML content (Approximation via window selection)
      else {
          const winSel = window.getSelection();
          if (winSel && !winSel.isCollapsed) {
              const text = winSel.toString();
              if (text.length > 0) {
                  // NOTE: This is an approximation for HTML views. It finds the first occurrence.
                  // For precise editing, we prefer the Text View.
                  const start = activeContent.indexOf(text);
                  if (start !== -1) {
                    setSelection({ start, end: start + text.length, text });
                  }
              }
          } else {
              setSelection(null);
          }
      }
  };

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
      } else if (selection) {
        // --- SELECTION EDIT MODE ---
        // Edit ONLY the highlighted chunk
        const replacement = await editSpecificSelection(activeContent, selection.text, agentPrompt);
        
        // Splice the string
        newContent = activeContent.substring(0, selection.start) + replacement + activeContent.substring(selection.end);
        description = `Edited selection: "${agentPrompt}"`;
        setSelection(null); // Clear selection after edit
      } else {
        // --- GLOBAL FILE MODE ---
        // Use specialized editor function which guarantees a JSON response with content
        const result = await editMemoryContent(activeContent, agentPrompt);
        
        newContent = result.content;
        description = result.reasoning;
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
          setSelection(null);
      } else if (idx === 0 && !item.content && memory.history.length === 1) {
          setActiveContent(memory.content);
          setHistoryIndex(idx);
          setSelection(null);
      }
  };

  const renderContent = () => {
    // 1. Image Viewer
    if (memory.type === RecallType.IMAGE || memory.type === RecallType.HYBRID) {
      return (
        <img 
          src={`data:image/jpeg;base64,${activeContent}`} 
          className="max-h-full max-w-full object-contain rounded shadow-lg border border-white/5"
          alt="Memory content"
        />
      );
    } 

    // 2. Document Viewer (PDF or HTML)
    if (memory.type === RecallType.DOCUMENT) {
        // PDF Handling (Always uses iframe)
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

        // HTML (DOCX) Handling - PREVIEW MODE
        // If not viewing source, show the formatted HTML
        if (!viewSource) {
            return (
                <div className="relative w-full h-full flex flex-col">
                     <button 
                        onClick={() => setViewSource(true)}
                        className="absolute top-2 right-2 z-10 bg-black/50 hover:bg-black/80 text-xs text-white px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10 transition-colors flex items-center gap-2"
                     >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>
                        Edit Source
                     </button>
                    <div 
                        className="w-full h-full bg-gray-200 text-gray-900 rounded-lg border border-white/10 p-8 overflow-auto shadow-inner selection:bg-cyan-300 selection:text-black"
                        onMouseUp={handleSelection}
                    >
                        <div 
                            className="prose max-w-none"
                            dangerouslySetInnerHTML={{ __html: activeContent }} 
                        />
                    </div>
                </div>
            );
        }
    }
    
    // 3. Text/Code Viewer OR Document Source Mode
    // We use a readOnly TextArea to allow precise native selection
    return (
        <div className="w-full h-full bg-gray-900 rounded-lg border border-white/10 p-1 overflow-hidden shadow-inner flex flex-col relative">
             {memory.type === RecallType.DOCUMENT && (
                 <button 
                    onClick={() => setViewSource(false)}
                    className="absolute top-2 right-4 z-10 bg-white/10 hover:bg-white/20 text-xs text-white px-3 py-1.5 rounded-lg backdrop-blur-md border border-white/10 transition-colors flex items-center gap-2"
                 >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    Preview
                 </button>
             )}
            <textarea 
                className="w-full h-full bg-transparent text-gray-300 font-mono text-sm p-6 resize-none focus:outline-none selection:bg-cyan-900 selection:text-white"
                value={activeContent}
                readOnly
                onSelect={handleSelection} // Fires on selection change
                spellCheck={false}
            />
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
            <div className="mt-4 w-full relative">
                {/* Selection Indicator */}
                {selection && (
                    <div className="absolute -top-10 left-0 bg-cyan-900/80 backdrop-blur-md border border-cyan-500/30 text-cyan-200 px-3 py-1.5 rounded-t-lg text-xs font-mono flex items-center gap-2 animate-in slide-in-from-bottom-2">
                        <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                        <span className="font-bold">EDITING SELECTION:</span>
                        <span className="opacity-70 truncate max-w-[200px]">"{selection.text}"</span>
                        <button onClick={() => setSelection(null)} className="ml-2 hover:text-white">✕</button>
                    </div>
                )}

                <div className={`glass-panel rounded-lg p-2 flex items-center gap-2 ${!isCurrentVersion ? 'opacity-50 pointer-events-none grayscale' : ''} ${selection ? 'rounded-tl-none border-t-cyan-500/50' : 'rounded-full'}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${selection ? 'bg-cyan-500' : 'bg-gradient-to-tr from-cyan-500 to-blue-600'}`}>
                        {selection ? (
                             <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                             </svg>
                        ) : (
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        )}
                    </div>
                    <input 
                        type="text" 
                        value={agentPrompt}
                        onChange={(e) => setAgentPrompt(e.target.value)}
                        placeholder={selection ? "How should I change the selected text?" : (memory.type === RecallType.IMAGE ? "Remix this image..." : "Edit this file...")}
                        className="bg-transparent border-none outline-none text-white text-sm px-2 flex-grow placeholder-white/30"
                        onKeyDown={(e) => e.key === 'Enter' && handleAgentAction()}
                    />
                    <button 
                        onClick={handleAgentAction}
                        disabled={isProcessing}
                        className="bg-white/10 hover:bg-white/20 text-white rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 uppercase tracking-wider"
                    >
                        {isProcessing ? 'Working...' : (selection ? 'Edit Selection' : 'Execute')}
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