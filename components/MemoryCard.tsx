import React from 'react';
import { RecallFile, RecallType } from '../types';

interface MemoryCardProps {
  memory: RecallFile;
  onClick: () => void;
  className?: string;
  style?: React.CSSProperties;
  onMouseDown?: (e: React.MouseEvent) => void;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ memory, onClick, className = '', style, onMouseDown }) => {
  
  // Render based on Type Archetypes
  const renderContent = () => {
    switch (memory.type) {
      case RecallType.DOCUMENT:
      case RecallType.TEXT:
        return (
          <div className="relative w-full h-full flex items-center justify-center">
            {/* The Stack Effect (Pages underneath) */}
            <div className="absolute top-2 left-1 right-1 bottom-0 bg-gray-700 rounded-lg shadow-sm transform translate-y-2 translate-x-1 border border-white/5" />
            <div className="absolute top-1 left-0.5 right-0.5 bottom-1 bg-gray-800 rounded-lg shadow-md transform translate-y-1 translate-x-0.5 border border-white/5" />
            
            {/* Main Slab */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg shadow-xl border-t border-white/20 border-b border-black/50 flex flex-col items-center justify-center p-6 group-hover:bg-gray-800 transition-colors">
                {/* 3D Glyph */}
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-500/20 to-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] mb-3">
                   <span className="font-mono text-xl font-bold text-cyan-400">Aa</span>
                </div>
                {/* Lines */}
                <div className="w-full space-y-2 opacity-30">
                   <div className="h-1 w-3/4 bg-gray-400 rounded-full" />
                   <div className="h-1 w-full bg-gray-400 rounded-full" />
                   <div className="h-1 w-5/6 bg-gray-400 rounded-full" />
                </div>
            </div>
          </div>
        );

      case RecallType.IMAGE:
      case RecallType.HYBRID:
        return (
          <div className="relative w-full h-full group-hover:brightness-110 transition-all">
             {/* Glass Frame */}
             <div className="absolute inset-0 bg-gray-900 rounded-lg shadow-2xl border-4 border-gray-800 overflow-hidden">
                <img 
                    src={`data:image/jpeg;base64,${memory.thumbnail}`} 
                    className="w-full h-full object-cover opacity-90"
                    alt="thumbnail"
                />
                {/* Gloss Reflection */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent pointer-events-none" />
             </div>
          </div>
        );

      case RecallType.AUDIO:
      case RecallType.VIDEO:
        return (
            <div className="relative w-full h-full flex items-center justify-center">
               {/* Device Body */}
               <div className="absolute inset-2 bg-gradient-to-b from-gray-800 to-black rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] border border-white/5 flex items-center justify-center overflow-hidden">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.1),transparent_70%)]" />
                   
                   {/* Interface */}
                   <div className="flex gap-1 items-center justify-center h-1/2 w-3/4">
                       {[1,2,3,4,5].map(i => (
                           <div key={i} className="w-1 bg-cyan-500 rounded-full animate-pulse" style={{height: `${Math.random() * 100}%`, animationDelay: `${i * 0.1}s`}} />
                       ))}
                   </div>
               </div>
            </div>
        );
        
      default:
        return <div className="w-full h-full bg-gray-800 rounded-lg" />;
    }
  };

  return (
    <div 
      className={`absolute flex flex-col items-center group cursor-pointer memory-card-3d ${className}`}
      style={style}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
        {/* The 3D Object */}
        <div className="w-32 h-32 relative preserve-3d">
            {renderContent()}
            
            {/* Dynamic Shadow (scales on hover via CSS) */}
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-24 h-4 bg-black/40 blur-lg rounded-[100%] transition-all duration-300 group-hover:scale-125 group-hover:bg-black/60 group-hover:blur-xl pointer-events-none -z-10" />
        </div>

        {/* Floating Label */}
        <div className="mt-4 opacity-80 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10 max-w-[200px] text-center">
            <h3 className="text-[10px] font-bold text-gray-200 truncate font-mono tracking-wide">{memory.title}</h3>
            <div className="flex justify-center gap-1 mt-0.5">
                 {memory.metadata.tags.slice(0, 1).map(t => (
                     <span key={t} className="text-[8px] text-cyan-400">#{t}</span>
                 ))}
            </div>
        </div>
    </div>
  );
};
