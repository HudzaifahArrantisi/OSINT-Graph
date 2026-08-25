import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Node,
  Edge,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { EntityNode } from './EntityNode';
import { RelationshipEdge } from './RelationshipEdge';
import { GraphToolbar } from './GraphToolbar';
import { GraphFilterBar } from './GraphFilterBar';
import { useAppStore } from '../../stores/appStore';
import {
  applyForceLayout,
  applyHierarchicalLayout,
  applyRadialLayout,
} from '../../lib/graphLayout';
import { Radio, Layers, Eye } from 'lucide-react';
import type { GraphPayload } from '@nexusgraph/shared';

const nodeTypes = {
  entity: EntityNode,
  seed: EntityNode,
  domain: EntityNode,
  website: EntityNode,
  ip_address: EntityNode,
  email: EntityNode,
  username: EntityNode,
  url: EntityNode,
  social_profile: EntityNode,
  repository: EntityNode,
  organization: EntityNode,
  technology: EntityNode,
  certificate: EntityNode,
  document: EntityNode,
  person: EntityNode,
  phone: EntityNode,
  address: EntityNode,
  location: EntityNode,
  github_profile: EntityNode,
  gitlab_profile: EntityNode,
  youtube_channel: EntityNode,
  subdomain: EntityNode,
  mx_record: EntityNode,
  ns_record: EntityNode,
  public_mention: EntityNode,
};

const edgeTypes = {
  default: RelationshipEdge,
  relationship: RelationshipEdge,
};

interface GraphViewProps {
  graphData: GraphPayload;
  onRefresh?: () => void;
}

