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
      const uNodeSet = new Set(unassignedNodes.map((n) => n.id));
      const uEdges = edges.filter(
        (e) => uNodeSet.has(e.source) && uNodeSet.has(e.target),
      );
      clusters.push({
        id: 'unassigned-satellites',
        nodes: unassignedNodes,
        edges: uEdges,
      });
    }

    return clusters;
  }

  // Single seed: all nodes discovered in this case belong to the investigation seed!
  if (seeds.length === 1) {
    const seed = seeds[0];
    const clusterEdges = edges.filter(
      (e) => nodeMap.has(e.source) && nodeMap.has(e.target),
    );
    return [
      {
        id: `seed-${seed.id}`,
        seedNode: seed,
        nodes: [seed, ...actualNodes.filter((n) => n.id !== seed.id)],
        edges: clusterEdges,
      },
    ];
  }

  // No seeds: partition into connected components, grouping single isolated nodes
  const visited = new Set<string>();
  const clusters: GraphCluster<T>[] = [];
  const isolatedNodes: SimpleNode<T>[] = [];

  for (const node of actualNodes) {
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

    if (compNodes.length === 1 && compEdges.length === 0) {
      isolatedNodes.push(compNodes[0]);
    } else {
      clusters.push({
        id: `comp-${node.id}`,
        nodes: compNodes,
        edges: compEdges,
      });
    }
  }

  if (isolatedNodes.length > 0) {
    clusters.push({
      id: 'isolated-nodes',
      nodes: isolatedNodes,
      edges: [],
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
  startRadius = 120,
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
  const RING_STEP = 58; // Compact radial spacing between concentric rings
  const MIN_ARC_PER_NODE = 120; // Compact arc distance per node badge to prevent excessive distance

  while (nodeIndex < nodes.length) {
    const currentRadius = startRadius + ringIndex * RING_STEP;
    // Calculate how many nodes fit nicely around 360-degree circle at current radius
    const circumference = 2 * Math.PI * currentRadius;
    const maxNodesInRing = Math.max(5, Math.floor(circumference / MIN_ARC_PER_NODE));

    const remaining = nodes.length - nodeIndex;
    const countInRing = Math.min(remaining, maxNodesInRing);
    const ringNodes = nodes.slice(nodeIndex, nodeIndex + countInRing);

    // Stagger alternate rings for triangular close-packing
    const ringOffsetAngle = (ringIndex % 2 === 1 ? Math.PI / countInRing : 0) - Math.PI / 2;

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
// 2D Cluster Grid Packing Helper
// Prevents multiple clusters or disconnected components from stretching horizontally in 1D
// ─────────────────────────────────────────────────────────────────────────────
export interface ClusterBox {
  width: number;
  height: number;
  minX: number;
  minY: number;
}

export interface ClusterPlacement {
  offsetX: number;
  offsetY: number;
}

export function computeClusterGridOffsets(
  boxes: ClusterBox[],
  gap = 180,
): ClusterPlacement[] {
  if (boxes.length === 0) return [];
  if (boxes.length === 1) {
    return [
      {
        offsetX: Math.abs(boxes[0].minX),
        offsetY: Math.abs(boxes[0].minY),
      },
    ];
  }

  // Pack clusters in a balanced 2D grid (1 to 3 columns)
  const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(boxes.length))));
  const numRows = Math.ceil(boxes.length / cols);

  const colWidths = new Array(cols).fill(0);
  const rowHeights = new Array(numRows).fill(0);

  boxes.forEach((box, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    if (box.width > colWidths[col]) colWidths[col] = box.width;
    if (box.height > rowHeights[row]) rowHeights[row] = box.height;
  });

  const colStarts = [0];
  for (let c = 1; c < cols; c++) {
    colStarts[c] = colStarts[c - 1] + colWidths[c - 1] + gap;
  }

  const rowStarts = [0];
  for (let r = 1; r < numRows; r++) {
    rowStarts[r] = rowStarts[r - 1] + rowHeights[r - 1] + gap;
  }

  return boxes.map((box, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      offsetX: colStarts[col] + Math.abs(box.minX),
      offsetY: rowStarts[row] + Math.abs(box.minY),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Force / Grid Layout (Cluster-Aware 2D Organic Layout)
// ─────────────────────────────────────────────────────────────────────────────
export function applyForceLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) return [{ ...nodes[0], position: { x: 0, y: 0 } }];

  const clusters = partitionGraphClusters(nodes, edges);
  if (clusters.length === 0) return nodes;

  const clusterBoxes: ClusterBox[] = [];
  const clusterRelativePositions: Array<Map<string, { x: number; y: number }>> = [];

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;
    const posMap = new Map<string, { x: number; y: number }>();

    if (cNodes.length === 1) {
      posMap.set(cNodes[0].id, { x: 0, y: 0 });
      clusterRelativePositions.push(posMap);
      clusterBoxes.push({ width: 140, height: 100, minX: -70, minY: -50 });
      continue;
    }

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

    const connected = nodeDegrees.filter((item) => item.degree > 0);
    const isolated = nodeDegrees.filter((item) => item.degree === 0);

    const xSpacing = 205;
    const ySpacing = 125;

    // If all nodes are isolated or graph has very few edges:
    // Arrange in a clean, balanced, data-dense 2D grid matrix centered around (0, 0)
    if (connected.length <= 1) {
      const allItems = nodeDegrees;
      const cols = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(allItems.length * 1.5))));
      const rows = Math.ceil(allItems.length / cols);
      const startX = -((cols - 1) * xSpacing) / 2;
      const startY = -((rows - 1) * ySpacing) / 2;

      allItems.forEach((item, index) => {
        const r = Math.floor(index / cols);
        const c = index % cols;
        const jitterX = ((index * 37) % 16) - 8;
        const jitterY = ((index * 23) % 12) - 6;
        posMap.set(item.node.id, {
          x: Math.round(startX + c * xSpacing + jitterX + (r % 2 === 1 ? xSpacing / 4 : 0)),
          y: Math.round(startY + r * ySpacing + jitterY),
        });
      });
    } else {
      // Connected nodes: Seed at center (0, 0), remaining nodes arranged by degree & spring relaxation
      const cols = Math.max(3, Math.min(7, Math.ceil(Math.sqrt(connected.length * 1.3))));
      const rows = Math.ceil(connected.length / cols);
      const startX = -((cols - 1) * xSpacing) / 2;
      const startY = -((rows - 1) * ySpacing) / 2;

      connected.forEach((item, index) => {
        const r = Math.floor(index / cols);
        const c = index % cols;
        const jitterX = ((index * 31) % 16) - 8;
        const jitterY = ((index * 19) % 12) - 6;
        posMap.set(item.node.id, {
          x: Math.round(startX + c * xSpacing + jitterX + (r % 2 === 1 ? xSpacing / 4 : 0)),
          y: Math.round(startY + r * ySpacing + jitterY),
        });
      });

      // Quick spring relaxation (15 iterations) to pull connected nodes toward each other
      for (let iter = 0; iter < 15; iter++) {
        cEdges.forEach((e) => {
          const p1 = posMap.get(e.source);
          const p2 = posMap.get(e.target);
          if (!p1 || !p2) return;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = 160;
          const force = (dist - targetDist) * 0.05;
          const nx = (dx / dist) * force;
          const ny = (dy / dist) * force;
          if (!isSeedNode(nodeDegrees.find((n) => n.node.id === e.source)?.node!)) {
            p1.x += nx;
            p1.y += ny;
          }
          if (!isSeedNode(nodeDegrees.find((n) => n.node.id === e.target)?.node!)) {
            p2.x -= nx;
            p2.y -= ny;
          }
        });
      }

      // If isolated nodes exist alongside connected nodes, place them in a neat shelf below
      if (isolated.length > 0) {
        let maxConnectedY = 0;
        posMap.forEach((pos) => {
          if (pos.y > maxConnectedY) maxConnectedY = pos.y;
        });

        const isoCols = Math.max(3, Math.min(8, Math.ceil(Math.sqrt(isolated.length * 1.5))));
        const isoStartX = -((isoCols - 1) * xSpacing) / 2;
        const isoStartY = maxConnectedY + 140;

        isolated.forEach((item, index) => {
          const r = Math.floor(index / isoCols);
          const c = index % isoCols;
          const jitterX = ((index * 37) % 14) - 7;
          const jitterY = ((index * 23) % 10) - 5;
          posMap.set(item.node.id, {
            x: Math.round(isoStartX + c * xSpacing + jitterX),
            y: Math.round(isoStartY + r * ySpacing + jitterY),
          });
        });
      }
    }

    // Measure bounding box of this cluster
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    posMap.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    });

    clusterBoxes.push({
      width: Math.max(140, maxX - minX),
      height: Math.max(100, maxY - minY),
      minX: minX === Infinity ? 0 : minX,
      minY: minY === Infinity ? 0 : minY,
    });
    clusterRelativePositions.push(posMap);
  }

  const placements = computeClusterGridOffsets(clusterBoxes, 180);
  const result: SimpleNode<T>[] = [];

  clusters.forEach((cluster, cIdx) => {
    const posMap = clusterRelativePositions[cIdx];
    const placement = placements[cIdx];

    cluster.nodes.forEach((n) => {
      const p = posMap.get(n.id) || { x: 0, y: 0 };
      result.push({
        ...n,
        position: {
          x: Math.round(placement.offsetX + p.x),
          y: Math.round(placement.offsetY + p.y),
        },
      });
    });
  });

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
  const clusterBoxes: ClusterBox[] = [];
  const clusterRelativePositions: Array<Map<string, { x: number; y: number }>> = [];

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;
    const posMap = new Map<string, { x: number; y: number }>();

    if (cNodes.length === 1) {
      posMap.set(cNodes[0].id, { x: 0, y: 0 });
      clusterRelativePositions.push(posMap);
      clusterBoxes.push({ width: 160, height: 100, minX: -80, minY: -50 });
      continue;
    }

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

    // Root node: seed node takes top precedence, then in-degree 0 nodes
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

    // Any unlinked nodes in this cluster belong to Layer 1 (direct discoveries under root)
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

    const CARD_W = 160;
    const CARD_GAP_X = 24;
    const xSpacing = CARD_W + CARD_GAP_X; // 184px spacing between node columns
    const layerYSpacing = 160; // Clean vertical drop between Seed and child layers
    const subRowSpacing = 56; // 38px node height + 18px vertical row gap
    const CATEGORY_BLOCK_GAP = 48; // Clear horizontal separation between distinct category clusters

    // Arrange nodes per layer with sub-row wrapping to prevent infinite horizontal lines!
    layerGroups.forEach((groupNodes, layerIndex) => {
      const layerBaseY = layerIndex * layerYSpacing;

      if (layerIndex === 0) {
        // Layer 0: Root nodes centered at (0, layerBaseY)
        const totalW = (groupNodes.length - 1) * xSpacing;
        const startX = -totalW / 2;
        groupNodes.forEach((n, i) => {
          posMap.set(n.id, { x: Math.round(startX + i * xSpacing), y: layerBaseY });
        });
        return;
      }

      // Group nodes by category on this layer
      const catGroups = new Map<string, SimpleNode<T>[]>();
      groupNodes.forEach((n) => {
        const k = getSubCategoryKey(n);
        if (!catGroups.has(k)) catGroups.set(k, []);
        catGroups.get(k)!.push(n);
      });

      // Calculate width of each category block (each block has max 5 cols)
      const MAX_COLS_PER_BLOCK = 5;
      const catBlocks: Array<{
        catKey: string;
        nodes: SimpleNode<T>[];
        cols: number;
        rows: number;
        spanWidth: number;
      }> = [];

      catGroups.forEach((catGroupNodes, catKey) => {
        const cols = Math.min(catGroupNodes.length, MAX_COLS_PER_BLOCK);
        const rows = Math.ceil(catGroupNodes.length / cols);
        catBlocks.push({
          catKey,
          nodes: catGroupNodes,
          cols,
          rows,
          spanWidth: cols * xSpacing,
        });
      });

      const totalBlocksWidth =
        catBlocks.reduce((acc, b) => acc + b.spanWidth, 0) +
        Math.max(0, catBlocks.length - 1) * CATEGORY_BLOCK_GAP;

      let currentBlockX = -totalBlocksWidth / 2;

      catBlocks.forEach((block) => {
        const startX = currentBlockX;
        block.nodes.forEach((n, i) => {
          const col = i % block.cols;
          const row = Math.floor(i / block.cols);
          posMap.set(n.id, {
            x: Math.round(startX + col * xSpacing),
            y: Math.round(layerBaseY + row * subRowSpacing),
          });
        });
        currentBlockX += block.spanWidth + CATEGORY_BLOCK_GAP;
      });
    });

    // Measure bounding box
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    posMap.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    });

    clusterBoxes.push({
      width: Math.max(160, maxX - minX),
      height: Math.max(100, maxY - minY),
      minX: minX === Infinity ? 0 : minX,
      minY: minY === Infinity ? 0 : minY,
    });
    clusterRelativePositions.push(posMap);
  }

  const placements = computeClusterGridOffsets(clusterBoxes, 200);
  const result: SimpleNode<T>[] = [];

  clusters.forEach((cluster, cIdx) => {
    const posMap = clusterRelativePositions[cIdx];
    const placement = placements[cIdx];

    cluster.nodes.forEach((n) => {
      const p = posMap.get(n.id) || { x: 0, y: 0 };
      result.push({
        ...n,
        position: {
          x: Math.round(placement.offsetX + p.x),
          y: Math.round(placement.offsetY + p.y),
        },
      });
    });
  });

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
  const clusterBoxes: ClusterBox[] = [];
  const clusterRelativePositions: Array<Map<string, { x: number; y: number }>> = [];

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;
    const posMap = new Map<string, { x: number; y: number }>();

    if (cNodes.length === 1) {
      posMap.set(cNodes[0].id, { x: 0, y: 0 });
      clusterRelativePositions.push(posMap);
      clusterBoxes.push({ width: 160, height: 100, minX: -80, minY: -50 });
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

    // Root focal node: Seed node first, or highest degree node
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

    posMap.set(root.id, { x: 0, y: 0 });

    const nonRootNodes = cNodes.filter((n) => n.id !== root.id);

    // Group EVERY non-root node strictly by its category key
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

    if (numCategories === 0) {
      clusterBoxes.push({ width: 160, height: 100, minX: -80, minY: -50 });
      clusterRelativePositions.push(posMap);
      continue;
    }

    const totalNonRoot = nonRootNodes.length;
    const dominantCategory = categoryKeys[0];
    const dominantCount = categoryGroups.get(dominantCategory)?.length || 0;
    const isSingleDominant =
      numCategories === 1 ||
      (dominantCount / Math.max(1, totalNonRoot) >= 0.75 && dominantCount >= 10);

    if (isSingleDominant) {
      // Dominant category (e.g. all endpoints discovered from target):
      // Bloom in balanced, non-overlapping concentric dandelion rings directly around the seed!
      const dominantNodes = categoryGroups.get(dominantCategory)!;
      const starNodes = layoutStarburst(
        { x: 0, y: 0 },
        dominantNodes,
        125, // Compact startRadius so root seed has clean breathing space without pushing nodes too far
      );
      starNodes.forEach((sn) => {
        posMap.set(sn.id, { x: sn.position.x, y: sn.position.y });
      });

      // Place any remaining minor categories in clear outer satellite orbits
      const remainingKeys = categoryKeys.slice(1);
      if (remainingKeys.length > 0) {
        let maxStarDist = 130;
        starNodes.forEach((sn) => {
          const d = Math.hypot(sn.position.x, sn.position.y);
          if (d > maxStarDist) maxStarDist = d;
        });

        const minorOrbitRadius = maxStarDist + 65;
        remainingKeys.forEach((k, rIdx) => {
          const minorNodes = categoryGroups.get(k)!;
          const minorAngle = Math.PI / 2 + (Math.PI * (rIdx + 1)) / (remainingKeys.length + 1);
          const cx = Math.round(Math.cos(minorAngle) * minorOrbitRadius);
          const cy = Math.round(Math.sin(minorAngle) * minorOrbitRadius);

          if (minorNodes.length === 1) {
            posMap.set(minorNodes[0].id, { x: cx, y: cy });
          } else {
            const mStar = layoutStarburst({ x: cx, y: cy }, minorNodes, 90);
            mStar.forEach((msn) => posMap.set(msn.id, { x: msn.position.x, y: msn.position.y }));
          }
        });
      }
    } else {
      // Multiple balanced categories: Place each category flower in a spacious orbit around the seed
      const categoryFootprints = new Map<string, number>();
      categoryKeys.forEach((key) => {
        const count = categoryGroups.get(key)!.length;
        if (count <= 1) {
          categoryFootprints.set(key, 60);
        } else if (count <= 6) {
          categoryFootprints.set(key, 110);
        } else if (count <= 18) {
          categoryFootprints.set(key, 170);
        } else if (count <= 40) {
          categoryFootprints.set(key, 240);
        } else {
          categoryFootprints.set(key, Math.min(340, 240 + Math.sqrt(count) * 10));
        }
      });

      let maxFootprint = 0;
      categoryFootprints.forEach((fp) => {
        if (fp > maxFootprint) maxFootprint = fp;
      });

      const minChord = Math.max(180, 2 * maxFootprint * 0.8 + 60);
      const requiredOrbitForAngle = minChord / (2 * Math.sin(Math.PI / Math.max(numCategories, 2)));
      const globalOrbitRadius = Math.max(200, Math.min(550, requiredOrbitForAngle));

      categoryKeys.forEach((catKey, idx) => {
        const catNodes = categoryGroups.get(catKey)!;
        const count = catNodes.length;

        // Distribute category centers around full 360 circle
        const catAngle = -Math.PI / 2 + (2 * Math.PI * idx) / numCategories;
        const centerX = Math.round(Math.cos(catAngle) * globalOrbitRadius);
        const centerY = Math.round(Math.sin(catAngle) * globalOrbitRadius);

        if (count === 1) {
          posMap.set(catNodes[0].id, { x: centerX, y: centerY });
        } else if (count <= 6) {
          posMap.set(catNodes[0].id, { x: centerX, y: centerY });
          const ringNodes = catNodes.slice(1);
          const ringRadius = 80;
          ringNodes.forEach((node, i) => {
            const a = catAngle - Math.PI / 2 + (2 * Math.PI * i) / ringNodes.length;
            posMap.set(node.id, {
              x: Math.round(centerX + Math.cos(a) * ringRadius),
              y: Math.round(centerY + Math.sin(a) * ringRadius),
            });
          });
        } else {
          const starNodes = layoutStarburst(
            { x: centerX, y: centerY },
            catNodes,
            90,
            catAngle,
            2 * Math.PI,
          );
          starNodes.forEach((sn) => {
            posMap.set(sn.id, { x: sn.position.x, y: sn.position.y });
          });
        }
      });
    }

    // Elliptical inter-node relaxation to eliminate any remaining overlaps
    const posList = Array.from(posMap.entries()).filter(([id]) => id !== root.id);
    const NODE_BOX_W = 162; // Entity node badge width (160px) + 2px safety margin
    const NODE_BOX_H = 44; // Entity node badge height (38px) + 6px breathing gap

    for (let iter = 0; iter < 10; iter++) {
      let moved = false;
      for (let i = 0; i < posList.length; i++) {
        for (let j = i + 1; j < posList.length; j++) {
          const p1 = posList[i][1];
          const p2 = posList[j][1];
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;

          // Elliptical normalized distance
          const normDist = Math.hypot(dx / NODE_BOX_W, dy / NODE_BOX_H);

          if (normDist < 0.92) {
            const safeDist = normDist || 0.001;
            const overlapRatio = (0.92 - normDist) / 2;
            const shiftX = Math.round((dx / safeDist) * overlapRatio * 0.35 * NODE_BOX_W);
            const shiftY = Math.round((dy / safeDist) * overlapRatio * 0.35 * NODE_BOX_H);

            p1.x -= shiftX || 1;
            p1.y -= shiftY || 1;
            p2.x += shiftX || 1;
            p2.y += shiftY || 1;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }

    // Measure cluster bounding box
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    posMap.forEach((pos) => {
      if (pos.x < minX) minX = pos.x;
      if (pos.x > maxX) maxX = pos.x;
      if (pos.y < minY) minY = pos.y;
      if (pos.y > maxY) maxY = pos.y;
    });

    clusterBoxes.push({
      width: Math.max(160, maxX - minX),
      height: Math.max(120, maxY - minY),
      minX: minX === Infinity ? 0 : minX,
      minY: minY === Infinity ? 0 : minY,
    });
    clusterRelativePositions.push(posMap);
  }

  const placements = computeClusterGridOffsets(clusterBoxes, 240);
  const result: SimpleNode<T>[] = [];

  clusters.forEach((cluster, cIdx) => {
    const posMap = clusterRelativePositions[cIdx];
    const placement = placements[cIdx];

    cluster.nodes.forEach((n) => {
      const p = posMap.get(n.id) || { x: 0, y: 0 };
      result.push({
        ...n,
        position: {
          x: Math.round(placement.offsetX + p.x),
          y: Math.round(placement.offsetY + p.y),
        },
      });
    });
  });

  return result;
}
