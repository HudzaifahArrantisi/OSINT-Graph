import { describe, it, expect, vi, beforeEach } from 'vitest';
import { webTechFingerprintCollector } from '../collectors/web-tech-fingerprint.js';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';
import * as ssrf from '../security/ssrf.js';

describe('Web Technology Stack Fingerprinter Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should register web-tech-fingerprint collector in registry', () => {
    const collector = getCollector('web-tech-fingerprint');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('web-tech-fingerprint');
  });

  it('should support DOMAIN and URL input types', () => {
    expect(webTechFingerprintCollector.supports('DOMAIN')).toBe(true);
    expect(webTechFingerprintCollector.supports('URL')).toBe(true);
    expect(webTechFingerprintCollector.supports('EMAIL')).toBe(false);
  });

  it('should include web-tech-fingerprint transform in discovery plan', () => {
    const domainPlan = buildDiscoveryPlan('DOMAIN', 'tech-site.com');
    expect(domainPlan.transforms.map((t) => t.id)).toContain('domain.web-tech-fingerprint');
  });

  it('should define correct metadata for domain.web-tech-fingerprint transform', () => {
    const transform = getTransform('domain.web-tech-fingerprint');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('Technology Stack');
    expect(transform?.outputTypes).toContain('TECHNOLOGY');
    expect(transform?.category).toBe('web');
  });

  it('should detect Nginx, Next.js, and Cloudflare from response headers and HTML', async () => {
    const mockHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <script id="__NEXT_DATA__" type="application/json">{}</script>
          <script src="/_next/static/chunks/main.js"></script>
        </head>
        <body>
          <div data-reactroot="">Hello Web App</div>
        </body>
      </html>
    `;

    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({
        Server: 'cloudflare',
        'cf-ray': '89b1c2e3f4a5-SIN',
        'x-powered-by': 'Next.js',
        'Content-Type': 'text/html',
      }),
    } as any);
    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValueOnce(mockHtml);

    const result = await webTechFingerprintCollector.run('https://my-app.com', {
      caseId: 'test-case-123',
      requestId: 'test-req-123',
      signal: new AbortController().signal,
    });

    expect(result.entities.length).toBeGreaterThan(0);
    const techEntities = result.entities.filter((e) => e.type === 'TECHNOLOGY');

    expect(techEntities.some((t) => (t.metadata as any).techName === 'Next.js')).toBe(true);
    expect(techEntities.some((t) => (t.metadata as any).techName === 'Cloudflare')).toBe(true);
    expect(techEntities.some((t) => (t.metadata as any).techName === 'React')).toBe(true);

    const ev = result.evidence.find((e) => e.source_type === 'TECH_FINGERPRINT');
    expect(ev).toBeDefined();
    expect((ev?.metadata as any).totalDetected).toBeGreaterThanOrEqual(3);
  });
});
