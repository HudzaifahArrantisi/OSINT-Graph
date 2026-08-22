import React, { useState } from 'react';
import { ConfidenceBadge } from '../ui/ConfidenceBadge';
import { ExternalLink, ChevronDown, ChevronUp, Clock, ShieldCheck, Database } from 'lucide-react';
import type { Evidence } from '@nexusgraph/shared';

interface EvidenceCardProps {
  evidence: Evidence;
}

export function EvidenceCard({ evidence }: EvidenceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formattedDate = evidence.collected_at
    ? new Date(evidence.collected_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : 'Unknown date';

  return (
    <div className="bg-surface border border-border-subtle rounded-card p-3 transition-colors hover:border-border">
      {/* Header: Title & Confidence */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-text truncate" title={evidence.title || 'Observed Evidence'}>
            {evidence.title || 'Observed Evidence'}
          </h4>
          <span className="text-[10px] font-mono text-text-muted uppercase">
            {evidence.source_type} {evidence.collector ? `· ${evidence.collector}` : ''}
          </span>
        </div>
        <ConfidenceBadge score={evidence.confidence || 50} size="sm" />
      </div>

      {/* Provenance details */}
      <div className="flex flex-col gap-1 text-[11px] text-text-secondary my-2 font-mono">
        {evidence.source_url && (
          <div className="flex items-center gap-1.5 truncate">
            <Database className="w-3 h-3 text-text-muted shrink-0" />
            <a
              href={evidence.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover truncate flex items-center gap-1"
              title={evidence.source_url}
            >
              <span className="truncate">{evidence.source_url}</span>
              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
            </a>
          </div>
        )}

        <div className="flex items-center gap-1.5 text-text-muted">
          <Clock className="w-3 h-3 shrink-0" />
          <span>{formattedDate}</span>
        </div>
      </div>

      {/* Extracted value preview */}
      {evidence.extracted_value && (
        <div className="bg-surface-2 rounded-input p-2 mt-2 font-mono text-[11px] text-text-secondary overflow-x-auto max-h-24">
          <pre className="whitespace-pre-wrap">{evidence.extracted_value}</pre>
        </div>
      )}

      {/* Analyst notes if present */}
      {evidence.notes && (
        <div className="mt-2 text-xs text-text-muted italic border-l-2 border-primary/40 pl-2">
          Note: {evidence.notes}
        </div>
      )}

      {/* Raw Metadata Accordion */}
      {evidence.metadata && Object.keys(evidence.metadata).length > 0 && (
        <div className="mt-2 pt-2 border-t border-border-subtle/60">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center justify-between w-full text-[10px] text-text-muted hover:text-text"
          >
            <span>Raw Metadata</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {expanded && (
            <div className="mt-1.5 bg-surface-3 p-2 rounded-input font-mono text-[10px] text-text-muted overflow-x-auto max-h-32">
              <pre>{JSON.stringify(evidence.metadata, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
