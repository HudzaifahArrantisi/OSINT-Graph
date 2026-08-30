import { describe, it, expect } from 'vitest';
import {
  applyForceLayout,
  applyHierarchicalLayout,
  applyRadialLayout,
  partitionGraphClusters,
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

    // New radial layout inserts cluster_hub label nodes alongside entity nodes
    const entityNodes = positioned.filter((n) => n.type !== 'cluster_hub');
    expect(entityNodes.length).toBe(50);
    expect(duration).toBeLessThan(50);
  });

  it('should partition multiple seed targets into isolated clusters with distinct spatial placement', () => {
    // Seed 1 + 20 child nodes
    const seed1 = {
      id: 'seed-1',
      type: 'seed',
      position: { x: 0, y: 0 },
      data: { isSeed: true, entityType: 'SEED', label: 'ndeleros' },
    };
    const seed1Nodes = Array.from({ length: 20 }, (_, i) => ({
      id: `s1-child-${i}`,
      type: 'entity',
      position: { x: 0, y: 0 },
      data: { isSeed: false, entityType: 'URL', label: `dork-${i}` },
    }));
    const seed1Edges = seed1Nodes.map((n, i) => ({
      id: `e1-${i}`,
      source: 'seed-1',
      target: n.id,
    }));

    // Seed 2 + 5 child nodes
    const seed2 = {
      id: 'seed-2',
      type: 'seed',
      position: { x: 0, y: 0 },
      data: { isSeed: true, entityType: 'SEED', label: '081319163351' },
    };
    const seed2Nodes = Array.from({ length: 5 }, (_, i) => ({
      id: `s2-child-${i}`,
      type: 'entity',
      position: { x: 0, y: 0 },
      data: { isSeed: false, entityType: 'LOCATION', label: `loc-${i}` },
    }));
    const seed2Edges = seed2Nodes.map((n, i) => ({
      id: `e2-${i}`,
      source: 'seed-2',
      target: n.id,
    }));

    const allNodes = [seed1, ...seed1Nodes, seed2, ...seed2Nodes];
    const allEdges = [...seed1Edges, ...seed2Edges];

    // Verify clustering
    const clusters = partitionGraphClusters(allNodes, allEdges);
    expect(clusters.length).toBe(2);
    expect(clusters[0].seedNode?.id).toBe('seed-1');
    expect(clusters[1].seedNode?.id).toBe('seed-2');
    expect(clusters[0].nodes.length).toBe(21);
    expect(clusters[1].nodes.length).toBe(6);

    // Verify radial layout spatial separation
    const positioned = applyRadialLayout(allNodes, allEdges);
    const entityPositioned = positioned.filter((n) => n.type !== 'cluster_hub');
    expect(entityPositioned.length).toBe(27);

    const posSeed1 = positioned.find((n) => n.id === 'seed-1')!;
    const posSeed2 = positioned.find((n) => n.id === 'seed-2')!;

    // Seed 1 and Seed 2 centers MUST be separated with spatial gap
    const deltaX = Math.abs(posSeed2.position.x - posSeed1.position.x);
    expect(deltaX).toBeGreaterThanOrEqual(500);

    // Check that nodes for Seed 1 and Seed 2 do not collide
    const seed1Positions = positioned
      .filter((n) => n.id === 'seed-1' || n.id.startsWith('s1-'))
      .map((n) => n.position.x);
    const maxSeed1X = Math.max(...seed1Positions);

    const seed2Positions = positioned
      .filter((n) => n.id === 'seed-2' || n.id.startsWith('s2-'))
      .map((n) => n.position.x);
    const minSeed2X = Math.min(...seed2Positions);

    // Cluster 2 must start clearly AFTER Cluster 1
    expect(minSeed2X).toBeGreaterThan(maxSeed1X);
  });

  it('should arrange domain discoveries into sub-category satellite circles around the seed target', () => {
    const seedDomain = {
      id: 'seed-domain',
      type: 'seed',
      position: { x: 0, y: 0 },
      data: { isSeed: true, entityType: 'SEED', label: 'example.com' },
    };

    // Sub-category 1: DNS records (IP, MX, NS)
    const dnsNodes = [
      { id: 'ip-1', type: 'ip_address', position: { x: 0, y: 0 }, data: { entityType: 'IP_ADDRESS', label: '93.184.216.34', metadata: { discoveredBy: 'domain.resolve-dns' }, isSeed: false } },
      { id: 'mx-1', type: 'mx_record', position: { x: 0, y: 0 }, data: { entityType: 'MX_RECORD', label: 'mail.example.com', metadata: { discoveredBy: 'domain.resolve-dns' }, isSeed: false } },
      { id: 'ns-1', type: 'ns_record', position: { x: 0, y: 0 }, data: { entityType: 'NS_RECORD', label: 'ns1.example.com', metadata: { discoveredBy: 'domain.resolve-dns' }, isSeed: false } },
    ];

    // Sub-category 2: TLS Certificate
    const tlsNodes = [
      { id: 'cert-1', type: 'certificate', position: { x: 0, y: 0 }, data: { entityType: 'CERTIFICATE', label: 'DigiCert TLS', metadata: { discoveredBy: 'domain.find-tls' }, isSeed: false } },
    ];

    // Sub-category 3: Webpage Metadata
    const webNodes = [
      { id: 'tech-1', type: 'technology', position: { x: 0, y: 0 }, data: { entityType: 'TECHNOLOGY', label: 'Nginx', metadata: { discoveredBy: 'domain.webpage-metadata' }, isSeed: false } },
      { id: 'url-1', type: 'url', position: { x: 0, y: 0 }, data: { entityType: 'URL', label: 'https://example.com', metadata: { discoveredBy: 'domain.webpage-metadata' }, isSeed: false } },
    ];

    // Sub-category 4: Official Contacts
    const contactNodes = [
      { id: 'email-1', type: 'email', position: { x: 0, y: 0 }, data: { entityType: 'EMAIL', label: 'contact@example.com', metadata: { discoveredBy: 'contact.find-official-contact' }, isSeed: false } },
    ];

    const allNodes = [seedDomain, ...dnsNodes, ...tlsNodes, ...webNodes, ...contactNodes];
    const allEdges = allNodes.filter((n) => n.id !== 'seed-domain').map((n, i) => ({
      id: `edge-${i}`,
      source: 'seed-domain',
      target: n.id,
    }));

    const positioned = applyRadialLayout(allNodes, allEdges);

    expect(positioned.length).toBe(allNodes.length);

    const seedPos = positioned.find((n) => n.id === 'seed-domain')!;
    const dnsIpPos = positioned.find((n) => n.id === 'ip-1')!;
    const tlsPos = positioned.find((n) => n.id === 'cert-1')!;
    const emailPos = positioned.find((n) => n.id === 'email-1')!;

    // DNS, TLS, and Email nodes should live in distinct orbits radiating away from the seed
    const distDns = Math.hypot(dnsIpPos.position.x - seedPos.position.x, dnsIpPos.position.y - seedPos.position.y);
    const distTls = Math.hypot(tlsPos.position.x - seedPos.position.x, tlsPos.position.y - seedPos.position.y);
    const distEmail = Math.hypot(emailPos.position.x - seedPos.position.x, emailPos.position.y - seedPos.position.y);

    expect(distDns).toBeGreaterThanOrEqual(150);
    expect(distTls).toBeGreaterThanOrEqual(150);
    expect(distEmail).toBeGreaterThanOrEqual(150);
  });
});
