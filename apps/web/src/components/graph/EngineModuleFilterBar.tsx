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
  Sparkles,
  Server,
  Building,
  Search,
  Mail,
  Target,
  Layers,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
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
  Sparkles,
  Server,
  Building,
  Search,
  Mail,
  Target,
  Layers,
};

export interface EngineModuleFilterBarProps {
  nodes: Array<{ id: string; data?: Record<string, any>; type?: string }>;
  selectedEngine: EngineModuleId | null;
  onSelectEngine: (engineId: EngineModuleId | null) => void;
  className?: string;
}

export function EngineModuleFilterBar({
  nodes,
  selectedEngine,
  onSelectEngine,
  className = '',
}: EngineModuleFilterBarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Aggregate node counts dynamically per engine module
  const engineStats = useMemo(() => {
    const counts = new Map<EngineModuleId, { meta: EngineModuleMeta; count: number }>();

    nodes.forEach((node) => {
      // Exclude hub nodes from the count
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

  // Check scroll boundaries
  const updateScrollButtons = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 6);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
  };

  useEffect(() => {
    updateScrollButtons();
    window.addEventListener('resize', updateScrollButtons);
    return () => window.removeEventListener('resize', updateScrollButtons);
  }, [engineStats, isCollapsed]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -220 : 220;
    el.scrollBy({ left: amount, behavior: 'smooth' });
    setTimeout(updateScrollButtons, 250);
  };

  if (engineStats.length <= 1) {
    return null; // No need to show filter dock if only 1 engine exists
  }

  // COLLAPSED MINIMAL PILL
  if (isCollapsed) {
    return (
      <button
        onClick={() => setIsCollapsed(false)}
        className={`flex items-center gap-2 px-3.5 py-1.5 bg-[#0b0f19]/95 hover:bg-[#121826] backdrop-blur-xl border border-[#1f293d] hover:border-sky-500/60 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.85)] text-xs font-mono text-slate-200 transition-all cursor-pointer group select-none animate-in fade-in duration-150 ${className}`}
        title="Buka panel kategori modul discovery"
      >
        <Sparkles className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
        <span className="font-medium text-[11px] text-slate-300">Modul Engine:</span>
        <span className="text-[11px] font-semibold text-white">{engineStats.length} Kategori</span>

        {/* Mini color dot preview */}
        <div className="flex items-center -space-x-1 px-1">
          {engineStats.slice(0, 5).map(({ meta }) => (
            <span
              key={meta.id}
              className="w-2 h-2 rounded-full ring-1 ring-[#0b0f19]"
              style={{ backgroundColor: meta.color }}
            />
          ))}
          {engineStats.length > 5 && (
            <span className="text-[9px] text-slate-400 pl-1.5 font-mono">+{engineStats.length - 5}</span>
          )}
        </div>

        {activeMeta ? (
          <span
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border"
            style={{
              backgroundColor: `${activeMeta.color}20`,
              color: activeMeta.color,
              borderColor: `${activeMeta.color}50`,
            }}
          >
            {activeMeta.shortName}
          </span>
        ) : (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/50">
            {totalDiscoveredCount} entitas
          </span>
        )}

        <ChevronUp className="w-3.5 h-3.5 text-slate-400 group-hover:text-white transition-colors" />
      </button>
    );
  }

  // EXPANDED WORKSTATION CONTROL DOCK
  return (
    <div
      className={`flex flex-col gap-1.5 bg-[#0a0e17]/95 backdrop-blur-xl border border-[#1d263b] px-3 py-2 rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.85)] text-xs select-none max-w-[92vw] sm:max-w-[calc(100vw-360px)] md:max-w-[calc(100vw-450px)] transition-all animate-in fade-in slide-in-from-bottom-2 duration-150 ${className}`}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between gap-3 px-1 border-b border-slate-800/60 pb-1.5">
        <div className="flex items-center gap-2 font-mono">
          <div className="flex items-center gap-1.5 text-sky-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-200">
              Modul Engine
            </span>
          </div>
          <span className="text-slate-600">·</span>
          <span className="text-[10px] text-slate-400 font-normal">
            {engineStats.length} kategori ({totalDiscoveredCount} total entitas)
          </span>
        </div>

        {/* Actions (Reset & Minimize) */}
        <div className="flex items-center gap-1.5">
          {selectedEngine && (
            <button
              onClick={() => onSelectEngine(null)}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30 transition-all cursor-pointer"
              title="Kembalikan tampilan seluruh graf"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              <span>Reset Spotlight</span>
            </button>
          )}

          <button
            onClick={() => setIsCollapsed(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-mono text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
            title="Sembunyikan dock navigasi modul"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span className="text-[10px] hidden sm:inline">Minimize</span>
          </button>
        </div>
      </div>

      {/* Module Scroll Track Container */}
      <div className="relative flex items-center">
        {/* Scroll Left Button */}
        {canScrollLeft && (
          <button
            onClick={() => handleScroll('left')}
            className="absolute left-0 z-10 p-1 rounded-full bg-[#0a0e17]/95 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-400 shadow-md transition-all -ml-2"
            title="Scroll ke kiri"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Scrollable Track */}
        <div
          ref={scrollContainerRef}
          onScroll={updateScrollButtons}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5 px-0.5 w-full"
        >
          {/* "Semua" Reset Button */}
          <button
            onClick={() => onSelectEngine(null)}
            className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-mono transition-all shrink-0 cursor-pointer border ${
              selectedEngine === null
                ? 'bg-white text-black font-semibold border-white shadow-sm'
                : 'bg-[#111624] text-slate-400 hover:text-white hover:bg-slate-800/80 border-slate-800'
            }`}
            title="Tampilkan seluruh node graf tanpa isolasi"
          >
            <Layers className="w-3 h-3" />
            <span>Semua</span>
            <span
              className={`text-[9.5px] px-1.5 py-0.2 rounded font-semibold ${
                selectedEngine === null ? 'bg-black/15 text-black' : 'bg-slate-800 text-slate-300'
              }`}
            >
              {totalDiscoveredCount}
            </span>
          </button>

          {/* Engine Module Pills */}
          {engineStats.map(({ meta, count }) => {
            const isSelected = selectedEngine === meta.id;
            const IconComponent = (meta.iconName && ENGINE_ICONS[meta.iconName]) || Layers;

            return (
              <button
                key={meta.id}
                onClick={() => onSelectEngine(isSelected ? null : meta.id)}
                className={`flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-[11px] font-mono transition-all shrink-0 cursor-pointer border ${
                  isSelected
                    ? 'font-semibold text-white ring-1'
                    : 'bg-[#0f1422] text-slate-300 hover:text-white hover:bg-[#161d30] border-slate-800/80 hover:border-slate-700'
                }`}
                style={{
                  backgroundColor: isSelected ? `${meta.color}25` : undefined,
                  borderColor: isSelected ? meta.color : undefined,
                  boxShadow: isSelected ? `0 0 14px ${meta.color}45` : undefined,
                }}
                title={`${meta.name} — ${meta.description} (${count} entitas)`}
              >
                {/* Glowing status dot */}
                <span
                  className="w-2 h-2 rounded-full shrink-0 transition-transform"
                  style={{
                    backgroundColor: meta.color,
                    boxShadow: isSelected ? `0 0 8px ${meta.color}` : undefined,
                  }}
                />

                <IconComponent className="w-3 h-3 shrink-0" style={{ color: meta.color }} />

                <span className="whitespace-nowrap max-w-[140px] truncate">{meta.shortName}</span>

                <span
                  className="text-[9.5px] px-1.5 py-0.2 rounded font-medium transition-colors"
                  style={{
                    backgroundColor: isSelected ? `${meta.color}40` : 'rgba(255, 255, 255, 0.07)',
                    color: isSelected ? '#ffffff' : meta.color,
                  }}
                >
                  {count}
                </span>

                {isSelected && <X className="w-2.5 h-2.5 ml-0.5 text-white/80 hover:text-white" />}
              </button>
            );
          })}
        </div>

        {/* Scroll Right Button */}
        {canScrollRight && (
          <button
            onClick={() => handleScroll('right')}
            className="absolute right-0 z-10 p-1 rounded-full bg-[#0a0e17]/95 border border-slate-700 text-slate-300 hover:text-white hover:border-sky-400 shadow-md transition-all -mr-2"
            title="Scroll ke kanan"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
