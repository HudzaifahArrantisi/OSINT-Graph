export interface SimpleNode<T = Record<string, unknown>> {
  id: string;
  position: { x: number; y: number };
  data: T;
  type?: string;
}

export interface SimpleEdge<T = Record<string, unknown>> {
  id: string;
  source: string;
  target: string;
  data?: T;
  type?: string;
}

export interface GraphCluster<T = Record<string, unknown>> {
  id: string;
  seedNode?: SimpleNode<T>;
  nodes: SimpleNode<T>[];
  edges: SimpleEdge[];
}

/**
 * Checks if a node is designated as a Seed Target
 */
function isSeedNode<T extends Record<string, unknown>>(node: SimpleNode<T>): boolean {
  const d = (node.data || {}) as Record<string, any>;
  return (
    d.isSeed === true ||
    d.entityType === 'SEED' ||
    node.type === 'seed' ||
    String(d.entityType || '').toUpperCase() === 'SEED'
  );
}

/**
 * Determines the sub-category / transform key for a discovered node.
 * Groups entities into discrete functional modules (DNS, TLS, Webpage Metadata, Contacts, Social, etc.)
 */
function getSubCategoryKey<T extends Record<string, unknown>>(node: SimpleNode<T>): string {
  const d = (node.data || {}) as Record<string, any>;
  const metadata = d.metadata || {};
  const discoveredBy =
    metadata.discoveredBy ||
    metadata.source?.transform ||
    metadata.source?.collector;

  if (discoveredBy) {
    const s = String(discoveredBy).toLowerCase();
    if (s.includes('subdomain') || s.includes('crt')) return 'subcat_subdomain';
    if (s.includes('dns') || s.includes('resolve-dns')) return 'subcat_dns';
    if (s.includes('tls') || s.includes('cert') || s.includes('find-tls')) return 'subcat_tls';
    if (s.includes('webpage') || s.includes('metadata')) return 'subcat_webpage';
    if (s.includes('recon') || s.includes('website-recon')) return 'subcat_recon';
    if (s.includes('contact') || s.includes('breach') || s.includes('email-lookup')) return 'subcat_contact';
    if (s.includes('phone') || s.includes('geo')) return 'subcat_phone_geo';
    if (s.includes('social') || s.includes('username') || s.includes('mrholmes')) return 'subcat_social';
    if (s.includes('github') || s.includes('gitlab') || s.includes('developer')) return 'subcat_dev';
    if (s.includes('dork') || s.includes('generate-dorks')) return 'subcat_dorks';
    if (s.includes('mention')) return 'subcat_mentions';
    return `subcat_${discoveredBy}`;
  }

  // Fallback categorization based on entityType
  const entityType = String(d.entityType || node.type || '').toUpperCase();
  if (['SUBDOMAIN'].includes(entityType)) return 'subcat_subdomain';
  if (['IP_ADDRESS'].includes(entityType)) return 'subcat_ip';
  if (['MX_RECORD', 'NS_RECORD'].includes(entityType)) return 'subcat_dns';
  if (['CERTIFICATE'].includes(entityType)) return 'subcat_tls';
  if (['TECHNOLOGY'].includes(entityType)) return 'subcat_tech';
  if (['DOMAIN', 'WEBSITE'].includes(entityType)) return 'subcat_domain';
  if (['URL', 'DOCUMENT'].includes(entityType)) return 'subcat_url';
  if (['EMAIL', 'PERSON', 'ORGANIZATION'].includes(entityType)) return 'subcat_contact';
  if (['PHONE', 'LOCATION', 'ADDRESS'].includes(entityType)) return 'subcat_phone_geo';
  if (['SOCIAL_PROFILE', 'GITHUB_PROFILE', 'GITLAB_PROFILE', 'YOUTUBE_CHANNEL', 'USERNAME'].includes(entityType)) return 'subcat_social';
  if (['PUBLIC_MENTION'].includes(entityType)) return 'subcat_mentions';

  return `subcat_${entityType || 'other'}`;
}

/**
 * Partition nodes & edges into independent seed subgraphs / connected components.
 * Guarantees that multiple seed targets NEVER collide or overlap into a single messy clump.
 */
