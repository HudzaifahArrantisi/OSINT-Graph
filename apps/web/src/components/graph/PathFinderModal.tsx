import React, { useState, useMemo, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAppStore } from '../../stores/appStore';
import {
  Route,
  ArrowRight,
  ArrowUpDown,
  Search,
  X,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Layers,
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
        // pick second entity if available
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0c1017] border border-[#1e293b] rounded-lg shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#1e293b] flex items-center justify-between bg-[#101622]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-400">
              <Route className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 font-sans">
                Multi-Hop Path Finder
              </h3>
              <p className="text-[11px] text-slate-400 font-sans">
                Find shortest connection chain between any two entities in this case
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
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
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>From Entity (A)</span>
                {selectedFrom && (
                  <span className="text-[9px] font-mono uppercase text-sky-400 bg-sky-950/60 border border-sky-800/60 px-1 py-0.2 rounded">
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
                  className="w-full bg-[#101622] border border-[#1e293b] rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono"
                />
              </div>
              <div className="max-h-36 overflow-y-auto bg-[#080c14] border border-[#1e293b] rounded-md p-1 space-y-0.5">
                {filteredFromNodes.length === 0 ? (
                  <div className="p-2 text-center text-[10px] text-slate-500">
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
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono flex items-center justify-between transition-colors ${
                        fromId === n.id
                          ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate">{n.label}</span>
                      <span className="text-[9px] text-slate-400 uppercase shrink-0 ml-1">
                        {n.type}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Swap Button for mobile or desktop */}
            <div className="hidden sm:flex absolute left-1/2 top-7 -translate-x-1/2 z-10">
              <button
                onClick={handleSwap}
                className="p-1.5 rounded-full bg-[#101622] border border-[#1e293b] text-slate-400 hover:text-sky-300 hover:border-sky-500/50 shadow-md transition-colors"
                title="Swap source and target"
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Target Entity B */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                <span>To Entity (B)</span>
                {selectedTo && (
                  <span className="text-[9px] font-mono uppercase text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-1 py-0.2 rounded">
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
                  className="w-full bg-[#101622] border border-[#1e293b] rounded-md px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <div className="max-h-36 overflow-y-auto bg-[#080c14] border border-[#1e293b] rounded-md p-1 space-y-0.5">
                {filteredToNodes.length === 0 ? (
                  <div className="p-2 text-center text-[10px] text-slate-500">
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
                      className={`w-full text-left px-2 py-1.5 rounded text-[11px] font-mono flex items-center justify-between transition-colors ${
                        toId === n.id
                          ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40 font-semibold'
                          : 'text-slate-300 hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="truncate">{n.label}</span>
                      <span className="text-[9px] text-slate-400 uppercase shrink-0 ml-1">
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
            className="w-full py-2 px-4 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold flex items-center justify-center gap-2 border border-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Traversing Graph Subgraph...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Route className="w-4 h-4 text-sky-400" />
                Trace Connection Path
              </span>
            )}
          </button>

          {/* Error notice */}
          {errorMsg && (
            <div className="p-3 rounded-md bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Path Result Display */}
          {pathResult && (
            <div className="pt-2 border-t border-[#1e293b] space-y-3">
              {pathResult.found ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-slate-200">
                        Path Connected ({pathResult.totalHops}{' '}
                        {pathResult.totalHops === 1 ? 'hop' : 'hops'})
                      </span>
                    </div>
                    <span className="font-mono text-xs text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded font-semibold">
                      {pathResult.cumulativeConfidence}% confidence
                    </span>
                  </div>

                  {/* Chain of hops */}
                  <div className="space-y-1 bg-[#080c14] border border-[#1e293b] rounded-lg p-3">
                    {pathResult.hops.map((hop, idx) => (
                      <React.Fragment key={hop.entityId + idx}>
                        {/* Hop Node */}
                        <div className="flex items-center justify-between py-1 px-2 rounded bg-[#101622] border border-[#1e293b]/70 font-mono text-[11px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[9px] font-bold shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
                              {hop.entityType}
                            </span>
                            <span className="text-slate-200 font-semibold truncate">
                              {hop.entityValue}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0">
                            {Math.round(hop.confidence)}%
                          </span>
                        </div>

                        {/* Relationship Link between hops */}
                        {hop.relationshipType && idx < pathResult.hops.length - 1 && (
                          <div className="flex items-center gap-2 pl-4 py-0.5 text-[10px] font-mono text-slate-400">
                            <div className="w-px h-3 bg-slate-700 ml-1.5" />
                            <span className="text-sky-400 bg-sky-950/40 px-1.5 py-0.2 rounded border border-sky-800/40">
                              --[{hop.relationshipType}]--&gt;
                            </span>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-md bg-slate-900 border border-slate-800 text-slate-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>
                    No connecting path found between these two entities in this case.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1e293b] bg-[#101622] flex items-center justify-between">
          <button
            onClick={() => {
              setHighlightedPath(null);
              addToast('Cleared path highlight', 'info');
            }}
            className="text-xs text-slate-400 hover:text-slate-200 underline font-sans"
          >
            Clear Highlight
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
