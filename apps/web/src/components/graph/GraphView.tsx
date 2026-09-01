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
import { ClusterHubNode } from './ClusterHubNode';
import { RelationshipEdge } from './RelationshipEdge';
import { GraphToolbar } from './GraphToolbar';
import { GraphFilterBar } from './GraphFilterBar';
import { useAppStore } from '../../stores/appStore';
import {
  applyForceLayout,
  applyHierarchicalLayout,
  applyRadialLayout,
} from '../../lib/graphLayout';
import { Radio, Layers, Route, X } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { PathFinderModal } from './PathFinderModal';
import type { GraphPayload } from '@nexusgraph/shared';

const nodeTypes = {
  entity: EntityNode,
  cluster_hub: ClusterHubNode,
  group_badge: ClusterHubNode,
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
    highlightedPath,
    setHighlightedPath,
  } = useAppStore();

  const { id: routeCaseId } = useParams<{ id: string }>();
  const caseId = routeCaseId || '';

  const { fitView } = useReactFlow();

  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pathFinderOpen, setPathFinderOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSeedFilter, setSelectedSeedFilter] = useState<string | null>(null);

  // Performance & Level-of-Detail states
  const rawNodeCount = (graphData.nodes || []).length;
  const isLargeGraph = rawNodeCount > 50;

  const [clusterMode, setClusterMode] = useState<boolean>(() => rawNodeCount > 60);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    // By default, if large graph, collapse large categories initially
    return rawNodeCount > 60 ? new Set(['subcat_subdomain', 'subcat_url']) : new Set();
  });
  const [labelMode, setLabelMode] = useState<'auto' | 'always' | 'hover'>('auto');

  const handleToggleCollapse = useCallback((catKey: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(catKey)) {
        next.delete(catKey);
      } else {
        next.add(catKey);
      }
      return next;
    });
  }, []);

  const handleToggleClusterMode = useCallback(() => {
    setClusterMode((prev) => {
      const next = !prev;
      if (next) {
        // Collapse large categories
        setCollapsedCategories(new Set(['subcat_subdomain', 'subcat_url', 'subcat_dorks']));
      } else {
        // Expand all
        setCollapsedCategories(new Set());
      }
      return next;
    });
    setTimeout(() => {
      fitView({ duration: 400 });
    }, 100);
  }, [fitView]);

  const handleToggleLabelMode = useCallback(() => {
    setLabelMode((prev) => {
      if (prev === 'auto') return 'always';
      if (prev === 'always') return 'hover';
      return 'auto';
    });
  }, []);

  const hideLabels = useMemo(() => {
    if (labelMode === 'hover') return true;
    if (labelMode === 'always') return false;
    return isLargeGraph; // 'auto' mode
  }, [labelMode, isLargeGraph]);

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
        hideLabelByDefault: hideLabels,
        isLargeGraph,
      },
    }));
  }, [graphData.nodes, hideLabels, isLargeGraph]);

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

    const forwardAdj = new Map<string, string[]>();
    initialNodes.forEach((n) => forwardAdj.set(n.id, []));
    initialEdges.forEach((e) => {
      if (forwardAdj.has(e.source) && forwardAdj.has(e.target)) {
        forwardAdj.get(e.source)!.push(e.target);
      }
    });

    const map = new Map<string, Set<string>>();
    const seedIds = new Set(seedTargets.map((s) => s.id));

    seedTargets.forEach((seed) => {
      const visited = new Set<string>([seed.id]);
      const queue = [seed.id];

      while (queue.length > 0) {
        const curr = queue.shift()!;
        const neighbors = forwardAdj.get(curr) || [];
        for (const nb of neighbors) {
          if (seedIds.has(nb) && nb !== seed.id) continue;
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
    (
      layout: 'force' | 'hierarchical' | 'radial',
      currentNodes = initialNodes,
      currentEdges = initialEdges,
      activeCollapsedCategories = collapsedCategories,
    ) => {
      let layouted: Node[] = [];
      if (layout === 'hierarchical') {
        layouted = applyHierarchicalLayout(currentNodes, currentEdges);
      } else if (layout === 'radial') {
        layouted = applyRadialLayout(currentNodes, currentEdges, {
          collapsedCategories: Array.from(activeCollapsedCategories),
        });
      } else {
        layouted = applyForceLayout(currentNodes, currentEdges);
      }

      // If Radial Layout is active, ensure edges flow hierarchically:
      // Seed Target (Root) -> Category Hub Node -> Leaf/Member Subnodes
      let edgeList = [...currentEdges];

      if (layout === 'radial') {
        const seedNodes = layouted.filter((n) => (n.data as any)?.isSeed || n.type === 'seed');
        if (seedNodes.length > 0) {
          const rootSeed = seedNodes[0];

          // Group non-root nodes by their category key
          const catGroups = new Map<string, Node[]>();
          layouted.forEach((node) => {
            if (node.id === rootSeed.id) return;
            const meta = (node.data as any)?.metadata || {};
            const discoveredBy = meta.discoveredBy || meta.source?.transform || meta.source?.collector;
            const entityType = String((node.data as any)?.entityType || node.type || '').toUpperCase();
            const label = String((node.data as any)?.label || (node.data as any)?.value || '').toLowerCase();

            let catKey = 'subcat_other';
            if (label.startsWith('inurl:') || label.includes('site:') || label.includes('filetype:') || label.includes('intitle:')) {
              catKey = 'subcat_dorks';
            } else if (entityType === 'IP_ADDRESS' || entityType === 'IP') {
              catKey = 'subcat_ip';
            } else if (entityType === 'SUBDOMAIN') {
              catKey = 'subcat_subdomain';
            } else if (entityType === 'DOMAIN' || entityType === 'WEBSITE') {
              catKey = 'subcat_domain';
            } else if (entityType === 'URL') {
              catKey = 'subcat_url';
            } else if (entityType === 'DOCUMENT') {
              catKey = 'subcat_document';
            } else if (entityType === 'LOCATION' || entityType === 'ADDRESS') {
              catKey = 'subcat_location';
            } else if (['NS_RECORD', 'MX_RECORD', 'DNS_RECORD'].includes(entityType)) {
              catKey = 'subcat_dns';
            } else if (['CERTIFICATE', 'TLS_CERTIFICATE'].includes(entityType)) {
              catKey = 'subcat_tls';
            } else if (entityType === 'TECHNOLOGY') {
              catKey = 'subcat_tech';
            } else if (['EMAIL', 'PERSON', 'ORGANIZATION'].includes(entityType)) {
              catKey = 'subcat_contact';
            } else if (entityType === 'PHONE') {
              catKey = 'subcat_phone';
            } else if (['SOCIAL_PROFILE', 'GITHUB_PROFILE', 'GITLAB_PROFILE', 'YOUTUBE_CHANNEL', 'USERNAME'].includes(entityType)) {
              catKey = 'subcat_social';
            } else if (entityType === 'PUBLIC_MENTION') {
              catKey = 'subcat_mentions';
            } else if (discoveredBy) {
              const s = String(discoveredBy).toLowerCase();
              if (s.includes('subdomain') || s.includes('crt')) catKey = 'subcat_subdomain';
              else if (s.includes('dns')) catKey = 'subcat_dns';
              else if (s.includes('tls') || s.includes('cert')) catKey = 'subcat_tls';
              else if (s.includes('tech')) catKey = 'subcat_tech';
              else if (s.includes('recon')) catKey = 'subcat_recon';
              else if (s.includes('contact') || s.includes('email')) catKey = 'subcat_contact';
              else if (s.includes('phone') || s.includes('geo')) catKey = 'subcat_phone';
              else if (s.includes('social') || s.includes('mrholmes')) catKey = 'subcat_social';
              else catKey = `subcat_${discoveredBy}`;
            }

            if (!catGroups.has(catKey)) catGroups.set(catKey, []);
            catGroups.get(catKey)!.push(node);
          });

          // In Radial layout, clean up direct seed-to-all-subnode messy cross-lines:
          // 1. First node of each category group acts as the Category Parent / Satellite Center
          // 2. Connect Seed -> Category Center Node
          // 3. Connect Category Center Node -> Sub-nodes in its concentric starburst
          const newEdges: Edge[] = [];
          catGroups.forEach((groupNodes, catKey) => {
            if (groupNodes.length === 0) return;
            const catParentNode = groupNodes[0];

            // Edge: Seed -> Category Parent Node
            newEdges.push({
              id: `edge-seed-to-cat-${catParentNode.id}`,
              source: rootSeed.id,
              target: catParentNode.id,
              type: 'relationship',
              data: {
                relationshipType: 'EXECUTES_TRANSFORM',
                confidence: 100,
                reason: `Discovery category: ${catKey.replace('subcat_', '').toUpperCase()}`,
                evidenceCount: 0,
                relationshipId: `edge-seed-to-cat-${catParentNode.id}`,
              },
            });

            // Edge: Category Parent Node -> Child Sub-nodes in this category
            for (let i = 1; i < groupNodes.length; i++) {
              const childNode = groupNodes[i];
              newEdges.push({
                id: `edge-cat-to-child-${catParentNode.id}-${childNode.id}`,
                source: catParentNode.id,
                target: childNode.id,
                type: 'relationship',
                data: {
                  relationshipType: 'CONTAINS',
                  confidence: (childNode.data as any)?.confidence || 90,
                  reason: `Discovered under ${(catParentNode.data as any)?.label || catKey}`,
                  evidenceCount: 0,
                  relationshipId: `edge-cat-to-child-${catParentNode.id}-${childNode.id}`,
                },
              });
            }
          });

          // Preserve any existing inter-entity edges that do not connect to the root seed
          currentEdges.forEach((e) => {
            if (e.source !== rootSeed.id && e.target !== rootSeed.id) {
              if (!newEdges.some((ne) => (ne.source === e.source && ne.target === e.target) || (ne.source === e.target && ne.target === e.source))) {
                newEdges.push(e);
              }
            }
          });

          edgeList = newEdges;
        }
      }

      // Automatically construct edges to Hub nodes and from Hub nodes to member leaf nodes
      const hubNodes = layouted.filter((n) => n.type === 'cluster_hub' || (n.data as any)?.isHub);
      const seedNodes = layouted.filter((n) => (n.data as any)?.isSeed || n.type === 'seed');

      // Inject onToggleCollapse into hub nodes data
      layouted = layouted.map((n) => {
        if (n.type === 'cluster_hub' || (n.data as any)?.isHub) {
          return {
            ...n,
            data: {
              ...n.data,
              onToggleCollapse: handleToggleCollapse,
            },
          };
        }
        return n;
      });

      if (hubNodes.length > 0) {
        const defaultSeed = seedNodes[0];

        hubNodes.forEach((hub) => {
          const catKey = (hub.data as any)?.categoryKey;
          const isCollapsed = Boolean((hub.data as any)?.isCollapsed);

          // Edge from central seed to Hub
          if (defaultSeed) {
            const edgeId = `edge-to-${hub.id}`;
            if (!edgeList.some((e) => e.id === edgeId)) {
              edgeList.push({
                id: edgeId,
                source: defaultSeed.id,
                target: hub.id,
                type: 'relationship',
                data: {
                  relationshipType: 'EXECUTES_TRANSFORM',
                  confidence: 100,
                  reason: `Discovery cluster module: ${hub.data?.label || 'Sub-Category'}`,
                  evidenceCount: 0,
                  relationshipId: edgeId,
                },
              });
            }
          }

          // If hub is expanded, connect Hub to its satellite member nodes
          if (!isCollapsed && catKey) {
            layouted.forEach((node) => {
              if (node.id === hub.id || (node.data as any)?.isHub || (node.data as any)?.isSeed) return;
              const nodeCatKey = (node.data as any)?.subCategoryKey;
              // Check if node is part of this cluster satellite
              const metadata = (node.data as any)?.metadata || {};
              const discoveredBy = metadata.discoveredBy || metadata.source?.transform || metadata.source?.collector;
              const entityType = String((node.data as any)?.entityType || node.type || '').toUpperCase();

              const matchesCat =
                (catKey === 'subcat_subdomain' && (entityType === 'SUBDOMAIN' || String(discoveredBy).toLowerCase().includes('subdomain'))) ||
                (catKey === 'subcat_dns' && (['MX_RECORD', 'NS_RECORD'].includes(entityType) || String(discoveredBy).toLowerCase().includes('dns'))) ||
                (catKey === 'subcat_tls' && (entityType === 'CERTIFICATE' || String(discoveredBy).toLowerCase().includes('tls'))) ||
                (catKey === 'subcat_ip' && entityType === 'IP_ADDRESS') ||
                (catKey === 'subcat_domain' && ['DOMAIN', 'WEBSITE'].includes(entityType)) ||
                (catKey === 'subcat_url' && ['URL', 'DOCUMENT'].includes(entityType)) ||
                (catKey === 'subcat_contact' && ['EMAIL', 'PERSON', 'ORGANIZATION'].includes(entityType)) ||
                (catKey === 'subcat_phone_geo' && ['PHONE', 'LOCATION', 'ADDRESS'].includes(entityType)) ||
                (catKey === 'subcat_social' && ['SOCIAL_PROFILE', 'GITHUB_PROFILE', 'GITLAB_PROFILE', 'YOUTUBE_CHANNEL', 'USERNAME'].includes(entityType)) ||
                (catKey === 'subcat_mentions' && entityType === 'PUBLIC_MENTION');

              if (matchesCat) {
                const memberEdgeId = `hub-member-${hub.id}-${node.id}`;
                if (!edgeList.some((e) => (e.source === hub.id && e.target === node.id) || (e.source === node.id && e.target === hub.id))) {
                  edgeList.push({
                    id: memberEdgeId,
                    source: hub.id,
                    target: node.id,
                    type: 'relationship',
                    data: {
                      relationshipType: 'CONTAINS',
                      confidence: (node.data as any)?.confidence || 90,
                      reason: `Discovered in ${(hub.data as any)?.label || 'cluster'}`,
                      evidenceCount: 0,
                      relationshipId: memberEdgeId,
                    },
                  });
                }
              }
            });
          }
        });
      }

      setNodes(layouted);
      setEdges(edgeList);
    },
    [initialNodes, initialEdges, collapsedCategories, handleToggleCollapse, setNodes, setEdges],
  );

  useEffect(() => {
    applyLayout(graphLayout, initialNodes, initialEdges, collapsedCategories);
  }, [initialNodes, initialEdges, graphLayout, collapsedCategories]);

  const handleSelectSeedFilter = (seedId: string | null) => {
    setSelectedSeedFilter(seedId);
    setTimeout(() => {
      fitView({ duration: 400 });
    }, 50);
  };

  const filteredNodes = useMemo(() => {
    return nodes.filter((node) => {
      const data = (node.data || {}) as Record<string, any>;

      // Always show cluster hub nodes
      if (node.type === 'cluster_hub' || data.isHub) return true;

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

  const displayNodes = useMemo(() => {
    if (!highlightedPath) return filteredNodes;
    return filteredNodes.map((node) => {
      const isPathNode = highlightedPath.nodeIds.includes(node.id);
      return {
        ...node,
        style: {
          ...(node.style || {}),
          opacity: isPathNode ? 1 : 0.18,
          transition: 'opacity 0.2s ease',
        },
      };
    });
  }, [filteredNodes, highlightedPath]);

  const displayEdges = useMemo(() => {
    if (!highlightedPath) return filteredEdges;
    return filteredEdges.map((edge) => {
      const isPathEdge =
        highlightedPath.edgeIds.includes(edge.id) ||
        (highlightedPath.nodeIds.includes(edge.source) &&
          highlightedPath.nodeIds.includes(edge.target));

      return {
        ...edge,
        style: {
          ...(edge.style || {}),
          stroke: isPathEdge ? '#38bdf8' : 'rgba(100, 116, 139, 0.2)',
          strokeWidth: isPathEdge ? 2.5 : 1,
          opacity: isPathEdge ? 1 : 0.1,
        },
        data: {
          ...(edge.data || {}),
          isHighlighted: isPathEdge,
        },
      };
    });
  }, [filteredEdges, highlightedPath]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster_hub' || (node.data as any)?.isHub) {
        const catKey = (node.data as any)?.categoryKey;
        if (catKey) {
          handleToggleCollapse(catKey);
        }
        return;
      }
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId, handleToggleCollapse],
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
        onTogglePathFinder={() => setPathFinderOpen((prev) => !prev)}
        pathFinderOpen={pathFinderOpen}
        onApplyLayout={(layout) => applyLayout(layout)}
        clusterMode={clusterMode}
        onToggleClusterMode={handleToggleClusterMode}
        labelMode={labelMode}
        onToggleLabelMode={handleToggleLabelMode}
        totalNodeCount={rawNodeCount}
        seedTargets={seedTargets.map((seed) => {
          const seedData = (seed.data || {}) as Record<string, any>;
          return {
            id: seed.id,
            label: String(seedData.value || seedData.label || 'Seed'),
            count: seedSubgraphNodeIds.get(seed.id)?.size || 1,
          };
        })}
        selectedSeedFilter={selectedSeedFilter}
        onSelectSeedFilter={handleSelectSeedFilter}
      />

      {filterOpen && <GraphFilterBar onClose={() => setFilterOpen(false)} />}

      {/* Floating Active Path Highlight Banner */}
      {highlightedPath && (
        <div className="absolute top-16 left-4 z-20 flex items-center gap-3 px-3.5 py-2 bg-[#0c1017]/95 backdrop-blur-md border border-sky-500/50 rounded-lg shadow-2xl animate-in fade-in slide-in-from-top-2 text-xs">
          <div className="flex items-center gap-2 font-mono">
            <Route className="w-4 h-4 text-sky-400 animate-pulse" />
            <span className="text-slate-200 font-semibold">Active Path:</span>
            <span className="text-sky-300 font-bold">
              {highlightedPath.nodeIds.length - 1}{' '}
              {highlightedPath.nodeIds.length - 1 === 1 ? 'hop' : 'hops'}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-emerald-400 font-semibold">
              {highlightedPath.confidence}% confidence
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-700/60 pl-2.5">
            <button
              onClick={() => setPathFinderOpen(true)}
              className="text-[11px] text-sky-300 hover:text-sky-200 hover:underline font-medium"
            >
              Details
            </button>
            <button
              onClick={() => setHighlightedPath(null)}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title="Clear path highlight"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Path Finder Modal */}
      {caseId && (
        <PathFinderModal
          isOpen={pathFinderOpen}
          onClose={() => setPathFinderOpen(false)}
          caseId={caseId}
          nodes={nodes}
        />
      )}

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        fitView
        onlyRenderVisibleElements={true}
        elevateNodesOnSelect={true}
        minZoom={0.04}
        maxZoom={3}
        defaultEdgeOptions={{ type: 'relationship' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(30, 41, 59, 0.35)"
        />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          nodeColor={(node) => (node.type === 'cluster_hub' ? '#38bdf8' : '#7c6cff')}
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
