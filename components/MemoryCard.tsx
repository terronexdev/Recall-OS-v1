
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
  
  const renderIcon = () => {
    switch (memory.type) {
      case RecallType.IMAGE:
        return (
          <div className="w-full h-full overflow-hidden rounded-lg border border-white/10 bg-black/40">
            <img 
              src={`data:image/jpeg;base64,${memory.thumbnail}`} 
              className="w-full h-full object-cover"
              alt="thumbnail"
            />
          </div>
        );
      case RecallType.AUDIO:
      case RecallType.VIDEO:
        return (
          <div className="w-full h-full flex items-center justify-center bg-indigo-500/10 rounded-lg border border-indigo-500/30">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-full h-full flex flex-col items-center justify-center bg-cyan-500/10 rounded-lg border border-cyan-500/30">
            <span className="font-mono text-xl font-bold text-cyan-400 opacity-60">Aa</span>
          </div>
        );
    }
  };

  return (
    <div 
      className={`absolute flex flex-col group cursor-pointer transition-all duration-200 hover:-translate-y-1 ${className}`}
      style={style}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <div className="w-36 h-36 p-1 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md shadow-2xl group-hover:bg-white/10 group-hover:border-white/20 transition-all">
        {renderIcon()}
      </div>

      <div className="mt-3 px-2">
        <h3 className="text-[11px] font-bold text-gray-200 truncate font-mono tracking-tight leading-tight">{memory.title}</h3>
        <div className="flex gap-1 mt-1">
          {memory.metadata.tags.slice(0, 1).map(t => (
            <span key={t} className="text-[9px] text-cyan-500 font-mono opacity-60">#{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
};
