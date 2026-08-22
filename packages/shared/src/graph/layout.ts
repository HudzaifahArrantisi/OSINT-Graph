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

// 1. Force-like grid / spring approximation
export function applyForceLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];

  const connections = new Map<string, string[]>();
  nodes.forEach((n) => connections.set(n.id, []));
  edges.forEach((e) => {
    connections.get(e.source)?.push(e.target);
    connections.get(e.target)?.push(e.source);
  });

  const nodeDegrees = nodes.map((n) => ({
    node: n,
    degree: connections.get(n.id)?.length || 0,
  }));

  nodeDegrees.sort((a, b) => b.degree - a.degree);

  const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length * 1.4)));
  const xSpacing = 280;
  const ySpacing = 160;

  return nodeDegrees.map((item, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const jitterX = ((index * 37) % 30) - 15;
    const jitterY = ((index * 23) % 20) - 10;

    return {
      ...item.node,
      position: {
        x: col * xSpacing + jitterX + (row % 2 === 1 ? xSpacing / 3 : 0),
        y: row * ySpacing + jitterY,
      },
    };
  });
}

// 2. Hierarchical / Tree Layout
export function applyHierarchicalLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];

  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const childrenMap = new Map<string, string[]>();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
    childrenMap.set(n.id, []);
  });

  edges.forEach((e) => {
    inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    outDegree.set(e.source, (outDegree.get(e.source) || 0) + 1);
    childrenMap.get(e.source)?.push(e.target);
  });

  const layers = new Map<string, number>();
  const queue: string[] = [];

  nodes.forEach((n) => {
    if ((inDegree.get(n.id) || 0) === 0) {
      layers.set(n.id, 0);
      queue.push(n.id);
    }
  });

  if (queue.length === 0 && nodes.length > 0) {
    layers.set(nodes[0].id, 0);
    queue.push(nodes[0].id);
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

  const layerGroups = new Map<number, SimpleNode<T>[]>();
  nodes.forEach((n) => {
    const layer = layers.get(n.id) || 0;
    if (!layerGroups.has(layer)) {
      layerGroups.set(layer, []);
    }
    layerGroups.get(layer)!.push(n);
  });

  const xSpacing = 280;
  const ySpacing = 180;
  const positionedNodes: SimpleNode<T>[] = [];

  layerGroups.forEach((groupNodes, layerIndex) => {
    const totalWidth = (groupNodes.length - 1) * xSpacing;
    const startX = -totalWidth / 2;

    groupNodes.forEach((node, nodeIndex) => {
      positionedNodes.push({
        ...node,
        position: {
          x: startX + nodeIndex * xSpacing,
          y: layerIndex * ySpacing,
        },
      });
    });
  });

  return positionedNodes;
}

// 3. Radial Layout
export function applyRadialLayout<T extends Record<string, unknown>>(
  nodes: SimpleNode<T>[],
  edges: SimpleEdge[],
): SimpleNode<T>[] {
  if (nodes.length === 0) return [];
  if (nodes.length === 1) {
    return [{ ...nodes[0], position: { x: 0, y: 0 } }];
  }

  const degrees = new Map<string, number>();
  nodes.forEach((n) => degrees.set(n.id, 0));
  edges.forEach((e) => {
    degrees.set(e.source, (degrees.get(e.source) || 0) + 1);
    degrees.set(e.target, (degrees.get(e.target) || 0) + 1);
  });

  const sorted = [...nodes].sort(
    (a, b) => (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0),
  );
  const center = sorted[0];
  const others = sorted.slice(1);

  const positioned: SimpleNode<T>[] = [{ ...center, position: { x: 0, y: 0 } }];

  const ring1Count = Math.min(others.length, 8);
  const ring1Radius = 260;

  for (let i = 0; i < ring1Count; i++) {
    const angle = (2 * Math.PI * i) / ring1Count;
    positioned.push({
      ...others[i],
      position: {
        x: Math.cos(angle) * ring1Radius,
        y: Math.sin(angle) * ring1Radius,
      },
    });
  }

  const ring2Nodes = others.slice(ring1Count);
  const ring2Radius = 480;

  ring2Nodes.forEach((node, i) => {
    const angle = (2 * Math.PI * i) / ring2Nodes.length + 0.3;
    positioned.push({
      ...node,
      position: {
        x: Math.cos(angle) * ring2Radius,
        y: Math.sin(angle) * ring2Radius,
      },
    });
  });

  return positioned;
}
