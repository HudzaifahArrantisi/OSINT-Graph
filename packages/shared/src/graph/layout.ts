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
  const entityType = String(d.entityType || node.type || '').toUpperCase();
  const label = String(d.label || d.value || '').toLowerCase();
  const metadata = d.metadata || {};

  // Check specific dork types / search types
  if (label.startsWith('inurl:') || label.includes('site:') || label.includes('filetype:') || label.includes('intitle:')) {
    if (label.startsWith('inurl:')) return 'subcat_dork_inurl';
    if (label.startsWith('site:')) return 'subcat_dork_site';
    if (label.startsWith('filetype:')) return 'subcat_dork_filetype';
    if (label.startsWith('intitle:')) return 'subcat_dork_intitle';
    return 'subcat_dorks';
  }

  // Exact type mappings
  if (entityType === 'IP_ADDRESS' || entityType === 'IP') return 'subcat_ip';
  if (entityType === 'SUBDOMAIN') return 'subcat_subdomain';
  if (entityType === 'DOMAIN' || entityType === 'WEBSITE') return 'subcat_domain';
  if (entityType === 'URL') return 'subcat_url';
  if (entityType === 'DOCUMENT') return 'subcat_document';
  if (entityType === 'LOCATION' || entityType === 'ADDRESS') return 'subcat_location';
  if (entityType === 'NS_RECORD' || entityType === 'MX_RECORD' || entityType === 'DNS_RECORD') return 'subcat_dns';
  if (entityType === 'CERTIFICATE' || entityType === 'TLS_CERTIFICATE') return 'subcat_tls';
  if (entityType === 'TECHNOLOGY') return 'subcat_tech';
  if (entityType === 'EMAIL' || entityType === 'PERSON' || entityType === 'ORGANIZATION') return 'subcat_contact';
  if (entityType === 'PHONE') return 'subcat_phone';
  if (['SOCIAL_PROFILE', 'GITHUB_PROFILE', 'GITLAB_PROFILE', 'YOUTUBE_CHANNEL', 'USERNAME'].includes(entityType)) return 'subcat_social';
  if (entityType === 'PUBLIC_MENTION') return 'subcat_mentions';

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
    if (s.includes('phone') || s.includes('geo')) return 'subcat_phone';
    if (s.includes('social') || s.includes('username') || s.includes('mrholmes') || s.includes('holehe') || s.includes('email-crawl')) return 'subcat_social';
    if (s.includes('github') || s.includes('gitlab') || s.includes('developer')) return 'subcat_dev';
    if (s.includes('shodan') || s.includes('port') || s.includes('service')) return 'subcat_tech';
    if (s.includes('dork') || s.includes('generate-dorks')) return 'subcat_dorks';
    if (s.includes('mention')) return 'subcat_mentions';
    return `subcat_${discoveredBy}`;
  }

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
  // If either contains an email/full identifier, do strict equality or handle matching, not generic substring
  if (s.includes('@') || d.includes('@')) {
    return s === d;
  }
  return false;
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
 * Helper to layout a list of nodes in a true Maltego-style multi-ring concentric circular dandelion/flower
 */
