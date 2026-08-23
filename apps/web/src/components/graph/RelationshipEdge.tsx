import { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  EdgeProps,
} from '@xyflow/react';

export const RelationshipEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    selected,
    data,
  }: EdgeProps) => {
    const [hovered, setHovered] = useState(false);
    const [edgePath, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetPosition,
      targetX,
      targetY,
    });

    const edgeData = (data || {}) as Record<string, any>;
    const relType = edgeData.relationshipType || 'RELATED_TO';
    const confidence = edgeData.confidence || 50;
    const showLabel = selected || hovered;

    return (
      <>
        {/* Invisible wider stroke for easy hover detection */}
        <path
          d={edgePath}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          className="cursor-pointer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />

        {/* Visible clean connection edge */}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...(style || {}),
            stroke: selected ? '#38bdf8' : hovered ? '#60a5fa' : 'rgba(100, 116, 139, 0.3)',
            strokeWidth: selected ? 2 : hovered ? 1.8 : 1,
            opacity: selected ? 1 : hovered ? 0.9 : 0.5,
            transition: 'stroke 0.15s ease, stroke-width 0.15s ease, opacity 0.15s ease',
          }}
        />

        {/* Label only appears on hover or when selected */}
        {showLabel && (
          <EdgeLabelRenderer>
            <div
              style={{
                position: 'absolute',
                transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                pointerEvents: 'all',
              }}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              className="z-30 cursor-pointer animate-fade-in"
            >
              <div
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border flex items-center gap-1.5 shadow-lg select-none backdrop-blur-sm ${
                  selected
                    ? 'bg-[#111827]/95 border-sky-500 text-sky-300 shadow-sky-950/40'
                    : 'bg-[#0e1420]/95 border-slate-700 text-slate-200 shadow-black/50'
                }`}
                title={`${relType} · ${confidence}% confidence\n${edgeData.reason || ''}`}
              >
                <span>{relType}</span>
                <span className="text-[9px] text-slate-400">({confidence}%)</span>
              </div>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

RelationshipEdge.displayName = 'RelationshipEdge';
