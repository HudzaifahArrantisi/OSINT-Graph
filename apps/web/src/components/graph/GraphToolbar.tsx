import React from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  Search,
  RotateCcw,
  Network,
  GitFork,
  CircleDot,
  Layers,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useReactFlow } from '@xyflow/react';

interface GraphToolbarProps {
  onToggleFilter: () => void;
  filterOpen: boolean;
  onToggleSearch: () => void;
  searchOpen: boolean;
  onApplyLayout: (layout: 'force' | 'hierarchical' | 'radial') => void;
  clusterMode?: boolean;
  onToggleClusterMode?: () => void;
  labelMode?: 'auto' | 'always' | 'hover';
  onToggleLabelMode?: () => void;
  totalNodeCount?: number;
}

export function GraphToolbar({
  onToggleFilter,
  filterOpen,
  onToggleSearch,
  searchOpen,
  onApplyLayout,
  clusterMode = false,
  onToggleClusterMode,
  labelMode = 'auto',
  onToggleLabelMode,
  totalNodeCount = 0,
}: GraphToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { graphLayout, setGraphLayout, resetGraphFilter } = useAppStore();

  const handleLayoutChange = (layout: 'force' | 'hierarchical' | 'radial') => {
    setGraphLayout(layout);
    onApplyLayout(layout);
  };

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 p-1 bg-[#0b101b]/90 backdrop-blur-md border border-[#1e293b] rounded-lg shadow-lg select-none">
      {/* Zoom Controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => zoomIn()}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => zoomOut()}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => fitView({ duration: 300 })}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
          title="Fit View (F)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[#1e293b] mx-0.5" />

      {/* Layout Presets */}
      <div className="flex items-center gap-0.5 bg-[#080d16] border border-[#1e293b] rounded-md p-0.5">
        <button
          onClick={() => handleLayoutChange('force')}
          className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 font-sans ${
            graphLayout === 'force'
              ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Force-directed layout"
        >
          <Network className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Force</span>
        </button>
        <button
          onClick={() => handleLayoutChange('hierarchical')}
          className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 font-sans ${
            graphLayout === 'hierarchical'
              ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Hierarchical layout"
        >
          <GitFork className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Tree</span>
        </button>
        <button
          onClick={() => handleLayoutChange('radial')}
          className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 font-sans ${
            graphLayout === 'radial'
              ? 'bg-slate-800 text-slate-100 font-medium shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Radial layout"
        >
          <CircleDot className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Radial</span>
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[#1e293b] mx-0.5" />

      {/* High-Performance Clustering Mode Toggle */}
      {onToggleClusterMode && (
        <button
          onClick={onToggleClusterMode}
          className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 font-sans border ${
            clusterMode
              ? 'bg-slate-800/90 text-sky-300 border-sky-500/40 font-medium'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'
          }`}
          title={
            clusterMode
              ? 'Cluster View active'
              : 'Switch to Cluster Hub mode'
          }
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="text-[11px]">{clusterMode ? 'Clusters' : 'All Nodes'}</span>
          {totalNodeCount > 50 && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
              {totalNodeCount}
            </span>
          )}
        </button>
      )}

      {/* Level of Detail Label Toggle */}
      {onToggleLabelMode && (
        <button
          onClick={onToggleLabelMode}
          className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1 font-mono border ${
            labelMode === 'always'
              ? 'bg-slate-800 text-slate-200 border-slate-700 font-medium'
              : labelMode === 'hover'
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'
          }`}
          title="Toggle label visibility"
        >
          <span className="font-semibold text-[11px]">T</span>
          <span className="text-[9.5px] uppercase">
            {labelMode === 'always' ? 'ON' : labelMode === 'hover' ? 'HOVER' : 'AUTO'}
          </span>
        </button>
      )}

      <div className="w-[1px] h-4 bg-[#1e293b] mx-0.5" />

      {/* Filter & Search Toggles */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onToggleSearch}
          className={`p-1.5 rounded-md transition-colors ${
            searchOpen
              ? 'bg-slate-800 text-slate-100 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
          }`}
          title="Search entities (/)"
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleFilter}
          className={`p-1.5 rounded-md transition-colors ${
            filterOpen
              ? 'bg-slate-800 text-slate-100 border border-slate-700'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
          }`}
          title="Filter graph"
        >
          <Filter className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={resetGraphFilter}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
          title="Reset filters"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
