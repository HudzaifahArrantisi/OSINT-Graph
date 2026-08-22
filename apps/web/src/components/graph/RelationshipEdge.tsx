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
            stroke: selected ? '#7c6cff' : hovered ? '#9e92ff' : 'rgba(148, 163, 184, 0.25)',
            strokeWidth: selected ? 2.5 : hovered ? 2 : 1.2,
            opacity: selected ? 1 : hovered ? 0.9 : 0.45,
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
                className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border flex items-center gap-1.5 shadow-xl select-none backdrop-blur-md ${
                  selected
                    ? 'bg-surface-2/95 border-primary text-primary shadow-primary/30'
                    : 'bg-surface/95 border-border text-text shadow-black/50'
                }`}
                title={`${relType} · ${confidence}% confidence\n${edgeData.reason || ''}`}
              >
                <span>{relType}</span>
                <span className="text-[9px] text-text-muted">({confidence}%)</span>
              </div>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  },
);

RelationshipEdge.displayName = 'RelationshipEdge';
