import { describe, it, expect } from 'vitest';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';
import { dirsearchCollector } from '../collectors/dirsearch.js';
import { getNodeEngineModule } from '@nexusgraph/shared';

describe('dirsearch Web Path Brute-Force Discovery Tests', () => {
  it('should register dirsearch collector in registry', () => {
    const collector = getCollector('dirsearch');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('dirsearch');
  });

  it('should support DOMAIN and URL input types only', () => {
    expect(dirsearchCollector.supports('DOMAIN')).toBe(true);
    expect(dirsearchCollector.supports('URL')).toBe(true);
    expect(dirsearchCollector.supports('EMAIL')).toBe(false);
    expect(dirsearchCollector.supports('PHONE')).toBe(false);
    expect(dirsearchCollector.supports('IP_ADDRESS')).toBe(false);
  });

  it('should include dirsearch transform in DOMAIN discovery plan', () => {
    const plan = buildDiscoveryPlan('DOMAIN', 'example.com');
    const transformIds = plan.transforms.map((t) => t.id);
    expect(transformIds).toContain('domain.dirsearch-path-bruteforce');
  });

  it('should include dirsearch transform in URL discovery plan', () => {
    const plan = buildDiscoveryPlan('URL', 'https://example.com');
    const transformIds = plan.transforms.map((t) => t.id);
    expect(transformIds).toContain('domain.dirsearch-path-bruteforce');
  });

  it('should define correct metadata for domain.dirsearch-path-bruteforce transform', () => {
    const transform = getTransform('domain.dirsearch-path-bruteforce');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('dirsearch');
    expect(transform?.inputTypes).toContain('DOMAIN');
    expect(transform?.inputTypes).toContain('URL');
    expect(transform?.outputTypes).toContain('URL');
    expect(transform?.category).toBe('web');
    expect(transform?.riskLevel).toBe('medium');
  });

  it('should reject private or loopback IP targets via SSRF guard', async () => {
    const result = await dirsearchCollector.run('http://127.0.0.1/test', {
      caseId: 'test-case-id',
      requestId: 'test-req-id',
      signal: new AbortController().signal,
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('dirsearch');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('SSRF guard');
    expect(result.entities).toHaveLength(0);
  });

  it('should handle invalid domain inputs safely without throwing', async () => {
    const result = await dirsearchCollector.run('invalid..domain', {
      caseId: 'test-case-id',
      requestId: 'test-req-id',
      signal: new AbortController().signal,
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('dirsearch');
    expect(Array.isArray(result.entities)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should map nodes discovered by dirsearch to engine_dirsearch in graph layout', () => {
    const nodeData = {
      value: 'https://example.com/admin',
      type: 'URL',
      metadata: {
        docKind: 'DIRSEARCH_FINDING',
        source: {
          collector: 'dirsearch',
          transform: 'domain.dirsearch-path-bruteforce',
        },
      },
    };

    const engineMeta = getNodeEngineModule(nodeData);
    expect(engineMeta.id).toBe('engine_dirsearch');
    expect(engineMeta.name).toContain('dirsearch');
    expect(engineMeta.iconName).toBe('FolderSearch');
  });
});
