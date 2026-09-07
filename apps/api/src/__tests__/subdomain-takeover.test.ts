import { describe, it, expect, vi, beforeEach } from 'vitest';
import { subdomainTakeoverCollector } from '../collectors/subdomain-takeover.js';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';

describe('Subdomain Takeover & Dangling DNS Validator Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should register subdomain-takeover collector in registry', () => {
    const collector = getCollector('subdomain-takeover');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('subdomain-takeover');
  });

  it('should support DOMAIN and URL input types', () => {
    expect(subdomainTakeoverCollector.supports('DOMAIN')).toBe(true);
    expect(subdomainTakeoverCollector.supports('URL')).toBe(true);
    expect(subdomainTakeoverCollector.supports('EMAIL')).toBe(false);
  });

  it('should include subdomain-takeover transform in discovery plan for DOMAIN and URL', () => {
    const domainPlan = buildDiscoveryPlan('DOMAIN', 'target.com');
    expect(domainPlan.transforms.map((t) => t.id)).toContain('domain.subdomain-takeover');

    const urlPlan = buildDiscoveryPlan('URL', 'https://target.com');
    expect(urlPlan.transforms.map((t) => t.id)).toContain('domain.subdomain-takeover');
  });

  it('should define correct metadata for domain.subdomain-takeover transform', () => {
    const transform = getTransform('domain.subdomain-takeover');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('Subdomain Takeover');
    expect(transform?.category).toBe('infrastructure');
  });

  it('should handle domain with no CNAME safely and report secure status', async () => {
    // Mock fetch for DoH query
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('type=CNAME')) {
        return {
          ok: true,
          json: async () => ({ Status: 0, Answer: [] }),
        };
      }
      return { ok: false };
    });

    const result = await subdomainTakeoverCollector.run('apex-domain.com', {
      caseId: 'test-case-123',
      requestId: 'test-req-123',
      signal: new AbortController().signal,
    });

    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence[0].source_type).toBe('SUBDOMAIN_TAKEOVER');
    expect(result.evidence[0].extracted_value).toContain('No CNAME record present');
  });
});
