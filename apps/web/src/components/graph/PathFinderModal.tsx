import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';
import {
  Route,
  ArrowUpDown,
  X,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { Node } from '@xyflow/react';
import type { PathResult } from '@nexusgraph/shared';

interface PathFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  caseId: string;
  nodes: Node[];
}

export function PathFinderModal({ isOpen, onClose, caseId, nodes }: PathFinderModalProps) {
  const { selectedNodeId, setHighlightedPath, addToast } = useAppStore();

  const [fromId, setFromId] = useState<string>('');
  const [toId, setToId] = useState<string>('');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [pathResult, setPathResult] = useState<PathResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter out cluster hub nodes — only actual entities can be traversed
  const entityNodes = useMemo(() => {
    return nodes
      .filter((n) => n.type !== 'cluster_hub' && !(n.data as any)?.isHub)
      .map((n) => {
        const d = (n.data || {}) as Record<string, any>;
        return {
          id: n.id,
          label: d.value || d.label || n.id,
          type: d.entityType || 'ENTITY',
          confidence: d.confidence || 50,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [nodes]);

  // Pre-fill fromId with selected node if available when modal opens
  useEffect(() => {
    if (isOpen) {
      if (selectedNodeId && entityNodes.some((e) => e.id === selectedNodeId)) {
        setFromId(selectedNodeId);
      } else if (entityNodes.length > 0 && !fromId) {
        setFromId(entityNodes[0].id);
      }
      if (entityNodes.length > 1 && !toId) {
        const other = entityNodes.find((e) => e.id !== selectedNodeId);
        if (other) setToId(other.id);
      }
      setPathResult(null);
      setErrorMsg(null);
    }
  }, [isOpen, selectedNodeId, entityNodes]);

  if (!isOpen) return null;

  const filteredFromNodes = entityNodes.filter(
    (e) =>
      e.label.toLowerCase().includes(fromSearch.toLowerCase()) ||
      e.type.toLowerCase().includes(fromSearch.toLowerCase()),
  );

  const filteredToNodes = entityNodes.filter(
    (e) =>
      e.label.toLowerCase().includes(toSearch.toLowerCase()) ||
      e.type.toLowerCase().includes(toSearch.toLowerCase()),
  );

  const handleSwap = () => {
    const temp = fromId;
    setFromId(toId);
    setToId(temp);
    setPathResult(null);
    setErrorMsg(null);
  };

  const handleFindPath = async () => {
    if (!fromId || !toId) {
      setErrorMsg('Please select both source and destination entities');
      return;
    }

    if (fromId === toId) {
      setErrorMsg('Source and destination must be different entities');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setPathResult(null);

    try {
      const res: PathResult = await api.graph.path(caseId, fromId, toId);
      setPathResult(res);

      if (res.found && res.hops.length > 0) {
        const nodeIds = res.hops.map((h) => h.entityId);
        const edgeIds = res.hops
          .map((h) => h.relationshipId)
          .filter((id): id is string => Boolean(id));

        setHighlightedPath({
          nodeIds,
          edgeIds,
          confidence: res.cumulativeConfidence,
        });

        addToast(
          `Path found: ${res.totalHops} hops with ${res.cumulativeConfidence}% confidence`,
          'success',
        );
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to calculate connection path');
    } finally {
      setLoading(false);
    }
  };

  const selectedFrom = entityNodes.find((e) => e.id === fromId);
  const selectedTo = entityNodes.find((e) => e.id === toId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-fade-in">
      <div className="bg-[#0a0a0a] border border-[#262626] rounded-modal shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1c1c1c] flex items-center justify-between bg-[#121212]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-[#1f1f1f] border border-[#2c2c2c] text-white">
              <Route className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white font-sans">
                Multi-Hop Path Finder
              </h3>
              <p className="text-[11px] text-neutral-400 font-sans">
                Find shortest connection chain between any two entities in this case
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white hover:bg-[#1a1a1a] rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Entity Selector Pair */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
            {/* Source Entity A */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center justify-between">
                <span>From Entity (A)</span>
                {selectedFrom && (
                  <span className="text-[9px] font-mono uppercase text-neutral-300 bg-[#1c1c1c] border border-[#2b2b2b] px-1 py-0.2 rounded">
                    {selectedFrom.type}
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search source entity..."
                  value={fromSearch}
                  onChange={(e) => setFromSearch(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded-input px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 font-mono"
                />
              </div>
              <div className="max-h-36 overflow-y-auto bg-[#050505] border border-[#222222] rounded-md p-1 space-y-0.5">
                {filteredFromNodes.length === 0 ? (
                  <div className="p-2 text-center text-[10px] text-neutral-500">
                    No matching entities
                  </div>
                ) : (
                  filteredFromNodes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setFromId(n.id);
                        setFromSearch('');
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer ${
                        fromId === n.id
                          ? 'bg-white text-black font-semibold'
                          : 'text-neutral-300 hover:bg-[#181818] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{n.label}</span>
                      <span className="text-[9px] opacity-70 uppercase shrink-0 ml-1">
                        {n.type}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Swap Button */}
            <div className="hidden sm:flex absolute left-1/2 top-7 -translate-x-1/2 z-10">
              <button
                onClick={handleSwap}
                className="p-1.5 rounded-full bg-[#121212] border border-[#262626] text-neutral-400 hover:text-white hover:border-neutral-500 shadow-md transition-colors cursor-pointer"
                title="Swap source and target"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Target Entity B */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-neutral-300 flex items-center justify-between">
                <span>To Entity (B)</span>
                {selectedTo && (
                  <span className="text-[9px] font-mono uppercase text-neutral-300 bg-[#1c1c1c] border border-[#2b2b2b] px-1 py-0.2 rounded">
                    {selectedTo.type}
                  </span>
                )}
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search target entity..."
                  value={toSearch}
                  onChange={(e) => setToSearch(e.target.value)}
                  className="w-full bg-[#121212] border border-[#262626] rounded-input px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-neutral-400 font-mono"
                />
              </div>
              <div className="max-h-36 overflow-y-auto bg-[#050505] border border-[#222222] rounded-md p-1 space-y-0.5">
                {filteredToNodes.length === 0 ? (
                  <div className="p-2 text-center text-[10px] text-neutral-500">
                    No matching entities
                  </div>
                ) : (
                  filteredToNodes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => {
                        setToId(n.id);
                        setToSearch('');
                      }}
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono flex items-center justify-between transition-colors cursor-pointer ${
                        toId === n.id
                          ? 'bg-white text-black font-semibold'
                          : 'text-neutral-300 hover:bg-[#181818] hover:text-white'
                      }`}
                    >
                      <span className="truncate">{n.label}</span>
                      <span className="text-[9px] opacity-70 uppercase shrink-0 ml-1">
                        {n.type}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={handleFindPath}
            disabled={loading || !fromId || !toId || fromId === toId}
            className="w-full py-2 px-4 rounded-input bg-white hover:bg-neutral-200 text-black font-semibold flex items-center justify-center gap-2 border border-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center gap-2 text-black">
                <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                Traversing Graph Subgraph...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-black">
                <Route className="w-4 h-4" />
                Trace Connection Path
              </span>
            )}
          </button>

          {/* Error notice */}
          {errorMsg && (
            <div className="p-3 rounded-md bg-[#161616] border border-[#2c2c2c] text-neutral-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-white" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Path Result Display */}
          {pathResult && (
            <div className="pt-2 border-t border-[#1c1c1c] space-y-3">
              {pathResult.found ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                      <span className="font-semibold text-white">
                        Path Connected ({pathResult.totalHops}{' '}
                        {pathResult.totalHops === 1 ? 'hop' : 'hops'})
                      </span>
                    </div>
                    <span className="font-mono text-xs text-white bg-[#1c1c1c] border border-[#2c2c2c] px-2 py-0.5 rounded font-semibold">
                      {pathResult.cumulativeConfidence}% confidence
                    </span>
                  </div>

                  {/* Chain of hops */}
                  <div className="space-y-1 bg-[#050505] border border-[#222222] rounded-card p-3">
                    {pathResult.hops.map((hop, idx) => (
                      <React.Fragment key={hop.entityId + idx}>
                        {/* Hop Node */}
                        <div className="flex items-center justify-between py-1 px-2 rounded bg-[#121212] border border-[#222222] font-mono text-[11px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-4 h-4 rounded-full bg-white text-black flex items-center justify-center text-[9px] font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-[#1c1c1c] text-neutral-300 border border-[#2b2b2b] shrink-0">
                              {hop.entityType}
                            </span>
                            <span className="text-white font-semibold truncate">
                              {hop.entityValue}
                            </span>
                          </div>
                          <span className="text-[10px] text-neutral-400 shrink-0">
                            {Math.round(hop.confidence)}%
                          </span>
                        </div>

                        {/* Relationship Link between hops */}
                        {hop.relationshipType && idx < pathResult.hops.length - 1 && (
                          <div className="flex items-center gap-2 pl-4 py-0.5 text-[10px] font-mono text-neutral-400">
                            <div className="w-px h-3 bg-[#2b2b2b] ml-1.5" />
                            <span className="text-neutral-300 bg-[#161616] px-1.5 py-0.2 rounded border border-[#262626]">
                              --[{hop.relationshipType}]--&gt;
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-[#121212] border border-[#222222] text-neutral-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-neutral-500 shrink-0" />
                  <span>
                    No connecting path found between these two entities in this case.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1c1c1c] bg-[#121212] flex items-center justify-between">
          <button
            onClick={() => {
              setHighlightedPath(null);
              addToast('Cleared path highlight', 'info');
            }}
            className="text-xs text-neutral-400 hover:text-white underline font-sans cursor-pointer"
          >
            Clear Highlight
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-btn bg-[#222222] hover:bg-[#2e2e2e] text-white text-xs font-semibold transition-colors cursor-pointer border border-[#333333]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
