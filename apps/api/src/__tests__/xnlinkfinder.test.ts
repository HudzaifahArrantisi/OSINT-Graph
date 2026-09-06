import { describe, it, expect } from 'vitest';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';
import { xnlinkfinderCollector } from '../collectors/xnlinkfinder.js';

describe('xnLinkFinder JS Parameter & Endpoint Recon Tests', () => {
  it('should register xnlinkfinder collector in registry', () => {
    const collector = getCollector('xnlinkfinder');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('xnlinkfinder');
  });

  it('should support DOMAIN and URL input types', () => {
    expect(xnlinkfinderCollector.supports('DOMAIN')).toBe(true);
    expect(xnlinkfinderCollector.supports('URL')).toBe(true);
    expect(xnlinkfinderCollector.supports('EMAIL')).toBe(false);
    expect(xnlinkfinderCollector.supports('PHONE')).toBe(false);
  });

  it('should include xnlinkfinder transform in DOMAIN discovery plan', () => {
    const plan = buildDiscoveryPlan('DOMAIN', 'example.com');
    const transformIds = plan.transforms.map((t) => t.id);
    expect(transformIds).toContain('domain.xnlinkfinder-js-params');
  });

  it('should include xnlinkfinder transform in URL discovery plan', () => {
    const plan = buildDiscoveryPlan('URL', 'https://example.com');
    const transformIds = plan.transforms.map((t) => t.id);
    expect(transformIds).toContain('domain.xnlinkfinder-js-params');
  });

  it('should define correct metadata for domain.xnlinkfinder-js-params transform', () => {
    const transform = getTransform('domain.xnlinkfinder-js-params');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('xnLinkFinder');
    expect(transform?.inputTypes).toContain('DOMAIN');
    expect(transform?.inputTypes).toContain('URL');
    expect(transform?.outputTypes).toContain('URL');
    expect(transform?.outputTypes).toContain('DOCUMENT');
    expect(transform?.category).toBe('web');
  });

  it('should handle invalid domain inputs safely without throwing', async () => {
    const result = await xnlinkfinderCollector.run('invalid..domain', {
      caseId: 'test-case-id',
      requestId: 'test-req-id',
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('xnlinkfinder');
    expect(Array.isArray(result.entities)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});
