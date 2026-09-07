import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  EngineModuleId,
  EngineModuleMeta,
  getNodeEngineModule,
} from '@nexusgraph/shared';
import {
  Archive,
  Code2,
  ShieldAlert,
  Radar,
  Cpu,
  AlertTriangle,
  ShieldCheck,
  Globe2,
  Key,
  Radio,
  Server,
  Building,
  Search,
  Mail,
  Target,
  Layers,
  FolderSearch,
  MapPin,
  X,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';

const ENGINE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Archive,
  Code2,
  ShieldAlert,
  Radar,
  Cpu,
  AlertTriangle,
  ShieldCheck,
  Globe2,
  Key,
  Radio,
  Server,
  Building,
  Search,
  Mail,
  Target,
  Layers,
  FolderSearch,
  MapPin,
};

export interface EngineModuleFilterBarProps {
  nodes: Array<{ id: string; data?: Record<string, any>; type?: string }>;
  selectedEngine: EngineModuleId | null;
  onSelectEngine: (engineId: EngineModuleId | null) => void;
  className?: string;
}

const MAX_VISIBLE_PILLS = 5;

export function EngineModuleFilterBar({
  nodes,
  selectedEngine,
  onSelectEngine,
  className = '',
}: EngineModuleFilterBarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Aggregate node counts per engine module
  const engineStats = useMemo(() => {
    const counts = new Map<EngineModuleId, { meta: EngineModuleMeta; count: number }>();

    nodes.forEach((node) => {
      if (node.type === 'cluster_hub' || (node.data as any)?.isHub) return;
      const data = node.data || {};
      const meta = getNodeEngineModule(data);
      const existing = counts.get(meta.id);
      if (existing) {
        existing.count++;
      } else {
        counts.set(meta.id, { meta, count: 1 });
      }
    });

    // Sort: seed first, then by count descending
    return Array.from(counts.values()).sort((a, b) => {
      if (a.meta.id === 'engine_seed') return -1;
      if (b.meta.id === 'engine_seed') return 1;
      return b.count - a.count;
    });
  }, [nodes]);

  const totalDiscoveredCount = useMemo(() => {
    return nodes.filter((n) => n.type !== 'cluster_hub' && !(n.data as any)?.isHub).length;
  }, [nodes]);

  const activeMeta = useMemo(() => {
    if (!selectedEngine) return null;
    return engineStats.find((s) => s.meta.id === selectedEngine)?.meta || null;
  }, [selectedEngine, engineStats]);

  // Divide into prominent visible pills and remaining overflow pills
  const { visibleEngines, overflowEngines } = useMemo(() => {
    if (engineStats.length <= MAX_VISIBLE_PILLS) {
      return { visibleEngines: engineStats, overflowEngines: [] };
    }

    // If selected engine is beyond top pills, promote it so it is immediately visible and clearable
    const isSelectedInTop =
      selectedEngine &&
      engineStats.slice(0, MAX_VISIBLE_PILLS).some((s) => s.meta.id === selectedEngine);

    if (selectedEngine && !isSelectedInTop) {
      const selectedItem = engineStats.find((s) => s.meta.id === selectedEngine);
      const topItems = engineStats
        .filter((s) => s.meta.id !== selectedEngine)
        .slice(0, MAX_VISIBLE_PILLS - 1);
      const visible = selectedItem ? [...topItems, selectedItem] : topItems;
      const visibleIds = new Set(visible.map((s) => s.meta.id));
      const overflow = engineStats.filter((s) => !visibleIds.has(s.meta.id));
      return { visibleEngines: visible, overflowEngines: overflow };
    }

    return {
      visibleEngines: engineStats.slice(0, MAX_VISIBLE_PILLS),
      overflowEngines: engineStats.slice(MAX_VISIBLE_PILLS),
    };
  }, [engineStats, selectedEngine]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  if (engineStats.length <= 1) {
    return null;
  }

  // COLLAPSED MINIMAL CHIP: Extremely discreet, 0% obstruction
  if (isCollapsed) {
    return (
      <div className={`flex items-center ${className}`}>
        <button
          onClick={() => setIsCollapsed(false)}
          className="flex items-center gap-2 h-7 px-2.5 bg-[#080808]/95 hover:bg-[#141414] backdrop-blur-md border border-[#222222] hover:border-neutral-600 rounded-md text-xs text-neutral-300 transition-colors shadow-lg shadow-black/50 cursor-pointer"
          title="Tampilkan filter modul"
        >
          <Layers className="w-3.5 h-3.5 text-neutral-400" />
          <span className="text-[11px] font-sans text-neutral-300">Modul:</span>

          {activeMeta ? (
            <span className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-black font-semibold border border-white">
              <span>{activeMeta.shortName}</span>
              <span
                role="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectEngine(null);
                }}
                className="hover:opacity-75 cursor-pointer ml-0.5"
                title="Hapus filter"
              >
                <X className="w-2.5 h-2.5" />
              </span>
            </span>
          ) : (
            <span className="text-[10px] font-mono text-neutral-400">
              Semua ({totalDiscoveredCount})
            </span>
          )}

          <ChevronUp className="w-3.5 h-3.5 text-neutral-500 hover:text-neutral-300 ml-0.5" />
        </button>
      </div>
    );
  }

  // COMPACT MONOCHROME DOCK: Clean, fixed-width, zero-clutter
  return (
    <div className={`relative select-none ${className}`}>
      <div className="flex items-center gap-1 bg-[#080808]/95 backdrop-blur-md border border-[#222222] rounded-md p-1 shadow-xl shadow-black/60 text-xs">
        {/* "Semua" Button */}
        <button
          onClick={() => onSelectEngine(null)}
          className={`flex items-center gap-1.5 h-7 px-2.5 rounded text-[11px] font-sans transition-colors cursor-pointer border ${
            selectedEngine === null
              ? 'bg-white text-black font-semibold border-white shadow-sm'
              : 'bg-transparent text-neutral-400 hover:text-white hover:bg-[#181818] border-transparent'
          }`}
          title="Tampilkan semua modul"
        >
          <span>Semua</span>
          <span
            className={`font-mono text-[10px] px-1 py-0.2 rounded ${
              selectedEngine === null
                ? 'bg-black/15 text-black'
                : 'text-neutral-400 bg-black/60 border border-neutral-800'
            }`}
          >
            {totalDiscoveredCount}
          </span>
        </button>

        {/* Separator */}
        <div className="w-[1px] h-4 bg-[#222222] mx-0.5 shrink-0" />

        {/* Top Active Module Pills (Always fits, never cuts off) */}
        <div className="flex items-center gap-1">
          {visibleEngines.map(({ meta, count }) => {
            const isSelected = selectedEngine === meta.id;
            const IconComponent = (meta.iconName && ENGINE_ICONS[meta.iconName]) || Layers;

            return (
              <button
                key={meta.id}
                onClick={() => onSelectEngine(isSelected ? null : meta.id)}
                className={`flex items-center gap-1.5 h-7 px-2 rounded text-[11px] font-sans transition-colors shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'bg-white text-black font-semibold border-white shadow-sm'
                    : 'bg-[#121212] text-neutral-300 hover:text-white hover:bg-[#1a1a1a] border-[#222222] hover:border-neutral-700'
                }`}
                title={`${meta.name} (${count} entitas)`}
              >
                <IconComponent
                  className={`w-3 h-3 shrink-0 ${isSelected ? 'text-black' : 'text-neutral-400'}`}
                />

                <span className="whitespace-nowrap max-w-[100px] truncate">
                  {meta.shortName}
                </span>

                <span
                  className={`font-mono text-[9.5px] px-1 py-0.2 rounded ${
                    isSelected
                      ? 'bg-black/15 text-black font-medium'
                      : 'text-neutral-400 bg-black/60 border border-neutral-800'
                  }`}
                >
                  {count}
                </span>

                {isSelected && (
                  <X
                    className="w-3 h-3 ml-0.5 text-black/70 hover:text-black"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEngine(null);
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Overflow Dropdown: Neat compact popup for remaining modules */}
        {overflowEngines.length > 0 && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className={`flex items-center gap-1 h-7 px-2 rounded text-[11px] font-sans border transition-colors cursor-pointer ${
                dropdownOpen
                  ? 'bg-[#222222] text-white border-neutral-600'
                  : 'bg-[#121212] text-neutral-400 hover:text-white hover:bg-[#1a1a1a] border-[#222222]'
              }`}
              title="Pilih modul lainnya"
            >
              <span>+{overflowEngines.length} Lainnya</span>
              <ChevronDown
                className={`w-3 h-3 text-neutral-400 transition-transform ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Compact Clean Dropdown (Max height 240px, unobtrusive) */}
            {dropdownOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-56 max-h-60 bg-[#0a0a0a]/98 backdrop-blur-md border border-[#262626] rounded-md shadow-2xl shadow-black/80 py-1 z-30 overflow-y-auto divide-y divide-[#1e1e1e] animate-in fade-in zoom-in-95 duration-75">
                <div className="px-2.5 py-1 text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
                  Modul Lainnya ({overflowEngines.length})
                </div>

                <div className="py-0.5 space-y-0.5">
                  {overflowEngines.map(({ meta, count }) => {
                    const IconComponent = (meta.iconName && ENGINE_ICONS[meta.iconName]) || Layers;

                    return (
                      <button
                        key={meta.id}
                        onClick={() => {
                          onSelectEngine(meta.id);
                          setDropdownOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 text-left text-neutral-300 hover:text-white hover:bg-[#161616] transition-colors cursor-pointer"
                        title={meta.description}
                      >
                        <div className="flex items-center gap-2 truncate pr-2">
                          <IconComponent className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                          <span className="text-[11px] font-sans truncate">{meta.shortName}</span>
                        </div>
                        <span className="text-[9.5px] font-mono text-neutral-400 bg-[#161616] px-1.5 py-0.5 rounded border border-[#262626] shrink-0">
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Separator */}
        <div className="w-[1px] h-4 bg-[#222222] mx-0.5 shrink-0" />

        {/* Minimize Button */}
        <button
          onClick={() => {
            setIsCollapsed(true);
            setDropdownOpen(false);
          }}
          className="p-1 rounded text-neutral-500 hover:text-neutral-300 hover:bg-[#181818] transition-colors cursor-pointer"
          title="Sembunyikan bilah modul"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
