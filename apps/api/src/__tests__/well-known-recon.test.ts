import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wellKnownReconCollector } from '../collectors/well-known-recon.js';
import * as ssrf from '../security/ssrf.js';

const ctx = {
  caseId: 'test-case-id',
  requestId: 'test-req-id',
  signal: new AbortController().signal,
};

describe('Well-Known & Standard Web Disclosures Collector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports DOMAIN, URL, and WEBSITE input types', () => {
    expect(wellKnownReconCollector.supports('DOMAIN')).toBe(true);
    expect(wellKnownReconCollector.supports('URL')).toBe(true);
    expect(wellKnownReconCollector.supports('WEBSITE' as any)).toBe(true);
    expect(wellKnownReconCollector.supports('EMAIL')).toBe(false);
    expect(wellKnownReconCollector.supports('PHONE')).toBe(false);
  });

  it('rejects invalid or non-domain inputs safely', async () => {
    const result = await wellKnownReconCollector.run('invalid-host', ctx);
    expect(result.source).toBe('well-known-recon');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.entities).toHaveLength(0);
  });

  it('parses security.txt and extracts contact email and policy portals', async () => {
    const mockSecurityTxt = `
Contact: mailto:security-team@example.com
Contact: https://example.com/security/report
Encryption: https://example.com/pgp-key.txt
Policy: https://example.com/security-policy
Acknowledgments: https://example.com/hall-of-fame
`;

    vi.spyOn(ssrf, 'safeFetch').mockImplementation(async (url: string) => {
      if (url.includes('security.txt')) {
        return { ok: true, status: 200 } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValue(mockSecurityTxt);

    const result = await wellKnownReconCollector.run('example.com', ctx);

    expect(result.source).toBe('well-known-recon');
    const emails = result.entities.filter((e) => e.type === 'EMAIL');
    expect(emails.some((e) => e.value === 'security-team@example.com')).toBe(true);

    const portals = result.entities.filter((e) => e.type === 'URL');
    expect(portals.some((p) => p.value.includes('security/report'))).toBe(true);

    // Verify contact relationship
    expect(
      result.relationships.some(
        (r) => r.relationship_type === 'CONTACT_POINT' && r.target_value === 'security-team@example.com',
      ),
    ).toBe(true);

    expect(result.evidence.some((ev) => ev.source_type === 'SECURITY_TXT')).toBe(true);
  });

  it('parses robots.txt and extracts disallowed endpoints and sitemaps', async () => {
    const mockRobotsTxt = `
User-agent: *
Disallow: /admin-console/
Disallow: /api/internal/
Disallow: /backup.tar.gz
Sitemap: https://example.com/sitemap.xml
`;

    vi.spyOn(ssrf, 'safeFetch').mockImplementation(async (url: string) => {
      if (url.includes('robots.txt')) {
        return { ok: true, status: 200 } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValue(mockRobotsTxt);

    const result = await wellKnownReconCollector.run('https://example.com', ctx);

    const disallowedUrls = result.entities.filter((e) => e.type === 'URL');
    expect(disallowedUrls.some((u) => u.value === 'https://example.com/admin-console/')).toBe(true);
    expect(disallowedUrls.some((u) => u.value === 'https://example.com/api/internal/')).toBe(true);

    expect(
      result.relationships.some(
        (r) => r.relationship_type === 'CONTAINS_ENDPOINT' && r.target_value === 'https://example.com/admin-console/',
      ),
    ).toBe(true);

    expect(result.evidence.some((ev) => ev.source_type === 'ROBOTS_TXT')).toBe(true);
  });

  it('detects OpenID configuration and digital assetlinks', async () => {
    const mockOpenId = JSON.stringify({
      issuer: 'https://auth.example.com',
      authorization_endpoint: 'https://auth.example.com/oauth2/v1/authorize',
      token_endpoint: 'https://auth.example.com/oauth2/v1/token',
    });

    const mockAssetLinks = JSON.stringify([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.example.mobileapp',
        },
      },
    ]);

    vi.spyOn(ssrf, 'safeFetch').mockImplementation(async (url: string) => {
      if (url.includes('openid-configuration')) {
        return { ok: true, status: 200, url } as any;
      }
      if (url.includes('assetlinks.json')) {
        return { ok: true, status: 200, url } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    vi.spyOn(ssrf, 'readResponseWithLimit').mockImplementation(async (res: any) => {
      if (res?.url?.includes('assetlinks.json')) {
        return mockAssetLinks;
      }
      return mockOpenId;
    });

    const result = await wellKnownReconCollector.run('example.com', ctx);
    const idp = result.entities.find((e) => e.type === 'IDENTITY_PROVIDER');
    expect(idp).toBeDefined();
    expect(idp?.value).toBe('https://auth.example.com');

    const app = result.entities.find((e) => e.value === 'com.example.mobileapp');
    expect(app).toBeDefined();
    expect(app?.type).toBe('ORGANIZATION');
  });
});
