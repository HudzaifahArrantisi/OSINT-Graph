import React, { useState, useRef, useEffect } from 'react';
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
  Route,
  Target,
  ChevronDown,
} from 'lucide-react';
import { useAppStore } from '../../stores/appStore';
import { useReactFlow } from '@xyflow/react';
import type { Node } from '@xyflow/react';

interface SeedTarget {
  id: string;
  label: string;
  count: number;
}

interface GraphToolbarProps {
  onToggleFilter: () => void;
  filterOpen: boolean;
  onToggleSearch: () => void;
  searchOpen: boolean;
  onTogglePathFinder?: () => void;
  pathFinderOpen?: boolean;
  onApplyLayout: (layout: 'force' | 'hierarchical' | 'radial') => void;
  clusterMode?: boolean;
  onToggleClusterMode?: () => void;
  labelMode?: 'auto' | 'always' | 'hover';
  onToggleLabelMode?: () => void;
  totalNodeCount?: number;
  seedTargets?: SeedTarget[];
  selectedSeedFilter?: string | null;
  onSelectSeedFilter?: (seedId: string | null) => void;
}

export function GraphToolbar({
  onToggleFilter,
  filterOpen,
  onToggleSearch,
  searchOpen,
  onTogglePathFinder,
  pathFinderOpen = false,
  onApplyLayout,
  clusterMode = false,
  onToggleClusterMode,
  labelMode = 'auto',
  onToggleLabelMode,
  totalNodeCount = 0,
  seedTargets = [],
  selectedSeedFilter = null,
  onSelectSeedFilter,
}: GraphToolbarProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { graphLayout, setGraphLayout, resetGraphFilter } = useAppStore();
  const [seedDropdownOpen, setSeedDropdownOpen] = useState(false);
  const seedDropdownRef = useRef<HTMLDivElement>(null);

  const handleLayoutChange = (layout: 'force' | 'hierarchical' | 'radial') => {
    setGraphLayout(layout);
    onApplyLayout(layout);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (seedDropdownRef.current && !seedDropdownRef.current.contains(e.target as HTMLElement)) {
        setSeedDropdownOpen(false);
      }
    };
    if (seedDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [seedDropdownOpen]);

  const selectedSeedLabel = selectedSeedFilter
    ? seedTargets.find((s) => s.id === selectedSeedFilter)?.label || 'Target'
    : `All Targets (${seedTargets.length})`;

  return (
    <div className="absolute top-4 left-4 z-10 flex items-center gap-1.5 p-1 bg-[#0a0a0a]/90 backdrop-blur-md border border-[#222222] rounded-lg shadow-2xl select-none">
      {/* Zoom Controls */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => zoomIn()}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-[#181818] transition-colors"
          title="Zoom In (+)"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => zoomOut()}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-[#181818] transition-colors"
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => fitView({ duration: 300 })}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-[#181818] transition-colors"
          title="Fit View (F)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[#222222] mx-0.5" />

      {/* Layout Presets */}
      <div className="flex items-center gap-0.5 bg-[#050505] border border-[#222222] rounded-md p-0.5">
        <button
          onClick={() => handleLayoutChange('force')}
          className={`px-2 py-1 rounded text-xs transition-colors flex items-center gap-1.5 font-sans ${
            graphLayout === 'force'
              ? 'bg-[#222222] text-white font-medium shadow-sm'
              : 'text-neutral-400 hover:text-white'
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
              ? 'bg-[#222222] text-white font-medium shadow-sm'
              : 'text-neutral-400 hover:text-white'
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
              ? 'bg-[#222222] text-white font-medium shadow-sm'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Radial layout"
        >
          <CircleDot className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">Radial</span>
        </button>
      </div>

      <div className="w-[1px] h-4 bg-[#222222] mx-0.5" />

      {/* Target Cluster Dropdown */}
      {seedTargets.length > 1 && onSelectSeedFilter && (
        <>
          <div className="relative" ref={seedDropdownRef}>
            <button
              onClick={() => setSeedDropdownOpen((prev) => !prev)}
              className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 font-mono border ${
                selectedSeedFilter
                  ? 'bg-white text-black border-white font-medium'
                  : 'bg-[#050505] text-neutral-300 hover:text-white border-[#222222] hover:border-neutral-500'
              }`}
              title="Filter graph by target seed cluster"
            >
              <Target className={`w-3 h-3 ${selectedSeedFilter ? 'text-black' : 'text-neutral-300'}`} />
              <span className="text-[11px] max-w-[140px] truncate">{selectedSeedLabel}</span>
              <ChevronDown className={`w-3 h-3 ${selectedSeedFilter ? 'text-black' : 'text-neutral-400'} transition-transform ${seedDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {seedDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#0a0a0a]/98 backdrop-blur-xl border border-[#262626] rounded-lg shadow-2xl py-1 z-50 animate-fade-in">
                <button
                  onClick={() => {
                    onSelectSeedFilter(null);
                    setSeedDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                    selectedSeedFilter === null
                      ? 'bg-[#1c1c1c] text-white font-medium'
                      : 'text-neutral-300 hover:bg-[#141414] hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-neutral-300" />
                  <span className="font-mono">All Targets ({seedTargets.length})</span>
                </button>

                <div className="h-[1px] bg-[#222222] mx-2 my-1" />

                {seedTargets.map((seed) => (
                  <button
                    key={seed.id}
                    onClick={() => {
                      onSelectSeedFilter(seed.id);
                      setSeedDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                      selectedSeedFilter === seed.id
                        ? 'bg-[#1c1c1c] text-white font-medium'
                        : 'text-neutral-300 hover:bg-[#141414] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Target className="w-3 h-3 shrink-0 text-neutral-400" />
                      <span className="font-mono truncate">{seed.label}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                      selectedSeedFilter === seed.id
                        ? 'bg-white text-black font-semibold'
                        : 'bg-[#1a1a1a] text-neutral-400'
                    }`}>
                      {seed.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#222222] mx-0.5" />
        </>
      )}

      {/* High-Performance Clustering Mode Toggle */}
      {onToggleClusterMode && (
        <button
          onClick={onToggleClusterMode}
          className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 font-sans border ${
            clusterMode
              ? 'bg-white text-black border-white font-medium'
              : 'text-neutral-400 hover:text-white hover:bg-[#181818] border-transparent'
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
            <span className={`text-[9px] px-1 py-0.2 rounded font-mono ${clusterMode ? 'bg-black/20 text-black' : 'bg-[#1c1c1c] text-neutral-400'}`}>
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
              ? 'bg-[#222222] text-white border-[#333333] font-medium'
              : labelMode === 'hover'
                ? 'bg-[#181818] text-neutral-300 border-[#262626]'
                : 'text-neutral-400 hover:text-white hover:bg-[#181818] border-transparent'
          }`}
          title="Toggle label visibility"
        >
          <span className="font-semibold text-[11px]">T</span>
          <span className="text-[9.5px] uppercase">
            {labelMode === 'always' ? 'ON' : labelMode === 'hover' ? 'HOVER' : 'AUTO'}
          </span>
        </button>
      )}

      <div className="w-[1px] h-4 bg-[#222222] mx-0.5" />

      {/* Path Finder Toggle */}
      {onTogglePathFinder && (
        <button
          onClick={onTogglePathFinder}
          className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 font-sans border ${
            pathFinderOpen
              ? 'bg-white text-black border-white font-medium'
              : 'text-neutral-400 hover:text-white hover:bg-[#181818] border-transparent'
          }`}
          title="Find shortest path between entities"
        >
          <Route className="w-3.5 h-3.5" />
          <span className="text-[11px] hidden sm:inline">Path</span>
        </button>
      )}

      {/* Filter & Search Toggles */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={onToggleFilter}
          className={`p-1.5 rounded-md transition-colors ${
            filterOpen
              ? 'bg-[#222222] text-white border border-[#333333]'
              : 'text-neutral-400 hover:text-white hover:bg-[#181818]'
          }`}
          title="Filter graph"
        >
          <Filter className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={resetGraphFilter}
          className="p-1.5 rounded-md text-neutral-400 hover:text-white hover:bg-[#181818] transition-colors"
          title="Reset filters"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
