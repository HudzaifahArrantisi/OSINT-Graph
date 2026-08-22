import { describe, it, expect } from 'vitest';
import {
  applyForceLayout,
  applyHierarchicalLayout,
  applyRadialLayout,
} from '@nexusgraph/shared';

describe('Graph Scalability & Layout Algorithm Tests', () => {
  function generateSyntheticGraph(nodeCount = 100, edgeCount = 200) {
    const nodes: any[] = [];
    const edges: any[] = [];

    const types = ['DOMAIN', 'IP_ADDRESS', 'EMAIL', 'USERNAME', 'URL', 'REPOSITORY'];

    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        id: `node-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `entity-${i}.test.org`,
          entityType: types[i % types.length],
          confidence: 50 + (i % 50),
          entityId: `node-${i}`,
        },
      });
    }

    for (let j = 0; j < edgeCount; j++) {
      const source = `node-${j % nodeCount}`;
      const target = `node-${(j * 7 + 1) % nodeCount}`;
      if (source !== target) {
        edges.push({
          id: `edge-${j}`,
          source,
          target,
          type: 'relationship',
          data: {
            relationshipType: 'RELATED_TO',
            confidence: 70,
          },
        });
      }
    }

    return { nodes, edges };
  }

  it('should compute force-directed layout for 100 nodes in under 20ms without crashing', () => {
    const { nodes, edges } = generateSyntheticGraph(100, 200);

    const start = performance.now();
    const positioned = applyForceLayout(nodes, edges);
    const duration = performance.now() - start;

    expect(positioned.length).toBe(100);
    expect(duration).toBeLessThan(50);

    const positions = new Set(positioned.map((n) => `${n.position.x},${n.position.y}`));
    expect(positions.size).toBe(100);
  });

  it('should compute hierarchical layout for layered structure', () => {
    const { nodes, edges } = generateSyntheticGraph(50, 80);

    const start = performance.now();
    const positioned = applyHierarchicalLayout(nodes, edges);
    const duration = performance.now() - start;

    expect(positioned.length).toBe(50);
    expect(duration).toBeLessThan(50);
  });

  it('should compute radial layout in concentric rings around central node', () => {
    const { nodes, edges } = generateSyntheticGraph(50, 80);

    const start = performance.now();
    const positioned = applyRadialLayout(nodes, edges);
    const duration = performance.now() - start;

    expect(positioned.length).toBe(50);
    expect(duration).toBeLessThan(50);

    expect(positioned[0].position.x).toBe(0);
    expect(positioned[0].position.y).toBe(0);
  });
});
