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
export function getSubCategoryKey<T extends Record<string, unknown>>(node: SimpleNode<T>): string {
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

function matchesSeedProvenance(seedVal: string, derivedFrom: string): boolean {
  if (!seedVal || !derivedFrom) return false;
  const s = seedVal.toLowerCase().trim();
  const d = derivedFrom.toLowerCase().trim();
  if (s === d) return true;
  const sDigits = s.replace(/\D/g, '');
  const dDigits = d.replace(/\D/g, '');
  if (sDigits && dDigits && sDigits.length >= 6 && dDigits.length >= 6) {
    if (sDigits === dDigits) return true;
    const sSuffix = sDigits.replace(/^0+/, '').replace(/^62/, '');
    const dSuffix = dDigits.replace(/^0+/, '').replace(/^62/, '');
    if (sSuffix === dSuffix) return true;
  }
  return s.includes(d) || d.includes(s);
}

/**
 * Partition nodes & edges into independent seed subgraphs / connected components.
 * Guarantees that multiple seed targets NEVER collide, steal each other's nodes, or overlap.
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

  const forwardAdj = new Map<string, string[]>();
  const undirectedAdj = new Map<string, string[]>();
  actualNodes.forEach((n) => {
    forwardAdj.set(n.id, []);
    undirectedAdj.set(n.id, []);
  });

  edges.forEach((e) => {
    if (forwardAdj.has(e.source) && forwardAdj.has(e.target)) {
      forwardAdj.get(e.source)!.push(e.target);
    }
    if (undirectedAdj.has(e.source) && undirectedAdj.has(e.target)) {
      undirectedAdj.get(e.source)!.push(e.target);
      undirectedAdj.get(e.target)!.push(e.source);
    }
  });

  const seeds = actualNodes.filter(isSeedNode);

  // If we have multiple seeds, partition nodes by forward-derivation & nearest seed
  if (seeds.length > 1) {
    const seedIds = seeds.map((s) => s.id);
    const nodeToSeedDist = new Map<string, { seedId: string; dist: number }>();
    const seedClusters = new Map<string, SimpleNode<T>[]>();
    seeds.forEach((s) => seedClusters.set(s.id, [s]));

    // 1. First priority: Direct provenance attribution from node metadata
    for (const node of actualNodes) {
      if (seedIds.includes(node.id)) continue;
      const nData = (node.data || {}) as Record<string, any>;
      const nMeta = nData.metadata || {};
      const derivedFrom = String(
        nMeta.derivedFrom || nMeta.sourcePhone || nMeta.source?.derivedFrom || '',
      ).trim();

      if (derivedFrom) {
        for (const seed of seeds) {
          const seedData = (seed.data || {}) as Record<string, any>;
          const seedVal = String(seedData.value || seedData.label || '').trim();
          if (matchesSeedProvenance(seedVal, derivedFrom)) {
            nodeToSeedDist.set(node.id, { seedId: seed.id, dist: 0.5 });
            break;
          }
        }
      }
    }

    // 2. Second priority: Forward-directed BFS from each seed (following discovery direction)
    for (const seed of seeds) {
      const visited = new Set<string>([seed.id]);
      const queue: Array<{ id: string; dist: number }> = [{ id: seed.id, dist: 0 }];

      while (queue.length > 0) {
        const { id: curr, dist } = queue.shift()!;
        const forwardNeighbors = forwardAdj.get(curr) || [];

        for (const neighbor of forwardNeighbors) {
          if (seedIds.includes(neighbor) && neighbor !== seed.id) continue;

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

    // 3. Fallback: Undirected BFS for any remaining nodes not yet reached
    for (const seed of seeds) {
      const visited = new Set<string>([seed.id]);
      const queue: Array<{ id: string; dist: number }> = [{ id: seed.id, dist: 0 }];

      while (queue.length > 0) {
        const { id: curr, dist } = queue.shift()!;
        const neighbors = undirectedAdj.get(curr) || [];

        for (const neighbor of neighbors) {
          if (seedIds.includes(neighbor) && neighbor !== seed.id) continue;

          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            const currentRecord = nodeToSeedDist.get(neighbor);
            if (!currentRecord || dist + 10 < currentRecord.dist) {
              nodeToSeedDist.set(neighbor, { seedId: seed.id, dist: dist + 10 });
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

          const neighbors = undirectedAdj.get(curr) || [];
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

      const neighbors = undirectedAdj.get(curr) || [];
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
export function layoutStarburst<T extends Record<string, unknown>>(
  centerPos: { x: number; y: number },
  nodes: SimpleNode<T>[],
  startRadius = 85,
  startAngle = -Math.PI / 2,
  angleSpan = 2 * Math.PI,
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    const angle = startAngle + angleSpan / 2;
    return [{
      ...nodes[0],
      position: {
        x: Math.round(centerPos.x + Math.cos(angle) * startRadius),
        y: Math.round(centerPos.y + Math.sin(angle) * startRadius),
      },
    }];
  }

  const result: SimpleNode<T>[] = [];
  let nodeIndex = 0;
  let ringIndex = 0;
  const RING_STEP = 60;

  while (nodeIndex < nodes.length) {
    const currentRadius = startRadius + ringIndex * RING_STEP;
    // Calculate how many nodes fit nicely on this arc with at least 55px arc spacing
    const arcLength = Math.abs(angleSpan) * currentRadius;
    const maxNodesInRing = Math.max(3, Math.floor(arcLength / 55));

    const remaining = nodes.length - nodeIndex;
    const countInRing = Math.min(remaining, maxNodesInRing);
    const ringNodes = nodes.slice(nodeIndex, nodeIndex + countInRing);

    ringNodes.forEach((node, i) => {
      const angle =
        countInRing === 1
          ? startAngle + angleSpan / 2
          : startAngle + (angleSpan * (i + 0.5)) / countInRing;

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
  const CLUSTER_GAP = 140;

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
  const CLUSTER_GAP = 160;

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
// 3. Radial Layout (Maltego-style Concentric Radial & Starburst Tree)
// ─────────────────────────────────────────────────────────────────────────────
export function applyRadialLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
  _options?: {
    collapsedCategories?: string[];
  },
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: 0, y: 0 } }];

  const actualNodes = nodes.filter((n) => !(n.data as any)?.isHub && n.type !== 'cluster_hub');
  if (actualNodes.length === 0) return [];

  const clusters = partitionGraphClusters(actualNodes, edges);
  let currentOffsetX = 0;
  const result: SimpleNode<T>[] = [];
  const CLUSTER_GAP = 180;

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;

    if (cNodes.length === 1) {
      result.push({ ...cNodes[0], position: { x: currentOffsetX, y: 0 } });
      currentOffsetX += 200 + CLUSTER_GAP;
      continue;
    }

    const nodeMap = new Map<string, SimpleNode<T>>();
    cNodes.forEach((n) => nodeMap.set(n.id, n));

    const adj = new Map<string, string[]>();
    cNodes.forEach((n) => adj.set(n.id, []));
    cEdges.forEach((e) => {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.push(e.target);
        adj.get(e.target)!.push(e.source);
      }
    });

    // Determine root focal node of this cluster
    let root: SimpleNode<T>;
    if (cluster.seedNode) {
      root = cluster.seedNode;
    } else {
      const degrees = cNodes.map((n) => ({
        node: n,
        deg: adj.get(n.id)?.length || 0,
      }));
      degrees.sort((a, b) => b.deg - a.deg);
      root = degrees[0].node;
    }

    // Build spanning tree via BFS from root
    const parentMap = new Map<string, string | null>();
    const childrenMap = new Map<string, string[]>();
    const depthMap = new Map<string, number>();
    cNodes.forEach((n) => childrenMap.set(n.id, []));

    const visited = new Set<string>([root.id]);
    const queue: string[] = [root.id];
    parentMap.set(root.id, null);
    depthMap.set(root.id, 0);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const currDepth = depthMap.get(curr) || 0;
      const neighbors = adj.get(curr) || [];

      for (const nb of neighbors) {
        if (!visited.has(nb)) {
          visited.add(nb);
          parentMap.set(nb, curr);
          childrenMap.get(curr)!.push(nb);
          depthMap.set(nb, currDepth + 1);
          queue.push(nb);
        }
      }
    }

    // Add any disconnected nodes in cluster directly to root
    for (const n of cNodes) {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        parentMap.set(n.id, root.id);
        childrenMap.get(root.id)!.push(n.id);
        depthMap.set(n.id, 1);
      }
    }

    // Calculate subtree weight (number of leaves) for proportional angular allocation
    const weightMap = new Map<string, number>();
    function calcWeight(nodeId: string): number {
      const children = childrenMap.get(nodeId) || [];
      if (children.length === 0) {
        weightMap.set(nodeId, 1);
        return 1;
      }
      let sum = 0;
      for (const ch of children) {
        sum += calcWeight(ch);
      }
      const w = Math.max(1, sum);
      weightMap.set(nodeId, w);
      return w;
    }
    calcWeight(root.id);

    // Calculate dynamic base radius based on total nodes to prevent crowding
    const totalCount = cNodes.length;
    const baseRadius = Math.max(180, Math.min(340, 120 + totalCount * 12));
    const ringStep = Math.max(140, Math.min(240, 120 + totalCount * 5));

    // Map of positioned coordinates
    const positions = new Map<string, { x: number; y: number }>();
    positions.set(root.id, { x: 0, y: 0 });

    // Recursive Maltego Sector Placement
    function layoutSubtree(
      nodeId: string,
      startAngle: number,
      endAngle: number,
      currentRadius: number,
    ) {
      const children = childrenMap.get(nodeId) || [];
      if (children.length === 0) return;

      const totalWeight = children.reduce((acc, ch) => acc + (weightMap.get(ch) || 1), 0);
      const angleSpan = endAngle - startAngle;

      let currentAngle = startAngle;

      children.forEach((childId) => {
        const childWeight = weightMap.get(childId) || 1;
        const childSpan = (childWeight / totalWeight) * angleSpan;
        const midAngle = currentAngle + childSpan / 2;

        // Position child along its sector ray
        const px = Math.round(Math.cos(midAngle) * currentRadius);
        const py = Math.round(Math.sin(midAngle) * currentRadius);
        positions.set(childId, { x: px, y: py });

        // Recurse for grandchildren in the outer orbit
        const nextRadius = currentRadius + ringStep;
        layoutSubtree(childId, currentAngle, currentAngle + childSpan, nextRadius);

        currentAngle += childSpan;
      });
    }

    // Start full 360-degree layout from root (-PI to PI)
    layoutSubtree(root.id, -Math.PI, Math.PI, baseRadius);

    // Collision avoidance relaxation pass:
    // If any two nodes are closer than 85px, apply gentle repulsive displacement
    const posList = Array.from(positions.entries()).filter(([id]) => id !== root.id);
    for (let iter = 0; iter < 16; iter++) {
      let moved = false;
      for (let i = 0; i < posList.length; i++) {
        for (let j = i + 1; j < posList.length; j++) {
          const p1 = posList[i][1];
          const p2 = posList[j][1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = 85;

          if (dist < minDist) {
            const overlap = (minDist - dist) / 2;
            const nx = (dx / dist) * overlap;
            const ny = (dy / dist) * overlap;

            p1.x -= nx;
            p1.y -= ny;
            p2.x += nx;
            p2.y += ny;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    // Measure bounding box of this cluster
    let minX = 0;
    let maxX = 0;
    positions.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
    });

    const clusterWidth = maxX - minX;
    const clusterCenterX = currentOffsetX + Math.abs(minX) + 50;

    cNodes.forEach((n) => {
      const pos = positions.get(n.id) || { x: 0, y: 0 };
      result.push({
        ...n,
        position: {
          x: clusterCenterX + pos.x,
          y: pos.y,
        },
      });
    });

    currentOffsetX += clusterWidth + 100 + CLUSTER_GAP;
  }

  return result;
}
