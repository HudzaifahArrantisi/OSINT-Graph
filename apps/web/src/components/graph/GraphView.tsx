import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
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
import { Search, X } from 'lucide-react';
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

  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const initialNodes: Node[] = useMemo(() => {
    return (graphData.nodes || []).map((n) => ({
      id: n.id,
      type: n.type || 'entity',
      position: n.position || { x: 0, y: 0 },
      data: {
        label: n.data.label,
        entityType: n.data.entityType,
        confidence: n.data.confidence,
        entityId: n.data.entityId,
        metadata: n.data.metadata,
        firstSeen: n.data.firstSeen,
        lastSeen: n.data.lastSeen,
        relationshipCount: n.data.relationshipCount,
        evidenceCount: n.data.evidenceCount,
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

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const data = (node.data || {}) as Record<string, any>;
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
        const label = String(data.label || '').toLowerCase();
        const type = String(data.entityType || '').toLowerCase();
        if (!label.includes(q) && !type.includes(q)) return false;
      }
      return true;
    });
  }, [nodes, graphFilter, searchQuery]);

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

      {filterOpen && <GraphFilterBar onClose={() => setFilterOpen(false)} />}

      {searchOpen && (
        <div className="absolute top-4 left-64 z-10 w-72 bg-surface/95 backdrop-blur-md border border-border-subtle rounded-card shadow-2xl p-2 flex items-center gap-2 animate-slide-in-up">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            type="text"
            placeholder="Find in graph..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="p-0.5 text-text-muted hover:text-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

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
        minZoom={0.2}
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
