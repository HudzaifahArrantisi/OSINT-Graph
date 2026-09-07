import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sensitiveUrlClassifierCollector } from '../collectors/sensitive-url-classifier.js';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';
import * as ssrf from '../security/ssrf.js';

describe('Sensitive Query Parameter & Route Classifier Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should register sensitive-url-classifier collector in registry', () => {
    const collector = getCollector('sensitive-url-classifier');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('sensitive-url-classifier');
  });

  it('should support DOMAIN and URL input types', () => {
    expect(sensitiveUrlClassifierCollector.supports('DOMAIN')).toBe(true);
    expect(sensitiveUrlClassifierCollector.supports('URL')).toBe(true);
    expect(sensitiveUrlClassifierCollector.supports('EMAIL')).toBe(false);
  });

  it('should include sensitive-url-classifier transform in discovery plan', () => {
    const domainPlan = buildDiscoveryPlan('DOMAIN', 'portal-target.com');
    expect(domainPlan.transforms.map((t) => t.id)).toContain('domain.sensitive-url-classifier');

    const urlPlan = buildDiscoveryPlan('URL', 'https://portal-target.com');
    expect(urlPlan.transforms.map((t) => t.id)).toContain('domain.sensitive-url-classifier');
  });

  it('should define correct metadata for domain.sensitive-url-classifier transform', () => {
    const transform = getTransform('domain.sensitive-url-classifier');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('Sensitive Query Parameter');
    expect(transform?.category).toBe('web');
  });

  it('should classify authentication tokens, redirects, and file inclusion parameters from HTML links', async () => {
    const mockHtml = `
      <html>
        <body>
          <a href="/login?redirect_url=https://auth.company.com">SSO Login</a>
          <a href="/api/v1/user?access_token=secret123&user_id=1001">User Info</a>
          <a href="/download?file=statement.pdf&path=/docs">Downloads</a>
          <a href="/admin/dashboard?debug=true">Admin Area</a>
        </body>
      </html>
    `;

    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'text/html' }),
    } as any);
    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValueOnce(mockHtml);

    const result = await sensitiveUrlClassifierCollector.run('https://app.target.com', {
      caseId: 'test-case-123',
      requestId: 'test-req-123',
      signal: new AbortController().signal,
    });

    expect(result.entities.length).toBeGreaterThan(0);
    const paramEntities = result.entities.filter((e) => e.type === 'URL');
    
    // Check categorization
    expect(paramEntities.some((e) => (e.metadata as any).riskCategory === 'SSRF_REDIRECT')).toBe(true);
    expect(paramEntities.some((e) => (e.metadata as any).riskCategory === 'AUTH_TOKEN')).toBe(true);
    expect(paramEntities.some((e) => (e.metadata as any).riskCategory === 'FILE_INCLUSION')).toBe(true);
    expect(paramEntities.some((e) => (e.metadata as any).riskCategory === 'DEBUG_ADMIN')).toBe(true);

    // Evidence
    const ev = result.evidence.find((e) => e.source_type === 'SENSITIVE_PARAM_ANALYSIS');
    expect(ev).toBeDefined();
    expect((ev?.metadata as any).totalFindings).toBeGreaterThan(0);
  });
});