function GraphViewInner({ graphData }: GraphViewProps) {
  const {
    setSelectedNodeId,
    setSelectedEdgeId,
    graphFilter,
    graphLayout,
  } = useAppStore();

  const { fitView } = useReactFlow();

  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeedFilter, setSelectedSeedFilter] = useState<string | null>(null);

  const initialNodes: Node[] = useMemo(() => {
    return (graphData.nodes || []).map((n) => ({
      id: n.id,
      type: n.type || 'entity',
      position: n.position || { x: 0, y: 0 },
      data: {
        label: n.data.label,
        value: n.data.value || n.data.label,
        title: n.data.title,
        entityType: n.data.entityType,
        confidence: n.data.confidence,
        entityId: n.data.entityId,
        metadata: n.data.metadata,
        firstSeen: n.data.firstSeen,
        lastSeen: n.data.lastSeen,
        relationshipCount: n.data.relationshipCount,
        evidenceCount: n.data.evidenceCount,
        isSeed: n.data.isSeed || n.type === 'seed' || n.data.entityType === 'SEED',
      },
    }));
  }, [graphData.nodes]);

  const initialEdges: Edge[] = useMemo(() => {
    return (graphData.edges || []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'relationship',
      data: {
        relationshipType: e.data.relationshipType,
        confidence: e.data.confidence,
        reason: e.data.reason,
        evidenceCount: e.data.evidenceCount,
        relationshipId: e.data.relationshipId,
      },
    }));
  }, [graphData.edges]);

  // Extract distinct seed targets from initial nodes
  const seedTargets = useMemo(() => {
    return initialNodes.filter((n) => {
      const d = (n.data || {}) as Record<string, any>;
      return (
        d.isSeed === true ||
        d.entityType === 'SEED' ||
        n.type === 'seed' ||
        String(d.entityType || '').toUpperCase() === 'SEED'
      );
    });
  }, [initialNodes]);

  // Precompute reachable subgraph per seed target
  const seedSubgraphNodeIds = useMemo(() => {
    if (seedTargets.length === 0) return new Map<string, Set<string>>();

    const adj = new Map<string, string[]>();
    initialNodes.forEach((n) => adj.set(n.id, []));
    initialEdges.forEach((e) => {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.push(e.target);
        adj.get(e.target)!.push(e.source);
      }
    });

    const map = new Map<string, Set<string>>();

    seedTargets.forEach((seed) => {
      const visited = new Set<string>([seed.id]);
      const queue = [seed.id];

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = adj.get(curr) || [];
        for (const nb of neighbors) {
          if (!visited.has(nb)) {
            visited.add(nb);
            queue.push(nb);
          }
        }
      }
      map.set(seed.id, visited);
    });

    return map;
  }, [seedTargets, initialNodes, initialEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const applyLayout = useCallback(
    (layout: 'force' | 'hierarchical' | 'radial', currentNodes = nodes, currentEdges = edges) => {
      let layouted: Node[] = [];
      if (layout === 'hierarchical') {
        layouted = applyHierarchicalLayout(currentNodes, currentEdges);
      } else if (layout === 'radial') {
        layouted = applyRadialLayout(currentNodes, currentEdges);
      } else {
        layouted = applyForceLayout(currentNodes, currentEdges);
      }
      setNodes(layouted);
    },
    [nodes, edges, setNodes],
  );

  useEffect(() => {
    applyLayout(graphLayout, initialNodes, initialEdges);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, graphLayout]);

  const handleSelectSeedFilter = (seedId: string | null) => {
    setSelectedSeedFilter(seedId);
    setTimeout(() => {
      fitView({ duration: 400 });
    }, 50);
  };

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const data = (node.data || {}) as Record<string, any>;

      // Filter by Seed Target Subgraph isolation if active
      if (selectedSeedFilter) {
        const allowedNodes = seedSubgraphNodeIds.get(selectedSeedFilter);
        if (allowedNodes && !allowedNodes.has(node.id)) {
          return false;
        }
      }

      if (
        graphFilter.entityTypes.length > 0 &&
        !graphFilter.entityTypes.includes(data.entityType)
      ) {
        return false;
      }
      if ((data.confidence || 0) < graphFilter.confidenceMin) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const label = String(data.label || data.value || '').toLowerCase();
        const type = String(data.entityType || '').toLowerCase();
        if (!label.includes(q) && !type.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, selectedSeedFilter, seedSubgraphNodeIds, graphFilter, searchQuery]);

  const visibleNodeIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes],
  );

  const filteredEdges = useMemo(() => {
    return edges.filter(
      (edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
    );
  }, [edges, visibleNodeIds]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      setSelectedEdgeId(edge.id);
    },
    [setSelectedEdgeId],
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setSelectedNodeId, setSelectedEdgeId]);

  return (
    <div className="relative w-full h-full bg-app overflow-hidden">
      <GraphToolbar
        onToggleFilter={() => setFilterOpen((prev) => !prev)}
        filterOpen={filterOpen}
        onToggleSearch={() => setSearchOpen((prev) => !prev)}
        searchOpen={searchOpen}
        onApplyLayout={(layout) => applyLayout(layout)}
      />

      {/* Target Seed Isolation & Subgraph Switcher */}
      {seedTargets.length > 1 && (
        <div className="absolute top-4 left-[340px] z-10 hidden md:flex items-center gap-1 p-1 bg-surface/90 backdrop-blur-md border border-border-subtle rounded-card shadow-xl max-w-[calc(100vw-700px)] overflow-x-auto scrollbar-none">
          <div className="flex items-center gap-1 text-[11px] font-mono text-text-muted px-2 py-0.5 border-r border-border-subtle shrink-0">
            <Layers className="w-3.5 h-3.5 text-primary" />
            <span className="font-semibold text-slate-300">Target Clusters:</span>
          </div>

          <button
            onClick={() => handleSelectSeedFilter(null)}
            className={`px-2.5 py-1 rounded text-xs font-mono transition-all flex items-center gap-1.5 shrink-0 ${
              selectedSeedFilter === null
                ? 'bg-primary text-white font-semibold shadow-sm ring-1 ring-primary/50'
                : 'text-text-secondary hover:text-text hover:bg-surface-2'
            }`}
            title="Show all seed targets (separated side-by-side clusters)"
          >
            <Eye className="w-3 h-3" />
            <span>All Targets ({seedTargets.length})</span>
          </button>

          {seedTargets.map((seed) => {
            const seedData = (seed.data || {}) as Record<string, any>;
            const count = seedSubgraphNodeIds.get(seed.id)?.size || 1;
            const label = seedData.value || seedData.label || 'Seed';
            const isSelected = selectedSeedFilter === seed.id;

            return (
              <button
                key={seed.id}
                onClick={() => handleSelectSeedFilter(seed.id)}
                className={`px-2.5 py-1 rounded text-xs font-mono transition-all flex items-center gap-1.5 shrink-0 max-w-[240px] truncate ${
                  isSelected
                    ? 'bg-amber-500/20 text-amber-200 border border-amber-500/60 font-semibold shadow-sm shadow-amber-950/40'
                    : 'text-text-secondary hover:text-amber-300 hover:bg-surface-2 border border-transparent'
                }`}
                title={`Isolate graph to target: ${label} (${count} entities)`}
              >
                <Radio className={`w-3 h-3 shrink-0 ${isSelected ? 'text-amber-400 animate-pulse' : 'text-amber-500/70'}`} />
                <span className="truncate">{label}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                  isSelected ? 'bg-amber-500/30 text-amber-300' : 'bg-surface-3 text-text-muted'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filterOpen && <GraphFilterBar onClose={() => setFilterOpen(false)} />}

      <ReactFlow
        nodes={filteredNodes}
        edges={filteredEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        minZoom={0.1}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: 'relationship' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(255, 255, 255, 0.05)"
        />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          nodeColor={() => '#7c6cff'}
          maskColor="rgba(11, 15, 20, 0.7)"
          position="bottom-right"
          className="!bg-surface !border !border-border-subtle"
        />
      </ReactFlow>
    </div>
  );
}

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
