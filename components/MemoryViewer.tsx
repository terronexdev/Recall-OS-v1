import React, { useState, useEffect, useRef } from 'react';
import { RecallFile, RecallType, SemanticDiff } from '../types';
import { remixMemory, editMemoryContent } from '../services/geminiService';
import { jsPDF } from 'jspdf';

interface MemoryViewerProps {
  memory: RecallFile;
  onClose: () => void;
  onUpdate: (updatedMemory: RecallFile) => void;
  onDelete: (id: string) => void;
  isEmbedded?: boolean;
}

interface SpreadsheetData {
    appType: 'spreadsheet';
    sheets: { name: string; html: string }[];
}

export const MemoryViewer: React.FC<MemoryViewerProps> = ({ memory, onClose, onUpdate, onDelete, isEmbedded }) => {
  const [activeContent, setActiveContent] = useState(memory.content); 
  const [agentPrompt, setAgentPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(memory.history.length - 1);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [parsedSpreadsheet, setParsedSpreadsheet] = useState<SpreadsheetData | null>(null);
  
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveContent(memory.content);
    setHistoryIndex(memory.history.length - 1);
    
    if (memory.content.startsWith('{"appType":"spreadsheet"')) {
        try {
            const data = JSON.parse(memory.content);
            if (data.appType === 'spreadsheet') { 
                setParsedSpreadsheet(data); 
                setActiveSheetIndex(0); 
            }
        } catch (e) { setParsedSpreadsheet(null); }
    } else { setParsedSpreadsheet(null); }
  }, [memory.id, memory.updatedAt, memory.content]);

  const handleAgentAction = async () => {
    if (!agentPrompt.trim()) return;
    setIsProcessing(true);
    try {
      let newContent = activeContent;
      let description = `Refinement: "${agentPrompt}"`;
      const promptLower = agentPrompt.toLowerCase();

      // Path A: PDF Conversion
      if (promptLower.includes("pdf") && !activeContent.startsWith('JVBER')) {
         const doc = new jsPDF();
         const cleanText = activeContent.replace(/(<([^>]+)>)/gi, "");
         const lines = doc.splitTextToSize(cleanText, 180);
         doc.text(lines, 10, 10);
         newContent = doc.output('datauristring').split(',')[1];
         description = "Converted to PDF Format";
      } 
      // Path B: Image Remixing
      else if (memory.type === RecallType.IMAGE) {
        newContent = await remixMemory(activeContent, agentPrompt);
      } 
      // Path C: Global Content Transformation
      else {
        const result = await editMemoryContent(activeContent, agentPrompt);
        newContent = result.content;
        description = result.reasoning;
      }
      
      const newDiff: SemanticDiff = {
        id: crypto.randomUUID(), 
        timestamp: Date.now(),
        description, 
        content: newContent, 
        author: 'gemini'
      };
      
      onUpdate({ ...memory, content: newContent, updatedAt: Date.now(), history: [...memory.history, newDiff] });
      setAgentPrompt('');
    } catch (e) { 
        console.error("Action failed", e);
    } finally { 
        setIsProcessing(false); 
    }
  };

  const handleRestore = (idx: number) => {
      const item = memory.history[idx];
      if (!item.content) return;
      onUpdate({
          ...memory,
          content: item.content,
          updatedAt: Date.now(),
          history: [...memory.history, {
              id: crypto.randomUUID(),
              timestamp: Date.now(),
              description: `Restored Version: ${new Date(item.timestamp).toLocaleTimeString()}`,
              author: 'user',
              content: item.content
          }]
      });
  };

  const renderContent = () => {
    const isPdf = activeContent.startsWith('JVBER') || (memory.title.toLowerCase().endsWith('.pdf'));

    if (isPdf) {
      return (
        <div className="w-full h-full bg-[#111] rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
          <iframe src={`data:application/pdf;base64,${activeContent}#toolbar=0&view=FitH`} className="w-full h-full" title="PDF Reader" />
        </div>
      );
    }

    if (memory.type === RecallType.IMAGE) {
      return (
          <div className="w-full h-full flex items-center justify-center p-8">
              <img src={`data:image/jpeg;base64,${activeContent}`} className="max-h-full max-w-full object-contain rounded-xl shadow-2xl border border-white/10" alt="Recall Image" />
          </div>
      );
    } 

    if (parsedSpreadsheet) {
        return (
            <div className="w-full h-full flex flex-col bg-[#0a0a0a] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="flex-grow overflow-auto p-8 custom-scrollbar">
                    <div className="min-w-max prose prose-invert max-w-none spreadsheet-viewer" dangerouslySetInnerHTML={{ __html: parsedSpreadsheet.sheets[activeSheetIndex]?.html || "" }} />
                </div>
                <div className="flex-shrink-0 h-12 bg-black/40 border-t border-white/5 flex items-center px-4 overflow-x-auto gap-2">
                    {parsedSpreadsheet.sheets.map((sheet, idx) => (
                        <button key={idx} onClick={() => setActiveSheetIndex(idx)} className={`px-4 py-1.5 text-[10px] font-mono whitespace-nowrap transition-all rounded-md ${activeSheetIndex === idx ? 'bg-cyan-500 text-black font-bold' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}>{sheet.name}</button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div 
            ref={contentRef}
            className="w-full h-full bg-[#0a0a0a] text-gray-200 rounded-2xl border border-white/10 p-12 overflow-auto shadow-inner custom-scrollbar selection:bg-cyan-500/40 selection:text-white"
        >
            <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: activeContent }} />
        </div>
    );
  };

  const isCurrent = historyIndex === memory.history.length - 1;

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#080808]">
        <div className="flex-grow flex flex-col p-6 overflow-hidden relative border-r border-white/5">
            {!isCurrent && (
                <div className="absolute top-10 left-0 right-0 z-30 flex justify-center pointer-events-none">
                    <div className="bg-amber-500/20 backdrop-blur-xl border border-amber-500/40 text-amber-200 px-6 py-2.5 rounded-full text-[10px] font-mono flex items-center gap-6 pointer-events-auto shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
                        <span className="flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                           HISTORICAL STATE (VERSION {historyIndex + 1})
                        </span>
                        <button onClick={() => handleRestore(historyIndex)} className="bg-amber-500 text-black font-black px-4 py-1 rounded-md text-[9px] hover:scale-105 transition-transform">RESTORE</button>
                    </div>
                </div>
            )}

            <div className="flex-grow overflow-hidden min-h-0">
                {renderContent()}
            </div>
            
            <div className="mt-6 flex-shrink-0 flex items-center gap-4 p-3 rounded-full border bg-black/40 border-white/5 shadow-xl">
                <div className="flex-grow flex items-center gap-4 pl-4">
                    <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse shadow-[0_0_10px_rgba(6,182,212,0.4)]" />
                    <input 
                        type="text" value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)}
                        placeholder="Issue a command to rewrite, summarize, or convert..." 
                        className="flex-grow bg-transparent border-none outline-none text-sm text-white py-2 placeholder-white/20"
                        onKeyDown={(e) => e.key === 'Enter' && handleAgentAction()}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleAgentAction} disabled={isProcessing || !agentPrompt.trim()} className="bg-cyan-500 text-black px-8 py-2.5 rounded-full text-xs font-black uppercase hover:scale-105 active:scale-95 disabled:opacity-20 transition-all shadow-lg shadow-cyan-500/10">
                        {isProcessing ? 'Thinking...' : 'Modify'}
                    </button>
                </div>
            </div>
        </div>

        <div className="w-80 flex-shrink-0 bg-black/40 flex flex-col h-full overflow-hidden">
            <div className="p-8 border-b border-white/5 flex-shrink-0">
                <h3 className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.3em] mb-4">Core Identity</h3>
                <h2 className="text-2xl font-bold truncate mb-4" title={memory.title}>{memory.title}</h2>
                <div className="flex flex-wrap gap-2">
                    {memory.metadata.tags.map(tag => (
                        <span key={tag} className="text-[10px] bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg text-gray-400 font-medium">#{tag}</span>
                    ))}
                </div>
            </div>

            <div className="flex-grow overflow-y-auto p-8 custom-scrollbar">
                <h3 className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.3em] mb-8">Evolution</h3>
                <div className="relative border-l border-white/5 ml-2 pl-6 space-y-10 pb-10">
                    {memory.history.map((diff, idx) => (
                        <div 
                            key={diff.id} 
                            onClick={() => { setActiveContent(diff.content || memory.content); setHistoryIndex(idx); }}
                            className={`relative cursor-pointer transition-all group ${idx === historyIndex ? 'opacity-100' : 'opacity-25 hover:opacity-75'}`}
                        >
                            <div className={`absolute -left-[32px] top-1 w-3.5 h-3.5 rounded-full border-2 border-[#080808] transition-all duration-500 ${idx === historyIndex ? 'bg-cyan-500 shadow-[0_0_15px_cyan]' : 'bg-gray-800'}`} />
                            <div className="text-[9px] text-gray-600 mb-1 font-mono uppercase tracking-widest">{new Date(diff.timestamp).toLocaleDateString()} • {new Date(diff.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                            <div className="text-xs font-medium text-gray-100 leading-relaxed">{diff.description}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="p-8 bg-black/20 border-t border-white/5">
                <button onClick={onClose} className="w-full py-4 rounded-2xl border border-white/10 hover:bg-white/5 transition-all text-[10px] font-mono uppercase tracking-[0.2em] text-gray-500 hover:text-white font-bold">Close Recall Workspace</button>
            </div>
        </div>
    </div>
  );
}