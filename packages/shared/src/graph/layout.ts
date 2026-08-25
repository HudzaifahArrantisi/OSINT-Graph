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
    if (s.includes('dns') || s.includes('resolve-dns')) return 'subcat_dns';
    if (s.includes('tls') || s.includes('cert') || s.includes('find-tls')) return 'subcat_tls';
    if (s.includes('webpage') || s.includes('metadata') || s.includes('recon')) return 'subcat_webpage';
    if (s.includes('contact') || s.includes('breach') || s.includes('email-lookup')) return 'subcat_contact';
    if (s.includes('phone') || s.includes('geo')) return 'subcat_phone_geo';
    if (s.includes('social') || s.includes('username') || s.includes('mrholmes')) return 'subcat_social';
    if (s.includes('github') || s.includes('gitlab') || s.includes('developer')) return 'subcat_dev';
    if (s.includes('mention')) return 'subcat_mentions';
    return `subcat_${discoveredBy}`;
  }

  // Fallback categorization based on entityType
  const entityType = String(d.entityType || node.type || '').toUpperCase();
  if (['IP_ADDRESS', 'MX_RECORD', 'NS_RECORD', 'SUBDOMAIN'].includes(entityType)) return 'subcat_dns';
  if (['CERTIFICATE'].includes(entityType)) return 'subcat_tls';
  if (['TECHNOLOGY', 'WEBSITE', 'URL', 'DOCUMENT'].includes(entityType)) return 'subcat_webpage';
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
  if (nodes.length === 0) return [];

  const nodeMap = new Map<string, SimpleNode<T>>();
  nodes.forEach((n) => nodeMap.set(n.id, n));

  const adj = new Map<string, string[]>();
  nodes.forEach((n) => adj.set(n.id, []));

  edges.forEach((e) => {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
      adj.get(e.target)!.push(e.source);
    }
  });

  const seeds = nodes.filter(isSeedNode);

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

    for (const node of nodes) {
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
    ? [seeds[0], ...nodes.filter((n) => n.id !== seeds[0].id)]
    : nodes;

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
  const CLUSTER_GAP = 600;

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
    const xSpacing = 280;
    const ySpacing = 160;

    const clusterWidth = cols * xSpacing;

    nodeDegrees.forEach((item, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const jitterX = ((index * 37) % 30) - 15;
      const jitterY = ((index * 23) % 20) - 10;

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
// 2. Hierarchical / Tree Layout (Cluster-Aware)
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
  const CLUSTER_GAP = 600;

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

    // Root is the seed node if present, or zero in-degree nodes
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

    // Catch any node that was not reached by directed BFS
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

    const xSpacing = 280;
    const ySpacing = 180;
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

    currentOffsetX += Math.max(maxLayerWidth, 300) + CLUSTER_GAP;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Radial Layout (Sub-Category & Transform Satellite Constellations)
// ─────────────────────────────────────────────────────────────────────────────
export function applyRadialLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: 0, y: 0 } }];
  }

  const clusters = partitionGraphClusters(nodes, edges);
  let currentOffsetX = 0;
  const result: SimpleNode<T>[] = [];
  const CLUSTER_GAP = 800;

  for (const cluster of clusters) {
    const cNodes = cluster.nodes;
    const cEdges = cluster.edges;

    if (cNodes.length === 1) {
      result.push({
        ...cNodes[0],
        position: { x: currentOffsetX, y: 0 },
      });
      currentOffsetX += 300 + CLUSTER_GAP;
      continue;
    }

    const degrees = new Map<string, number>();
    cNodes.forEach((n) => degrees.set(n.id, 0));
    cEdges.forEach((e) => {
      degrees.set(e.source, (degrees.get(e.source) || 0) + 1);
      degrees.set(e.target, (degrees.get(e.target) || 0) + 1);
    });

    // Determine the focal center of this specific cluster
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

    // Partition children into Sub-Category Satellites (DNS, TLS, Webpage Metadata, Contacts, Social, etc.)
    const subCategoryGroups = new Map<string, SimpleNode<T>[]>();
    others.forEach((node) => {
      const subCat = getSubCategoryKey(node);
      if (!subCategoryGroups.has(subCat)) {
        subCategoryGroups.set(subCat, []);
      }
      subCategoryGroups.get(subCat)!.push(node);
    });

    const subCategories = Array.from(subCategoryGroups.entries());

    // If multiple sub-categories exist, organize them as Satellite Constellations
    if (subCategories.length > 1) {
      const numSubCats = subCategories.length;
      const orbitRadius = Math.max(550, 380 + Math.sqrt(others.length) * 50);

      // Estimate max extent of each satellite mini-circle
      let maxSubCatRadius = 180;
      subCategories.forEach(([, catNodes]) => {
        const catRadius = 150 + Math.floor(catNodes.length / 6) * 120;
        if (catRadius > maxSubCatRadius) maxSubCatRadius = catRadius;
      });

      const totalClusterRadius = orbitRadius + maxSubCatRadius;
      const clusterCenterX = currentOffsetX + totalClusterRadius;

      // Place central seed node
      result.push({
        ...center,
        position: { x: clusterCenterX, y: 0 },
      });

      // Place each sub-category satellite at its own orbit angle
      subCategories.forEach(([catKey, catNodes], catIndex) => {
        const angle = (2 * Math.PI * catIndex) / numSubCats - Math.PI / 2;
        const satCenterX = clusterCenterX + Math.cos(angle) * orbitRadius;
        const satCenterY = Math.sin(angle) * orbitRadius;

        if (catNodes.length === 1) {
          result.push({
            ...catNodes[0],
            position: { x: satCenterX, y: satCenterY },
          });
        } else {
          // Distribute mini-circle around satellite center
          const localRingRadius = Math.max(160, 45 * Math.min(catNodes.length, 6));
          catNodes.forEach((node, idx) => {
            const localAngle = (2 * Math.PI * idx) / catNodes.length;
            const ringOffset = Math.floor(idx / 6) * 140;
            const finalRadius = localRingRadius + ringOffset;

            result.push({
              ...node,
              position: {
                x: satCenterX + Math.cos(localAngle) * finalRadius,
                y: satCenterY + Math.sin(localAngle) * finalRadius,
              },
            });
          });
        }
      });

      currentOffsetX += totalClusterRadius * 2 + CLUSTER_GAP;
    } else {
      // Single sub-category: standard radial concentric rings
      others.sort((a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0));

      const ringPlacements: Array<{ radius: number; nodes: SimpleNode<T>[] }> = [];
      let nodeIndex = 0;
      let ringNumber = 1;

      while (nodeIndex < others.length) {
        const ringRadius = 320 * ringNumber;
        const maxNodesInRing = Math.max(6, Math.floor((2 * Math.PI * ringRadius) / 280));
        const sliceCount = Math.min(others.length - nodeIndex, maxNodesInRing);
        const ringNodes = others.slice(nodeIndex, nodeIndex + sliceCount);

        ringPlacements.push({
          radius: ringRadius,
          nodes: ringNodes,
        });

        nodeIndex += sliceCount;
        ringNumber++;
      }

      const maxRadius = ringPlacements.length > 0
        ? ringPlacements[ringPlacements.length - 1].radius
        : 300;

      const clusterCenterX = currentOffsetX + maxRadius;

      // Place center node
      result.push({
        ...center,
        position: { x: clusterCenterX, y: 0 },
      });

      // Place nodes in each ring
      ringPlacements.forEach((ring, rIdx) => {
        const count = ring.nodes.length;
        const phaseOffset = (rIdx * 0.43) % (2 * Math.PI);

        ring.nodes.forEach((node, i) => {
          const angle = (2 * Math.PI * i) / count + phaseOffset;
          result.push({
            ...node,
            position: {
              x: clusterCenterX + Math.cos(angle) * ring.radius,
              y: Math.sin(angle) * ring.radius,
            },
          });
        });
      });

      currentOffsetX += maxRadius * 2 + CLUSTER_GAP;
    }
  }

  return result;
}