export function layoutStarburst<T extends Record<string, unknown>>(
  centerPos: { x: number; y: number },
  nodes: SimpleNode<T>[],
  startRadius = 45,
  _startAngle = -Math.PI / 2,
  _angleSpan = 2 * Math.PI,
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{
      ...nodes[0],
      position: {
        x: centerPos.x,
        y: centerPos.y,
      },
    }];
  }

  const result: SimpleNode<T>[] = [];
  let nodeIndex = 0;
  let ringIndex = 0;
  const RING_STEP = 42; // Compact ring spacing

  // Place first node at center if ringIndex == 0 and many nodes
  while (nodeIndex < nodes.length) {
    if (ringIndex === 0 && nodes.length > 3) {
      // Place first 1 node right at the center of the satellite
      result.push({
        ...nodes[0],
        position: { x: centerPos.x, y: centerPos.y },
      });
      nodeIndex = 1;
      ringIndex = 1;
      continue;
    }

    const currentRadius = startRadius + (ringIndex - 1) * RING_STEP;
    // Calculate how many nodes fit nicely around full 360 degree circle at current radius
    const circumference = 2 * Math.PI * currentRadius;
    const maxNodesInRing = Math.max(6, Math.floor(circumference / 44));

    const remaining = nodes.length - nodeIndex;
    const countInRing = Math.min(remaining, maxNodesInRing);
    const ringNodes = nodes.slice(nodeIndex, nodeIndex + countInRing);

    // Stagger alternate rings for triangular close-packing
    const ringOffsetAngle = (ringIndex % 2 === 1 ? 0 : Math.PI / countInRing) - Math.PI / 2;

    ringNodes.forEach((node, i) => {
      const angle = ringOffsetAngle + (2 * Math.PI * i) / countInRing;
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
// 3. Radial Layout (True Maltego-style Starburst Category Satellites)
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
  const CLUSTER_GAP = 280;

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

    // Root focal node (seed target, e.g. Domain or Apex)
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

    const nonRootNodes = cNodes.filter((n) => n.id !== root.id);

    // Group EVERY non-root node strictly by its category key (subcat_ip, subcat_dns, subcat_tech, subcat_tls, subcat_subdomain, etc.)
    const categoryGroups = new Map<string, SimpleNode<T>[]>();
    nonRootNodes.forEach((node) => {
      const catKey = getSubCategoryKey(node);
      if (!categoryGroups.has(catKey)) {
        categoryGroups.set(catKey, []);
      }
      categoryGroups.get(catKey)!.push(node);
    });

    // Order categories by size (largest first)
    const categoryKeys = Array.from(categoryGroups.keys()).sort((a, b) => {
      const lenA = categoryGroups.get(a)!.length;
      const lenB = categoryGroups.get(b)!.length;
      return lenB - lenA;
    });

    const numCategories = categoryKeys.length;

    const positions = new Map<string, { x: number; y: number }>();
    positions.set(root.id, { x: 0, y: 0 });

    if (numCategories === 0) {
      result.push({ ...root, position: { x: currentOffsetX, y: 0 } });
      currentOffsetX += 200 + CLUSTER_GAP;
      continue;
    }

    // Determine cluster footprint radius for each category flower
    const categoryFootprints = new Map<string, number>();
    categoryKeys.forEach((key) => {
      const count = categoryGroups.get(key)!.length;
      if (count <= 1) {
        categoryFootprints.set(key, 25);
      } else if (count <= 6) {
        categoryFootprints.set(key, 55);
      } else if (count <= 18) {
        categoryFootprints.set(key, 95);
      } else if (count <= 40) {
        categoryFootprints.set(key, 140);
      } else {
        categoryFootprints.set(key, Math.min(220, 140 + Math.sqrt(count) * 6));
      }
    });

    // Compute global orbit radius from seed to category centers
    // Ensures adjacent satellite flowers never collide
    let maxFootprint = 0;
    categoryFootprints.forEach((fp) => {
      if (fp > maxFootprint) maxFootprint = fp;
    });

    // Minimum angular separation chord length >= 2 * maxFootprint + 40px margin
    const minChord = Math.max(160, 2 * maxFootprint * 0.85 + 50);
    const requiredOrbitForAngle = minChord / (2 * Math.sin(Math.PI / Math.max(numCategories, 2)));
    const globalOrbitRadius = Math.max(180, Math.min(650, requiredOrbitForAngle));

    // Arrange each category satellite around the seed
    categoryKeys.forEach((catKey, idx) => {
      const catNodes = categoryGroups.get(catKey)!;
      const count = catNodes.length;

      // Position category center angle
      const catAngle = -Math.PI / 2 + (2 * Math.PI * idx) / numCategories;
      const centerX = Math.round(Math.cos(catAngle) * globalOrbitRadius);
      const centerY = Math.round(Math.sin(catAngle) * globalOrbitRadius);

      if (count === 1) {
        positions.set(catNodes[0].id, { x: centerX, y: centerY });
      } else if (count <= 6) {
        // Small category: Primary category node at center (0), remaining 5 in a circle around it
        positions.set(catNodes[0].id, { x: centerX, y: centerY });
        const ringNodes = catNodes.slice(1);
        const ringRadius = 46;
        ringNodes.forEach((node, i) => {
          const a = catAngle - Math.PI / 2 + (2 * Math.PI * i) / ringNodes.length;
          positions.set(node.id, {
            x: Math.round(centerX + Math.cos(a) * ringRadius),
            y: Math.round(centerY + Math.sin(a) * ringRadius),
          });
        });
      } else {
        // Multi-node category: Primary node at (centerX, centerY), children blossoming in 360° concentric dandelion rings
        const starNodes = layoutStarburst(
          { x: centerX, y: centerY },
          catNodes,
          44, // start radius
          catAngle,
          2 * Math.PI,
        );
        starNodes.forEach((sn) => {
          positions.set(sn.id, { x: sn.position.x, y: sn.position.y });
        });
      }
    });

    // Inter-node relaxation to eliminate any micro-overlaps
    const posList = Array.from(positions.entries()).filter(([id]) => id !== root.id);
    for (let iter = 0; iter < 12; iter++) {
      let moved = false;
      for (let i = 0; i < posList.length; i++) {
        for (let j = i + 1; j < posList.length; j++) {
          const p1 = posList[i][1];
          const p2 = posList[j][1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = 46;

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

    // Measure cluster bounding box
    let minX = 0;
    let maxX = 0;
    positions.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
    });

    const clusterWidth = maxX - minX;
    const clusterCenterX = currentOffsetX + Math.abs(minX) + 60;

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

    currentOffsetX += clusterWidth + 120 + CLUSTER_GAP;
  }

  return result;
}
