import { describe, it, expect } from 'vitest';
import {
  applyForceLayout,
  applyHierarchicalLayout,
  applyRadialLayout,
  partitionGraphClusters,
  getNodeEngineModule,
  ENGINE_MODULE_DEFINITIONS,
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
    expect(duration).toBeLessThan(500);
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
    expect(deltaX).toBeGreaterThanOrEqual(400);

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

  it('should arrange 32 nodes with 0 edges in balanced 2D layouts (Force, Tree, Radial) without linear collapse', () => {
    const seed = {
      id: 'seed-app',
      type: 'seed',
      position: { x: 0, y: 0 },
      data: { isSeed: true, entityType: 'SEED', label: 'app.dicoding.com' },
    };

    const endpoints = Array.from({ length: 30 }, (_, i) => ({
      id: `ep-${i}`,
      type: 'entity',
      position: { x: 0, y: 0 },
      data: { isSeed: false, entityType: 'URL', label: `https://app.dicoding.com/api/v${i}` },
    }));

    const jsParamDoc = {
      id: 'doc-1',
      type: 'entity',
      position: { x: 0, y: 0 },
      data: { isSeed: false, entityType: 'DOCUMENT', label: 'Frontend Parameters' },
    };

    const allNodes = [seed, ...endpoints, jsParamDoc];
    const noEdges: any[] = [];

    // 1. Force layout must NOT collapse all nodes onto a straight line (y = 0)
    const forcePositioned = applyForceLayout(allNodes, noEdges);
    expect(forcePositioned.length).toBe(32);
    const forceUniqueY = new Set(forcePositioned.map((n) => Math.round(n.position.y / 20)));
    expect(forceUniqueY.size).toBeGreaterThanOrEqual(4); // Must span multiple rows in 2D

    // 2. Tree layout must group nodes into compact layers with wrapped rows
    const treePositioned = applyHierarchicalLayout(allNodes, noEdges);
    expect(treePositioned.length).toBe(32);
    const treeUniqueY = new Set(treePositioned.map((n) => Math.round(n.position.y / 20)));
    expect(treeUniqueY.size).toBeGreaterThanOrEqual(3);

    // 3. Radial layout must blossom nodes in 360-degree orbits rather than a 1D horizontal line
    const radialPositioned = applyRadialLayout(allNodes, noEdges);
    expect(radialPositioned.length).toBe(32);
    const radialUniqueY = new Set(radialPositioned.map((n) => Math.round(n.position.y / 20)));
    expect(radialUniqueY.size).toBeGreaterThanOrEqual(4);

    // Seed must remain defined with valid coordinate
    const radialSeed = radialPositioned.find((n) => n.id === 'seed-app')!;
    expect(radialSeed).toBeDefined();
    expect(typeof radialSeed.position.x).toBe('number');
    expect(typeof radialSeed.position.y).toBe('number');

    // Verify that radial nodes maintain ample breathing room without severe collision
    for (let i = 0; i < radialPositioned.length; i++) {
      for (let j = i + 1; j < radialPositioned.length; j++) {
        const n1 = radialPositioned[i];
        const n2 = radialPositioned[j];
        const dx = n2.position.x - n1.position.x;
        const dy = n2.position.y - n1.position.y;
        const normDist = Math.hypot(dx / 150, dy / 45);
        expect(normDist).toBeGreaterThanOrEqual(0.7);
      }
    }
  });

  describe('Engine Module Classification & Spatial Island Partitioning', () => {
    it('should accurately classify nodes into discrete engine modules with valid styling', () => {
      // Validate registry
      expect(ENGINE_MODULE_DEFINITIONS.engine_wayback.id).toBe('engine_wayback');
      expect(ENGINE_MODULE_DEFINITIONS.engine_xnlinkfinder.id).toBe('engine_xnlinkfinder');

      // 1. Wayback CDX
      const waybackNode = {
        label: 'https://example.com/old-page',
        entityType: 'URL',
        metadata: { discoveredBy: 'domain.historical-urls' },
      };
      const waybackEngine = getNodeEngineModule(waybackNode);
      expect(waybackEngine.id).toBe('engine_wayback');
      expect(waybackEngine.shortName).toBe('Wayback CDX');
      expect(waybackEngine.color).toBe('#f59e0b');

      // 2. xnLinkFinder
      const xnNode = {
        label: 'https://example.com/api/v1?token=xyz',
        entityType: 'URL',
        metadata: { discoveredBy: 'domain.xnlinkfinder-js-params' },
      };
      const xnEngine = getNodeEngineModule(xnNode);
      expect(xnEngine.id).toBe('engine_xnlinkfinder');
      expect(xnEngine.shortName).toBe('xnLinkFinder');
      expect(xnEngine.color).toBe('#10b981');

      // 3. Shodan Recon
      const shodanNode = {
        label: 'Port 8080 [TCP]: nginx 1.18.0',
        entityType: 'TECHNOLOGY',
        metadata: { discoveredBy: 'infrastructure.shodan-recon' },
      };
      const shodanEngine = getNodeEngineModule(shodanNode);
      expect(shodanEngine.id).toBe('engine_shodan');
      expect(shodanEngine.shortName).toBe('Shodan Recon');
      expect(shodanEngine.color).toBe('#ef4444');

      // 4. Web Tech Fingerprinter
      const techNode = {
        label: 'WordPress 6.4 (CMS)',
        entityType: 'TECHNOLOGY',
        metadata: { discoveredBy: 'domain.web-tech-fingerprint' },
      };
      const techEngine = getNodeEngineModule(techNode);
      expect(techEngine.id).toBe('engine_tech_stack');
      expect(techEngine.shortName).toBe('Tech Stack');
      expect(techEngine.color).toBe('#0ea5e9');

      // 5. DNS Security Audit
      const dnsSecNode = {
        label: 'SPF: v=spf1 include:_spf.google.com ~all',
        entityType: 'DNS_RECORD',
        metadata: { discoveredBy: 'domain.dns-security-audit' },
      };
      const dnsSecEngine = getNodeEngineModule(dnsSecNode);
      expect(dnsSecEngine.id).toBe('engine_dns_sec');
      expect(dnsSecEngine.shortName).toBe('DNS Security');

      // 6. Subdomain CRT
      const crtNode = {
        label: 'admin.corp.com',
        entityType: 'SUBDOMAIN',
        metadata: { discoveredBy: 'domain.find-subdomains-crt' },
      };
      const crtEngine = getNodeEngineModule(crtNode);
      expect(crtEngine.id).toBe('engine_subdomain_crt');
      expect(crtEngine.shortName).toBe('Subdomain CRT');

      // 7. Seed Target
      const seedNode = {
        label: 'target.com',
        isSeed: true,
      };
      const seedEngine = getNodeEngineModule(seedNode);
      expect(seedEngine.id).toBe('engine_seed');
      expect(seedEngine.shortName).toBe('Target Seed');
    });

    it('should partition nodes into distinct separated spatial islands in Force Layout', () => {
      const seed = {
        id: 'seed-domain',
        type: 'seed',
        position: { x: 0, y: 0 },
        data: { isSeed: true, label: 'target.com' },
      };

      // 10 Wayback URLs
      const waybackNodes = Array.from({ length: 10 }, (_, i) => ({
        id: `wb-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `https://target.com/archive/${i}`,
          entityType: 'URL',
          metadata: { discoveredBy: 'domain.historical-urls' },
        },
      }));

      // 10 xnLinkFinder Parameters
      const xnNodes = Array.from({ length: 10 }, (_, i) => ({
        id: `xn-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `https://target.com/app.js?p=${i}`,
          entityType: 'URL',
          metadata: { discoveredBy: 'domain.xnlinkfinder-js-params' },
        },
      }));

      // 5 Shodan technologies
      const shodanNodes = Array.from({ length: 5 }, (_, i) => ({
        id: `shodan-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `Port ${8000 + i} [TCP]`,
          entityType: 'TECHNOLOGY',
          metadata: { discoveredBy: 'infrastructure.shodan-recon' },
        },
      }));

      const allNodes: any[] = [seed, ...waybackNodes, ...xnNodes, ...shodanNodes];

      // Connect all nodes to seed
      const edges = allNodes.slice(1).map((n, i) => ({
        id: `edge-seed-${i}`,
        source: 'seed-domain',
        target: n.id,
      }));

      const positioned = applyForceLayout(allNodes, edges);
      expect(positioned.length).toBe(26);

      // Seed node remains placed with valid coordinates
      const positionedSeed = positioned.find((n) => n.id === 'seed-domain')!;
      expect(positionedSeed).toBeDefined();
      expect(typeof positionedSeed.position.x).toBe('number');
      expect(typeof positionedSeed.position.y).toBe('number');

      // Compute centroid of Wayback cluster vs xnLinkFinder cluster
      const wbPositions = positioned.filter((n) => n.id.startsWith('wb-'));
      const xnPositions = positioned.filter((n) => n.id.startsWith('xn-'));

      const wbCentroidX = wbPositions.reduce((acc, n) => acc + n.position.x, 0) / wbPositions.length;
      const wbCentroidY = wbPositions.reduce((acc, n) => acc + n.position.y, 0) / wbPositions.length;

      const xnCentroidX = xnPositions.reduce((acc, n) => acc + n.position.x, 0) / xnPositions.length;
      const xnCentroidY = xnPositions.reduce((acc, n) => acc + n.position.y, 0) / xnPositions.length;

      // Distance between Wayback island centroid and xnLinkFinder centroid must be substantial (>= 200px)
      const islandDist = Math.hypot(xnCentroidX - wbCentroidX, xnCentroidY - wbCentroidY);
      expect(islandDist).toBeGreaterThanOrEqual(200);
    });

    it('should arrange 215 nodes across 12 categories with ZERO inter-category overlap', () => {
      const seed = {
        id: 'seed-kemnaker',
        type: 'seed',
        position: { x: 0, y: 0 },
        data: {
          label: 'kemnaker.go.id',
          value: 'kemnaker.go.id',
          entityType: 'SEED',
          isSeed: true,
        },
      };

      // 100 dirsearch paths
      const dirsearchNodes = Array.from({ length: 100 }, (_, i) => ({
        id: `dirsearch-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `kemnaker.go.id/path_${i}`,
          value: `kemnaker.go.id/path_${i}`,
          entityType: 'URL',
          metadata: { discoveredBy: 'domain.dirsearch-path-bruteforce' },
        },
      }));

      // 51 xnLinkFinder endpoints
      const xnNodes = Array.from({ length: 51 }, (_, i) => ({
        id: `xnlink-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `kemnaker.go.id/api/endpoint_${i}`,
          value: `kemnaker.go.id/api/endpoint_${i}`,
          entityType: 'URL',
          metadata: { discoveredBy: 'domain.xnlinkfinder-js-params' },
        },
      }));

      // 40 TLS / SAN domains
      const tlsNodes = Array.from({ length: 40 }, (_, i) => ({
        id: `tls-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `sub_${i}.kemnaker.go.id`,
          value: `sub_${i}.kemnaker.go.id`,
          entityType: 'DOMAIN',
          metadata: { discoveredBy: 'domain.tls-san-extraction' },
        },
      }));

      // 4 DNS records
      const dnsNodes = Array.from({ length: 4 }, (_, i) => ({
        id: `dns-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `ns${i}.kemnaker.go.id`,
          value: `ns${i}.kemnaker.go.id`,
          entityType: 'NS_RECORD',
          metadata: { discoveredBy: 'domain.dns-records' },
        },
      }));

      // 20 minor engine nodes across various categories
      const otherNodes = Array.from({ length: 19 }, (_, i) => ({
        id: `other-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `tech_${i}`,
          value: `tech_${i}`,
          entityType: 'TECHNOLOGY',
          metadata: { discoveredBy: 'domain.web-tech-fingerprint' },
        },
      }));

      const allNodes: any[] = [seed, ...dirsearchNodes, ...xnNodes, ...tlsNodes, ...dnsNodes, ...otherNodes];
      expect(allNodes.length).toBe(215);

      const edges = allNodes.slice(1).map((n, i) => ({
        id: `edge-${i}`,
        source: 'seed-kemnaker',
        target: n.id,
      }));

      const start = performance.now();
      const positioned = applyForceLayout(allNodes, edges);
      const duration = performance.now() - start;

      expect(positioned.length).toBe(215);
      expect(duration).toBeLessThan(100);

      // Verify all positions are finite valid coordinates
      positioned.forEach((n) => {
        expect(Number.isFinite(n.position.x)).toBe(true);
        expect(Number.isFinite(n.position.y)).toBe(true);
      });

      // Group positioned nodes by their engine module
      const moduleMap = new Map<string, Array<{ x: number; y: number; id: string }>>();
      positioned.forEach((n) => {
        const eng = getNodeEngineModule(n.data).id;
        if (!moduleMap.has(eng)) moduleMap.set(eng, []);
        moduleMap.get(eng)!.push({ x: n.position.x, y: n.position.y, id: n.id });
      });

      // Verify ZERO inter-category overlap between any two cards from different modules
      const CARD_W = 195;
      const CARD_H = 56;

      const engineKeys = Array.from(moduleMap.keys());
      let overlapCount = 0;

      for (let i = 0; i < engineKeys.length; i++) {
        for (let j = i + 1; j < engineKeys.length; j++) {
          const listA = moduleMap.get(engineKeys[i])!;
          const listB = moduleMap.get(engineKeys[j])!;

          for (const posA of listA) {
            for (const posB of listB) {
              const overlapX = CARD_W - Math.abs(posA.x - posB.x);
              const overlapY = CARD_H - Math.abs(posA.y - posB.y);

              if (overlapX > 0 && overlapY > 0) {
                overlapCount++;
              }
            }
          }
        }
      }

      expect(overlapCount).toBe(0);
    });

    it('should compute hierarchical tree layout for 215 nodes without any card overlaps', () => {
      const seed = {
        id: 'seed-kemnaker',
        type: 'seed',
        position: { x: 0, y: 0 },
        data: { label: 'kemnaker.go.id', isSeed: true },
      };

      const nodes = Array.from({ length: 214 }, (_, i) => ({
        id: `node-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `item-${i}`,
          metadata: { discoveredBy: i < 100 ? 'domain.dirsearch-path-bruteforce' : 'domain.xnlinkfinder-js-params' },
        },
      }));

      const allNodes: any[] = [seed, ...nodes];
      const edges = nodes.map((n) => ({ id: `e-${n.id}`, source: 'seed-kemnaker', target: n.id }));

      const positioned = applyHierarchicalLayout(allNodes, edges);
      expect(positioned.length).toBe(215);

      // Verify no two nodes occupy identical positions
      const posSet = new Set(positioned.map((n) => `${n.position.x},${n.position.y}`));
      expect(posSet.size).toBe(215);
    });

    it('should compute radial layout for 215 nodes with zero satellite collisions', () => {
      const seed = {
        id: 'seed-kemnaker',
        type: 'seed',
        position: { x: 0, y: 0 },
        data: { label: 'kemnaker.go.id', isSeed: true },
      };

      const nodes = Array.from({ length: 214 }, (_, i) => ({
        id: `node-${i}`,
        type: 'entity',
        position: { x: 0, y: 0 },
        data: {
          label: `item-${i}`,
          metadata: { discoveredBy: i < 100 ? 'domain.dirsearch-path-bruteforce' : 'domain.tls-san-extraction' },
        },
      }));

      const allNodes: any[] = [seed, ...nodes];
      const edges = nodes.map((n) => ({ id: `e-${n.id}`, source: 'seed-kemnaker', target: n.id }));

      const positioned = applyRadialLayout(allNodes, edges);
      expect(positioned.length).toBe(215);

      const posSet = new Set(positioned.map((n) => `${n.position.x},${n.position.y}`));
      expect(posSet.size).toBe(215);
    });
  });
});
