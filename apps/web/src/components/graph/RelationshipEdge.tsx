import { memo, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getStraightPath,
  EdgeProps,
} from '@xyflow/react';

export const RelationshipEdge = memo(
  ({
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    style = {},
    markerEnd,
    selected,
    data,
  }: EdgeProps) => {
    const [hovered, setHovered] = useState(false);
    const [edgePath, labelX, labelY] = getStraightPath({
      sourceX,
      sourceY,
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
          strokeWidth={14}
          className="cursor-pointer"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        />

        {/* Visible clean straight ray edge in monochrome */}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...(style || {}),
            stroke: selected ? '#ffffff' : hovered ? '#a3a3a3' : '#333333',
            strokeWidth: selected ? 1.75 : hovered ? 1.5 : 1,
            strokeDasharray: relType === 'CONTAINS' ? '3 3' : undefined,
            opacity: selected ? 1 : hovered ? 0.9 : 0.6,
            transition: 'stroke 0.1s ease, stroke-width 0.1s ease, opacity 0.1s ease',
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
                className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-medium border flex items-center gap-1.5 shadow-md select-none backdrop-blur-sm ${
                  selected
                    ? 'bg-[#181818]/95 border-white text-white'
                    : 'bg-[#0f0f0f]/95 border-[#2c2c2c] text-neutral-300 shadow-black/80'
                }`}
                title={`${relType} · ${confidence}% confidence\n${edgeData.reason || ''}`}
              >
                <span>{relType}</span>
                <span className="text-[9px] text-neutral-500">({confidence}%)</span>
              </div>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

RelationshipEdge.displayName = 'RelationshipEdge';