export function partitionGraphClusters<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): GraphCluster<T>[] {
  // Filter out any existing hub nodes to avoid re-clustering them
  const actualNodes = nodes.filter((n) => !(n.data as any)?.isHub && n.type !== 'cluster_hub');
  if (actualNodes.length === 0) return [];

  const nodeMap = new Map<string, SimpleNode<T>>();
  actualNodes.forEach((n) => nodeMap.set(n.id, n));

  const adj = new Map<string, string[]>();
  actualNodes.forEach((n) => adj.set(n.id, []));

  edges.forEach((e) => {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      adj.get(e.target)!.push(e.source);
    }
  });

  const seeds = actualNodes.filter(isSeedNode);

  // If we have multiple seeds, partition nodes by multi-source BFS / nearest seed
  if (seeds.length > 1) {
    const seedIds = seeds.map((s) => s.id);
    const nodeToSeedDist = new Map<string, { seedId: string; dist: number }>();
    const seedClusters = new Map<string, SimpleNode<T>[]>();
    seeds.forEach((s) => seedClusters.set(s.id, [s]));

    // BFS per seed to measure distance
    for (const seed of seeds) {
      const visited = new Set<string>([seed.id]);
      const queue: Array<{ id: string; dist: number }> = [{ id: seed.id, dist: 0 }];

      while (queue.length > 0) {
        const { id: curr, dist } = queue.shift()!;
        const neighbors = adj.get(curr) || [];

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            const currentRecord = nodeToSeedDist.get(neighbor);
            if (!currentRecord || dist + 1 < currentRecord.dist) {
              nodeToSeedDist.set(neighbor, { seedId: seed.id, dist: dist + 1 });
            }
            queue.push({ id: neighbor, dist: dist + 1 });
          }
        }
      }
    }

    const unassignedNodes: SimpleNode<T>[] = [];

    for (const node of actualNodes) {
      if (seedIds.includes(node.id)) continue;
      const rec = nodeToSeedDist.get(node.id);
      if (rec && seedClusters.has(rec.seedId)) {
        seedClusters.get(rec.seedId)!.push(node);
      } else {
        unassignedNodes.push(node);
      }
    }

    const clusters: GraphCluster<T>[] = [];

    seeds.forEach((seed) => {
      const clusterNodes = seedClusters.get(seed.id) || [seed];
      const clusterNodeSet = new Set(clusterNodes.map((n) => n.id));
      const clusterEdges = edges.filter(
        (e) => clusterNodeSet.has(e.source) && clusterNodeSet.has(e.target),
      );

      clusters.push({
        id: `seed-${seed.id}`,
        seedNode: seed,
        nodes: clusterNodes,
        edges: clusterEdges,
      });
    });

    // Handle disconnected components that don't belong to any seed
    if (unassignedNodes.length > 0) {
      const visited = new Set<string>();
      for (const node of unassignedNodes) {
        if (visited.has(node.id)) continue;

        const compNodes: SimpleNode<T>[] = [];
        const queue = [node.id];
        visited.add(node.id);

        while (queue.length > 0) {
          const curr = queue.shift()!;
          const nObj = nodeMap.get(curr);
          if (nObj) compNodes.push(nObj);

          const neighbors = adj.get(curr) || [];
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor) && !nodeToSeedDist.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }

        const compNodeSet = new Set(compNodes.map((n) => n.id));
        const compEdges = edges.filter(
          (e) => compNodeSet.has(e.source) && compNodeSet.has(e.target),
        );

        clusters.push({
          id: `comp-${node.id}`,
          nodes: compNodes,
          edges: compEdges,
        });
      }
    }

    return clusters;
  }

  // Single seed or no seeds: partition into standard connected components
  const visited = new Set<string>();
  const clusters: GraphCluster<T>[] = [];

  const orderedNodes = seeds.length === 1
    ? [seeds[0], ...actualNodes.filter((n) => n.id !== seeds[0].id)]
    : actualNodes;

  for (const node of orderedNodes) {
    if (visited.has(node.id)) continue;

    const compNodes: SimpleNode<T>[] = [];
    const queue = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const nObj = nodeMap.get(curr);
      if (nObj) compNodes.push(nObj);

      const neighbors = adj.get(curr) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    const compNodeSet = new Set(compNodes.map((n) => n.id));
    const compEdges = edges.filter(
      (e) => compNodeSet.has(e.source) && compNodeSet.has(e.target),
    );

    const compSeed = compNodes.find(isSeedNode);

    clusters.push({
      id: compSeed ? `seed-${compSeed.id}` : `comp-${node.id}`,
      seedNode: compSeed,
      nodes: compNodes,
      edges: compEdges,
    });
  }

  return clusters;
}

/**
 * Helper to layout a list of nodes in a Maltego-style 360° concentric starburst/dandelion around a central hub
 */
