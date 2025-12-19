
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';

interface AgentPanelProps {
  history: ChatMessage[];
  onCommand: (q: string) => void;
  isProcessing: boolean;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ history, onCommand, isProcessing }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [history]);

  return (
    <aside className="w-96 flex-shrink-0 flex flex-col bg-black/40 h-full overflow-hidden">
        <div className="p-6 border-b border-white/5">
            <h2 className="text-xs font-mono font-bold text-cyan-500 uppercase tracking-[0.2em]">Recall Agent</h2>
            <p className="text-[10px] text-gray-500 mt-1">System Intelligence v3.2</p>
        </div>

        <div 
            ref={scrollRef}
            className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar"
        >
            {history.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center opacity-20 text-center px-4">
                    <div className="w-12 h-12 rounded-full bg-cyan-500 mb-4 animate-pulse" />
                    <p className="text-xs font-mono">NEURAL CORE STANDBY</p>
                    <p className="text-[10px] mt-2 italic">Ask about your budget specifics, project status, or to cluster your files.</p>
                </div>
            )}
            
            {history.map((msg, i) => (
                <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === 'user' ? 'bg-cyan-600 text-white rounded-tr-none' : 'bg-white/5 border border-white/10 text-gray-200 rounded-tl-none'}`}>
                        {msg.text.split('\n').map((line, j) => <p key={j} className={j > 0 ? 'mt-2' : ''}>{line}</p>)}
                    </div>
                    <span className="text-[8px] text-gray-600 mt-1 uppercase font-mono">{msg.role === 'user' ? 'User' : 'Recall Agent'} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
            ))}
            
            {isProcessing && (
                <div className="flex items-center gap-2 text-cyan-500 font-mono text-[10px] animate-pulse">
                    <div className="w-2 h-2 bg-cyan-500 rounded-full" />
                    THINKING...
                </div>
            )}
        </div>

        <div className="p-6 border-t border-white/5 bg-black/20">
            <div className="relative group">
                <input 
                    type="text" 
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            onCommand(input);
                            setInput('');
                        }
                    }}
                    placeholder="Message system..." 
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 pr-12 text-sm focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
                />
                <button 
                    onClick={() => { onCommand(input); setInput(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-cyan-500 hover:text-cyan-400 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                {['Summarize Project', 'List High Risk', 'Sort Canvas'].map(prompt => (
                    <button 
                        key={prompt}
                        // Use onCommand from props instead of the missing handleAgentCommand
                        onClick={() => onCommand(prompt)}
                        className="text-[9px] text-gray-500 hover:text-cyan-400 font-mono border border-white/5 px-2 py-1 rounded-md transition-colors"
                    >
                        {prompt}
                    </button>
                ))}
            </div>
        </div>
    </aside>
  );
};
