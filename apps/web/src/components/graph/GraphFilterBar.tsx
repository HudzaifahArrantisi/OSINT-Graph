import React from 'react';
import { useAppStore } from '../../stores/appStore';
import { ENTITY_TYPES, RELATIONSHIP_TYPES, EntityType } from '@nexusgraph/shared';
import { X, SlidersHorizontal } from 'lucide-react';
import { Badge } from '../ui/Badge';

interface GraphFilterBarProps {
  onClose: () => void;
}

export function GraphFilterBar({ onClose }: GraphFilterBarProps) {
  const { graphFilter, setGraphFilter, resetGraphFilter } = useAppStore();

  const toggleEntityType = (type: EntityType) => {
    const current = graphFilter.entityTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setGraphFilter({ entityTypes: next });
  };

  return (
    <div className="absolute top-16 left-4 z-10 w-80 bg-surface/95 backdrop-blur-md border border-border-subtle rounded-card shadow-2xl p-4 animate-slide-in-up">
      <div className="flex items-center justify-between pb-2 mb-3 border-b border-border-subtle">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-text">
          <SlidersHorizontal className="w-3.5 h-3.5 text-primary" />
          <span>Graph Filters</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetGraphFilter}
            className="text-[11px] text-text-muted hover:text-text px-1.5 py-0.5 rounded-button"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text rounded-button"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Confidence Slider */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-text-secondary">Min Confidence</span>
          <span className="font-mono text-primary font-medium">
            {graphFilter.confidenceMin}%
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="100"
          step="5"
          value={graphFilter.confidenceMin}
          onChange={(e) => setGraphFilter({ confidenceMin: Number(e.target.value) })}
          className="w-full h-1.5 bg-surface-3 rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-[10px] text-text-muted mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Entity Type Filter */}
      <div className="mb-2">
        <span className="text-xs text-text-secondary block mb-2 font-medium">
          Entity Types {graphFilter.entityTypes.length > 0 && `(${graphFilter.entityTypes.length})`}
        </span>
        <div className="flex flex-wrap gap-1 max-h-36 overflow-y-auto pr-1">
          {ENTITY_TYPES.map((type) => {
            const isSelected = graphFilter.entityTypes.includes(type);
            return (
              <button
                key={type}
                onClick={() => toggleEntityType(type)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-all duration-micro ${
                  isSelected
                    ? 'bg-primary/20 text-primary border-primary/50 font-medium'
                    : 'bg-surface-2 text-text-muted border-border-subtle hover:text-text hover:border-border'
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