function layoutStarburst<T extends Record<string, unknown>>(
  centerPos: { x: number; y: number },
  nodes: SimpleNode<T>[],
  startRadius = 120,
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: centerPos.x + startRadius, y: centerPos.y } }];
  }

  const result: SimpleNode<T>[] = [];
  let nodeIndex = 0;
  let ringIndex = 0;
  const RING_STEP = Math.max(75, Math.min(95, 75 + Math.floor(nodes.length / 40)));

  while (nodeIndex < nodes.length) {
    const currentRadius = startRadius + ringIndex * RING_STEP;
    // Calculate how many nodes fit on circle perimeter with at least 80px spacing
    const perimeter = 2 * Math.PI * currentRadius;
    const maxNodesInRing = Math.max(6, Math.floor(perimeter / 80));

    const remaining = nodes.length - nodeIndex;
    const countInRing = Math.min(remaining, maxNodesInRing);
    const ringNodes = nodes.slice(nodeIndex, nodeIndex + countInRing);
    const phaseOffset = (ringIndex * 0.42) % (2 * Math.PI);

    ringNodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / countInRing + phaseOffset;
      result.push({
        ...node,
        position: {
          x: Math.round(centerPos.x + Math.cos(angle) * currentRadius),
          y: Math.round(centerPos.y + Math.sin(angle) * currentRadius),
        },
      });
    });

    nodeIndex += countInRing;
    ringIndex++;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Force / Grid Layout (Cluster-Aware)
// ─────────────────────────────────────────────────────────────────────────────
export function applyForceLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: 0, y: 0 } }];

  const clusters = partitionGraphClusters(nodes, edges);
  if (clusters.length === 0) return nodes;

  let currentOffsetX = 0;
  const result: SimpleNode<T>[] = [];
  const CLUSTER_GAP = 400;

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;

    const connections = new Map<string, string[]>();
    cNodes.forEach((n) => connections.set(n.id, []));
    cEdges.forEach((e) => {
      connections.get(e.source)?.push(e.target);
      connections.get(e.target)?.push(e.source);
    });

    const nodeDegrees = cNodes.map((n) => ({
      node: n,
      degree: isSeedNode(n) ? 9999 : connections.get(n.id)?.length || 0,
    }));

    nodeDegrees.sort((a, b) => b.degree - a.degree);

    const cols = Math.max(3, Math.ceil(Math.sqrt(cNodes.length * 1.5)));
    const xSpacing = 130;
    const ySpacing = 110;

    const clusterWidth = cols * xSpacing;

    nodeDegrees.forEach((item, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const jitterX = ((index * 37) % 20) - 10;
      const jitterY = ((index * 23) % 16) - 8;

      result.push({
        ...item.node,
        position: {
          x: currentOffsetX + col * xSpacing + jitterX + (row % 2 === 1 ? xSpacing / 3 : 0),
          y: row * ySpacing + jitterY,
        },
      });
    });

    currentOffsetX += clusterWidth + CLUSTER_GAP;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Hierarchical / Tree Layout (Maltego-style Branching Tree)
// ─────────────────────────────────────────────────────────────────────────────
export function applyHierarchicalLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: 0, y: 0 } }];

  const clusters = partitionGraphClusters(nodes, edges);
  let currentOffsetX = 0;
  const result: SimpleNode<T>[] = [];
  const CLUSTER_GAP = 500;

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;

    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    const childrenMap = new Map<string, string[]>();

    cNodes.forEach((n) => {
      inDegree.set(n.id, 0);
      outDegree.set(n.id, 0);
      childrenMap.set(n.id, []);
    });

    cEdges.forEach((e) => {
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
      outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
      childrenMap.get(e.source)?.push(e.target);
    });

    const layers = new Map<string, number>();
    const queue: string[] = [];

    if (cluster.seedNode) {
      layers.set(cluster.seedNode.id, 0);
      queue.push(cluster.seedNode.id);
    } else {
      cNodes.forEach((n) => {
        if ((inDegree.get(n.id) || 0) === 0) {
          layers.set(n.id, 0);
          queue.push(n.id);
        }
      });
    }

    if (queue.length === 0 && cNodes.length > 0) {
      layers.set(cNodes[0].id, 0);
      queue.push(cNodes[0].id);
    }

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currLayer = layers.get(curr) || 0;
      const children = childrenMap.get(curr) || [];

      children.forEach((child) => {
        if (!layers.has(child)) {
          layers.set(child, currLayer + 1);
          queue.push(child);
        }
      });
    }

    cNodes.forEach((n) => {
      if (!layers.has(n.id)) {
        layers.set(n.id, 1);
      }
    });

    const layerGroups = new Map<number, SimpleNode<T>[]>();
    cNodes.forEach((n) => {
      const layer = layers.get(n.id) || 0;
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer)!.push(n);
    });

    const xSpacing = 130;
    const ySpacing = 140;
    let maxLayerWidth = 0;

    layerGroups.forEach((groupNodes) => {
      const width = groupNodes.length * xSpacing;
      if (width > maxLayerWidth) maxLayerWidth = width;
    });

    const clusterCenterX = currentOffsetX + maxLayerWidth / 2;

    layerGroups.forEach((groupNodes, layerIndex) => {
      const totalWidth = (groupNodes.length - 1) * xSpacing;
      const startX = clusterCenterX - totalWidth / 2;

      groupNodes.forEach((node, nodeIndex) => {
        result.push({
          ...node,
          position: {
            x: startX + nodeIndex * xSpacing,
            y: layerIndex * ySpacing,
          },
        });
      });
    });

    currentOffsetX += Math.max(maxLayerWidth, 200) + CLUSTER_GAP;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Radial Layout (Maltego-style Dandelion Starburst with Sub-Category Hubs)
