import React from 'react';
import { RecallFile } from '../types';

interface LibraryPanelProps {
  memories: RecallFile[];
  onSelect: (m: RecallFile) => void;
  sortBy: 'date' | 'name' | 'type';
  onSortChange: (s: 'date' | 'name' | 'type') => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeId?: string;
  onFilterTag: (tag: string | null) => void;
  activeFilterTag: string | null;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  memories, onSelect, sortBy, onSortChange, searchQuery, onSearchChange, activeId, onFilterTag, activeFilterTag
}) => {
  const allTags = Array.from(new Set(memories.flatMap(m => m.metadata.tags))).slice(0, 10);

  return (
    <aside className="w-80 flex-shrink-0 flex flex-col bg-black/40 border-r border-white/5 h-full overflow-hidden">
        <div className="p-4 border-b border-white/5">
            <h2 className="text-xs font-mono font-bold text-gray-500 uppercase tracking-widest mb-4">Memory Library</h2>
            <div className="relative mb-4">
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search memories..." 
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
            </div>
            
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
                <button 
                    onClick={() => onFilterTag(null)}
                    className={`px-3 py-1 rounded-full text-[10px] whitespace-nowrap border transition-all ${!activeFilterTag ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'border-white/10 text-gray-500'}`}
                >
                    All
                </button>
                {allTags.map(tag => (
                    <button 
                        key={tag}
                        onClick={() => onFilterTag(tag)}
                        className={`px-3 py-1 rounded-full text-[10px] whitespace-nowrap border transition-all ${activeFilterTag === tag ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' : 'border-white/10 text-gray-500'}`}
                    >
                        #{tag}
                    </button>
                ))}
            </div>

            <div className="flex justify-between items-center text-[10px] font-mono text-gray-600">
                <span>SORT BY:</span>
                <div className="flex gap-3">
                    {['date', 'name', 'type'].map(s => (
                        <button 
                            key={s} 
                            onClick={() => onSortChange(s as any)}
                            className={`hover:text-white uppercase ${sortBy === s ? 'text-cyan-500 font-bold' : ''}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </div>
        </div>

        <div className="flex-grow overflow-y-auto custom-scrollbar">
            {memories.map(m => (
                <div 
                    key={m.id}
                    onClick={() => onSelect(m)}
                    className={`p-4 border-b border-white/5 cursor-pointer transition-all hover:bg-white/5 ${activeId === m.id ? 'bg-cyan-500/10 border-r-2 border-r-cyan-500' : ''}`}
                >
                    <div className="flex items-center gap-3 mb-1">
                        <div className={`w-2 h-2 rounded-full ${m.type === 'IMAGE' ? 'bg-purple-500' : m.type === 'DOCUMENT' ? 'bg-cyan-500' : 'bg-amber-500'}`} />
                        <h3 className={`text-xs font-bold truncate ${activeId === m.id ? 'text-cyan-400' : 'text-gray-300'}`}>{m.title}</h3>
                    </div>
                    <div className="text-[10px] text-gray-500 flex justify-between">
                        <span>{m.type}</span>
                        <span>{new Date(m.updatedAt).toLocaleDateString()}</span>
                    </div>
                </div>
            ))}
            {memories.length === 0 && (
                <div className="p-8 text-center text-xs text-gray-600 italic">No memories found</div>
            )}
        </div>
    </aside>
  );
};