import { describe, it, expect } from 'vitest';
import { getCollector } from '../collectors/registry.js';
import { getTransform } from '../transforms/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { parseCdxUrls } from '../collectors/historical-urls.js';
import { parseSecurityTxt, parseSitemapUrls } from '../collectors/web-exposure.js';
import { parseReverseIpResponse } from '../collectors/reverse-ip.js';
import { murmurHash3_32, formatShodanFaviconBase64 } from '../collectors/favicon-hash.js';

describe('Deep Domain & URL Reconnaissance Suite', () => {
  describe('Collector & Transform Registration', () => {
    it('should register all 4 new collectors in the registry', () => {
      expect(getCollector('historical-urls')).toBeDefined();
      expect(getCollector('web-exposure')).toBeDefined();
      expect(getCollector('reverse-ip')).toBeDefined();
      expect(getCollector('favicon-hash')).toBeDefined();
    });

    it('should register all 4 new transforms in the transform registry', () => {
      const hist = getTransform('domain.historical-urls');
      expect(hist).toBeDefined();
      expect(hist?.inputTypes).toContain('DOMAIN');
      expect(hist?.inputTypes).toContain('URL');

      const webExp = getTransform('domain.web-exposure');
      expect(webExp).toBeDefined();
      expect(webExp?.inputTypes).toContain('DOMAIN');

      const revIp = getTransform('domain.reverse-ip');
      expect(revIp).toBeDefined();
      expect(revIp?.inputTypes).toContain('DOMAIN');
      expect(revIp?.inputTypes).toContain('IP_ADDRESS');

      const fav = getTransform('domain.favicon-hash');
      expect(fav).toBeDefined();
      expect(fav?.inputTypes).toContain('DOMAIN');
    });

    it('should include new transforms in DOMAIN and URL discovery plans', () => {
      const domainPlan = buildDiscoveryPlan('DOMAIN', 'example.com');
      const domainTransformIds = domainPlan.transforms.map((t) => t.id);
      expect(domainTransformIds).toContain('domain.historical-urls');
      expect(domainTransformIds).toContain('domain.web-exposure');
      expect(domainTransformIds).toContain('domain.reverse-ip');
      expect(domainTransformIds).toContain('domain.favicon-hash');
      expect(domainTransformIds).toContain('infrastructure.shodan-recon');

      const urlPlan = buildDiscoveryPlan('URL', 'https://example.com/login');
      const urlTransformIds = urlPlan.transforms.map((t) => t.id);
      expect(urlTransformIds).toContain('domain.historical-urls');
      expect(urlTransformIds).toContain('domain.web-exposure');
      expect(urlTransformIds).toContain('domain.favicon-hash');
      expect(urlTransformIds).toContain('domain.reverse-ip');
      expect(urlTransformIds).toContain('infrastructure.shodan-recon');
    });

    it('should include domain.reverse-ip and infrastructure.shodan-recon in IP_ADDRESS discovery plan', () => {
      const ipPlan = buildDiscoveryPlan('IP_ADDRESS', '93.184.216.34');
      const ipTransformIds = ipPlan.transforms.map((t) => t.id);
      expect(ipTransformIds).toContain('domain.reverse-ip');
      expect(ipTransformIds).toContain('infrastructure.shodan-recon');
    });
  });

  describe('Historical URLs Parser (Wayback CDX)', () => {
    it('should extract valid URLs and filter static assets from CDX json response', () => {
      const mockCdx = JSON.stringify([
        ['original'],
        ['https://example.com/api/v1/users?page=1'],
        ['https://example.com/static/bundle.css'],
        ['https://example.com/assets/logo.png'],
        ['https://example.com/admin/login.php'],
        ['https://sub.example.com/internal/status'],
        ['https://otherdomain.com/unrelated'],
      ]);

      const parsed = parseCdxUrls(mockCdx, 'example.com');
      expect(parsed).toContain('https://example.com/api/v1/users?page=1');
      expect(parsed).toContain('https://example.com/admin/login.php');
      expect(parsed).toContain('https://sub.example.com/internal/status');
      // Static media filtered
      expect(parsed.some((u) => u.endsWith('.png'))).toBe(false);
      expect(parsed.some((u) => u.endsWith('.css'))).toBe(false);
      // Out of scope domain filtered
      expect(parsed.some((u) => u.includes('otherdomain.com'))).toBe(false);
    });
  });

  describe('Web Exposure Parser (security.txt & sitemap.xml)', () => {
    it('should parse security.txt directives and contacts accurately', () => {
      const mockSecTxt = `
# Security disclosure
Contact: mailto:security@example.com
Contact: https://example.com/security-form
Policy: https://example.com/security-policy.html
Acknowledgments: https://example.com/hall-of-fame
Canonical: https://example.com/.well-known/security.txt
      `;

      const result = parseSecurityTxt(mockSecTxt);
      expect(result.contacts).toHaveLength(2);
      expect(result.contacts[0]).toBe('mailto:security@example.com');
      expect(result.policies).toContain('https://example.com/security-policy.html');
      expect(result.acknowledgments).toContain('https://example.com/hall-of-fame');
    });

    it('should extract in-scope URLs from sitemap.xml', () => {
      const mockSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/portal/login</loc>
    <lastmod>2024-01-01</lastmod>
  </url>
  <url>
    <loc>https://example.com/api/docs</loc>
  </url>
  <url>
    <loc>https://evil.com/phish</loc>
  </url>
</urlset>`;

      const urls = parseSitemapUrls(mockSitemap, 'example.com');
      expect(urls).toContain('https://example.com/portal/login');
      expect(urls).toContain('https://example.com/api/docs');
      expect(urls).not.toContain('https://evil.com/phish');
    });
  });

  describe('Reverse IP Parser', () => {
    it('should parse sibling domains and discard error strings and the original domain', () => {
      const mockReverseIpText = `
staging.example.com
demo.partner-corp.com
admin-internal.site.org
No records found
API count exceeded
example.com
      `;

      const siblings = parseReverseIpResponse(mockReverseIpText, 'example.com');
      expect(siblings).toContain('staging.example.com');
      expect(siblings).toContain('demo.partner-corp.com');
      expect(siblings).toContain('admin-internal.site.org');
      expect(siblings).not.toContain('example.com');
      expect(siblings.some((s) => s.includes('error') || s.includes('records'))).toBe(false);
    });
  });

  describe('Favicon MurmurHash3 & Shodan Base64 Formatting', () => {
    it('should correctly format Buffer to RFC 2045 base64 with newlines every 76 chars', () => {
      // 100 bytes buffer
      const dummyBuffer = Buffer.alloc(100, 0x41); // 'A' repeated
      const formatted = formatShodanFaviconBase64(dummyBuffer);
      const str = formatted.toString('utf-8');

      expect(str.endsWith('\n')).toBe(true);
      const lines = str.split('\n').filter(Boolean);
      expect(lines[0].length).toBe(76);
    });

    it('should compute MurmurHash3_32 deterministic 32-bit signed integer', () => {
      const emptyBuffer = Buffer.from('');
      expect(murmurHash3_32(emptyBuffer, 0)).toBe(0);

      const testData = Buffer.from('NexusGraph-OSINT');
      const hash1 = murmurHash3_32(testData, 0);
      const hash2 = murmurHash3_32(testData, 0);
      expect(typeof hash1).toBe('number');
      expect(hash1).toBe(hash2);
      // Hash is a 32-bit signed integer
      expect(hash1).toBeGreaterThanOrEqual(-2147483648);
      expect(hash1).toBeLessThanOrEqual(2147483647);
    });
  });
});
