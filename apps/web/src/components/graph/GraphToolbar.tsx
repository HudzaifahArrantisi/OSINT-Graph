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
    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 p-1.5 bg-surface/90 backdrop-blur-sm border border-border-subtle rounded-card shadow-xl select-none">
      {/* Zoom Controls */}
      <button
        onClick={() => zoomIn()}
        className="p-1.5 rounded-button text-text-secondary hover:text-text hover:bg-surface-2 transition-colors"
        title="Zoom In (+)"
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        onClick={() => zoomOut()}
        className="p-1.5 rounded-button text-text-secondary hover:text-text hover:bg-surface-2 transition-colors"
        title="Zoom Out (-)"
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <button
        onClick={() => fitView({ duration: 300 })}
        className="p-1.5 rounded-button text-text-secondary hover:text-text hover:bg-surface-2 transition-colors"
        title="Fit View (F)"
      >
        <Maximize2 className="w-4 h-4" />
      </button>

      <div className="w-[1px] h-5 bg-border-subtle mx-0.5" />

      {/* Layout Presets */}
      <div className="flex items-center gap-0.5 bg-surface-2 rounded-button p-0.5">
        <button
          onClick={() => handleLayoutChange('force')}
          className={`p-1 rounded-button text-xs transition-colors flex items-center gap-1 ${
            graphLayout === 'force'
              ? 'bg-primary text-white font-medium shadow-sm'
              : 'text-text-muted hover:text-text'
          }`}
          title="Force-directed layout"
        >
          <Network className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Force</span>
        </button>
        <button
          onClick={() => handleLayoutChange('hierarchical')}
          className={`p-1 rounded-button text-xs transition-colors flex items-center gap-1 ${
            graphLayout === 'hierarchical'
              ? 'bg-primary text-white font-medium shadow-sm'
              : 'text-text-muted hover:text-text'
          }`}
          title="Hierarchical layout"
        >
          <GitFork className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Tree</span>
        </button>
        <button
          onClick={() => handleLayoutChange('radial')}
          className={`p-1 rounded-button text-xs transition-colors flex items-center gap-1 ${
            graphLayout === 'radial'
              ? 'bg-primary text-white font-medium shadow-sm'
              : 'text-text-muted hover:text-text'
          }`}
          title="Radial layout"
        >
          <CircleDot className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Radial</span>
        </button>
      </div>

      <div className="w-[1px] h-5 bg-border-subtle mx-0.5" />

      {/* High-Performance Clustering Mode Toggle */}
      {onToggleClusterMode && (
        <button
          onClick={onToggleClusterMode}
          className={`px-2.5 py-1 rounded-button text-xs transition-all flex items-center gap-1.5 ${
            clusterMode
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 font-semibold shadow-sm shadow-cyan-950/40'
              : 'text-text-secondary hover:text-text hover:bg-surface-2 border border-transparent'
          }`}
          title={
            clusterMode
              ? 'Cluster View active (Large categories grouped into hubs). Click for expanded individual nodes.'
              : 'Switch to Cluster Hub mode (Recommended for high performance on 100+ entities)'
          }
        >
          <Layers className={`w-3.5 h-3.5 ${clusterMode ? 'text-cyan-400' : 'text-text-muted'}`} />
          <span className="text-[11px]">{clusterMode ? 'Clusters' : 'All Nodes'}</span>
          {totalNodeCount > 50 && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-surface-3 text-text-muted font-mono font-bold">
              {totalNodeCount}
            </span>
          )}
        </button>
      )}

      {/* Level of Detail Label Toggle */}
      {onToggleLabelMode && (
        <button
          onClick={onToggleLabelMode}
          className={`px-2 py-1 rounded-button text-xs transition-colors flex items-center gap-1 font-mono ${
            labelMode === 'always'
              ? 'bg-primary/20 text-primary border border-primary/40 font-semibold'
              : labelMode === 'hover'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                : 'text-text-muted hover:text-text hover:bg-surface-2 border border-transparent'
          }`}
          title={`Label visibility: ${
            labelMode === 'always'
              ? 'Always visible'
              : labelMode === 'hover'
                ? 'Visible on Hover only (Fastest)'
                : 'Auto (Smart Level of Detail)'
          }`}
        >
          <span className="font-bold text-[11px]">T</span>
          <span className="text-[10px] uppercase">
            {labelMode === 'always' ? 'ON' : labelMode === 'hover' ? 'HOVER' : 'AUTO'}
          </span>
        </button>
      )}

      <div className="w-[1px] h-5 bg-border-subtle mx-0.5" />

      {/* Filter & Search Toggles */}
      <button
        onClick={onToggleSearch}
        className={`p-1.5 rounded-button transition-colors ${
          searchOpen
            ? 'bg-primary/20 text-primary border border-primary/40'
            : 'text-text-secondary hover:text-text hover:bg-surface-2'
        }`}
        title="Search entities (/)"
      >
        <Search className="w-4 h-4" />
      </button>

      <button
        onClick={onToggleFilter}
        className={`p-1.5 rounded-button transition-colors ${
          filterOpen
            ? 'bg-primary/20 text-primary border border-primary/40'
            : 'text-text-secondary hover:text-text hover:bg-surface-2'
        }`}
        title="Filter graph"
      >
        <Filter className="w-4 h-4" />
      </button>

      <button
        onClick={resetGraphFilter}
        className="p-1.5 rounded-button text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
        title="Reset filters"
      >
        <RotateCcw className="w-4 h-4" />
      </button>
    </div>
  );
}
