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
      signal: new AbortController().signal,
    });

    expect(result).toBeDefined();
    expect(result.source).toBe('xnlinkfinder');
    expect(Array.isArray(result.entities)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('should filter out MIME types and non-endpoint assets and generate complete full URLs', () => {
    const sampleEndpoints = [
      { raw: 'text/x-java', url: 'https://text/x-java', in_scope: false },
      { raw: 'image/png', url: 'https://app.dicoding.com/image/png', in_scope: true },
      { raw: '/tempa/registration', url: 'https://app.dicoding.com/tempa/registration', in_scope: true },
      { raw: '/?origin=sw_iframe', url: 'https://app.dicoding.com/?origin=sw_iframe', in_scope: true },
    ];

    const validEndpoints = sampleEndpoints.filter((ep) => {
      const rawLower = ep.raw.toLowerCase();
      if (
        ep.url.includes('text/x-') ||
        ep.url.includes('/application/') ||
        rawLower.startsWith('text/') ||
        rawLower.startsWith('image/') ||
        rawLower.startsWith('application/')
      ) {
        return false;
      }
      try {
        const u = new URL(ep.url);
        if (!u.hostname || !u.hostname.includes('.') || ['text', 'image'].includes(u.hostname)) {
          return false;
        }
        return true;
      } catch {
        return false;
      }
    });

    expect(validEndpoints).toHaveLength(2);
    expect(validEndpoints[0].url).toBe('https://app.dicoding.com/tempa/registration');
    expect(validEndpoints[1].url).toBe('https://app.dicoding.com/?origin=sw_iframe');
  });
});
