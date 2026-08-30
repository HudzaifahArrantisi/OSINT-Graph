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

      {/* Target Cluster Dropdown — replaces the floating pill bar */}
      {seedTargets.length > 1 && onSelectSeedFilter && (
        <>
          <div className="relative" ref={seedDropdownRef}>
            <button
              onClick={() => setSeedDropdownOpen((prev) => !prev)}
              className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 font-mono border ${
                selectedSeedFilter
                  ? 'bg-amber-500/15 text-amber-200 border-amber-500/40 font-medium'
                  : 'bg-[#080d16] text-slate-300 hover:text-slate-100 border-[#1e293b] hover:border-slate-600'
              }`}
              title="Filter graph by target seed cluster"
            >
              <Target className="w-3 h-3 text-amber-400" />
              <span className="text-[11px] max-w-[140px] truncate">{selectedSeedLabel}</span>
              <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${seedDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {seedDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-[#0d1220]/98 backdrop-blur-xl border border-[#1e293b] rounded-lg shadow-2xl py-1 z-50 animate-in fade-in slide-in-from-top-1 duration-100">
                <button
                  onClick={() => {
                    onSelectSeedFilter(null);
                    setSeedDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                    selectedSeedFilter === null
                      ? 'bg-sky-500/10 text-sky-200 font-medium'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span className="font-mono">All Targets ({seedTargets.length})</span>
                </button>

                <div className="h-[1px] bg-[#1e293b] mx-2 my-1" />

                {seedTargets.map((seed) => (
                  <button
                    key={seed.id}
                    onClick={() => {
                      onSelectSeedFilter(seed.id);
                      setSeedDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                      selectedSeedFilter === seed.id
                        ? 'bg-amber-500/10 text-amber-200 font-medium'
                        : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Target className={`w-3 h-3 shrink-0 ${selectedSeedFilter === seed.id ? 'text-amber-400' : 'text-amber-500/60'}`} />
                      <span className="font-mono truncate">{seed.label}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                      selectedSeedFilter === seed.id
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {seed.count}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-[1px] h-4 bg-[#1e293b] mx-0.5" />
        </>
      )}

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

      {/* Path Finder Toggle */}
      {onTogglePathFinder && (
        <button
          onClick={onTogglePathFinder}
          className={`px-2 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5 font-sans border ${
            pathFinderOpen
              ? 'bg-sky-500/20 text-sky-200 border-sky-500/50 font-medium'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border-transparent'
          }`}
          title="Find shortest path between entities"
        >
          <Route className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-[11px] hidden sm:inline">Path</span>
        </button>
      )}

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