// ─────────────────────────────────────────────────────────────────────────────
export function applyRadialLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
  options?: {
    collapsedCategories?: string[];
  },
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: 0, y: 0 } }];
  }

  const collapsedSet = new Set(options?.collapsedCategories || []);
  const clusters = partitionGraphClusters(nodes, edges);
  let currentOffsetX = 0;
  const result: SimpleNode<T>[] = [];
  const CLUSTER_GAP = 550;

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;

    if (cNodes.length === 1) {
      result.push({
        ...cNodes[0],
        position: { x: currentOffsetX, y: 0 },
      });
      currentOffsetX += 150 + CLUSTER_GAP;
      continue;
    }

    const degrees = new Map<string, number>();
    cNodes.forEach((n) => degrees.set(n.id, 0));
    cEdges.forEach((e) => {
      degrees.set(e.source, (degrees.get(e.source) || 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) || 0) + 1);
    });

    // Focal center node of this cluster
    let center: SimpleNode<T>;
    let others: SimpleNode<T>[];

    if (cluster.seedNode) {
      center = cluster.seedNode;
      others = cNodes.filter((n) => n.id !== cluster.seedNode!.id);
    } else {
      const sorted = [...cNodes].sort(
        (a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0),
      );
      center = sorted[0];
      others = sorted.slice(1);
    }

    // Partition children into Sub-Category Satellites (DNS, TLS, Webpage, Contacts, Social, Dorks, etc.)
    const subCategoryGroups = new Map<string, SimpleNode<T>[]>();
    others.forEach((node) => {
      const subCat = getSubCategoryKey(node);
      if (!subCategoryGroups.has(subCat)) {
        subCategoryGroups.set(subCat, []);
      }
      subCategoryGroups.get(subCat)!.push(node);
    });

    const subCategories = Array.from(subCategoryGroups.entries());

    // If sub-categories exist, organize them as Starburst Satellites with Hubs
    if (subCategories.length > 0) {
      const numSubCats = subCategories.length;

      // Estimate satellite radius requirements
      let maxSatExtent = 140;
      subCategories.forEach(([catKey, catNodes]) => {
        const isCollapsed = collapsedSet.has(catKey);
        if (isCollapsed) return;
        const ringsNeeded = Math.ceil(Math.sqrt(catNodes.length * 1.5));
        const extent = 120 + ringsNeeded * 80;
        if (extent > maxSatExtent) maxSatExtent = extent;
      });

      const orbitRadius = Math.max(380, 240 + maxSatExtent + Math.sqrt(others.length) * 16);
      const totalClusterRadius = orbitRadius + maxSatExtent + 60;
      const clusterCenterX = currentOffsetX + totalClusterRadius;

      // Place central seed node at center of the universe
      result.push({
        ...center,
        position: { x: clusterCenterX, y: 0 },
      });

      // Place each sub-category as a full 360° starburst at its orbit angle
      subCategories.forEach(([catKey, catNodes], catIndex) => {
        const isCollapsed = collapsedSet.has(catKey);
        const angle = (2 * Math.PI * catIndex) / numSubCats - Math.PI / 2;
        const satCenterX = clusterCenterX + Math.cos(angle) * orbitRadius;
        const satCenterY = Math.sin(angle) * orbitRadius;

        // Place the Sub-Category Hub Label Node at the center of the satellite
        const hubId = `hub_${cluster.seedNode ? cluster.seedNode.id : 'root'}_${catKey}`;
        result.push({
          id: hubId,
          type: 'cluster_hub',
          data: {
            isHub: true,
            categoryKey: catKey,
            label: catKey,
            count: catNodes.length,
            isCollapsed,
          } as any,
          position: { x: satCenterX, y: satCenterY },
        });

        // If not collapsed, place leaf nodes in 360° starburst around the Hub node
        if (!isCollapsed) {
          const starburstNodes = layoutStarburst({ x: satCenterX, y: satCenterY }, catNodes, 120);
          starburstNodes.forEach((node) => result.push(node));
        }
      });

      currentOffsetX += totalClusterRadius * 2 + CLUSTER_GAP;
    } else {
      // Direct center node only
      result.push({
        ...center,
        position: { x: currentOffsetX + 150, y: 0 },
      });
      currentOffsetX += 300 + CLUSTER_GAP;
    }
  }

  return result;
}
