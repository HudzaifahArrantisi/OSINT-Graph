import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { dnsCollector } from '../collectors/dns.js';
import { tlsCertificateCollector } from '../collectors/tls-certificate.js';
import { githubCollector } from '../collectors/github.js';
import { usernamePresenceCollector } from '../collectors/username-presence.js';

describe('OSINT Collectors Deterministic Tests', () => {
  const ctx = {
    caseId: 'case-test-1',
    signal: new AbortController().signal,
    requestId: 'req-test-1',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DNS Collector', () => {
    it('should extract A, MX, NS, CNAME records into entities and relationships', async () => {
      // Mock Cloudflare DoH responses
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('type=A')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Status: 0,
              Answer: [{ name: 'example.com', type: 1, TTL: 300, data: '93.184.216.34' }],
            }),
          });
        }
        if (urlStr.includes('type=MX')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Status: 0,
              Answer: [{ name: 'example.com', type: 15, TTL: 300, data: '10 mail.example.com.' }],
            }),
          });
        }
        if (urlStr.includes('type=NS')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              Status: 0,
              Answer: [{ name: 'example.com', type: 2, TTL: 300, data: 'ns1.example.com.' }],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ Status: 0, Answer: [] }),
        });
      });

      const result = await dnsCollector.run('example.com', ctx);

      expect(result.entities.some((e) => e.type === 'IP_ADDRESS' && e.value === '93.184.216.34')).toBe(true);
      expect(result.entities.some((e) => e.type === 'DOMAIN' && e.value === 'mail.example.com')).toBe(true);
      expect(result.entities.some((e) => e.type === 'DOMAIN' && e.value === 'ns1.example.com')).toBe(true);

      expect(result.relationships.some((r) => r.relationship_type === 'RESOLVES_TO')).toBe(true);
      expect(result.relationships.some((r) => r.relationship_type === 'OBSERVED_ON')).toBe(true);
      expect(result.relationships.some((r) => r.relationship_type === 'HOSTED_ON')).toBe(true);
      expect(result.evidence.length).toBeGreaterThan(0);
    });

    it('should handle DoH network errors gracefully without throwing', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      const result = await dnsCollector.run('offline.domain', ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('TLS Certificate Collector', () => {
    it('should extract certificates, SANs, and link domains via crt.sh', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 123456,
            issuer_ca_id: 1,
            issuer_name: "C=US, O=Let's Encrypt, CN=R3",
            common_name: 'example.com',
            name_value: 'example.com\nsub.example.com\napi.example.com',
            not_before: '2024-01-01',
            not_after: '2024-04-01',
            serial_number: '03a1b2c3d4e5f6',
          },
        ],
      });

      const result = await tlsCertificateCollector.run('example.com', ctx);

      expect(result.entities.some((e) => e.type === 'CERTIFICATE')).toBe(true);
      expect(result.entities.some((e) => e.type === 'DOMAIN' && e.value === 'sub.example.com')).toBe(true);
      expect(result.entities.some((e) => e.type === 'DOMAIN' && e.value === 'api.example.com')).toBe(true);
      expect(result.relationships.some((r) => r.relationship_type === 'RELATED_TO')).toBe(true);
    });
  });

  describe('GitHub Public Collector', () => {
    it('should extract public profile, email, website, and repos', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('/repos')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              {
                name: 'security-tool',
                full_name: 'octocat/security-tool',
                html_url: 'https://github.com/octocat/security-tool',
                description: 'OSINT tool',
                language: 'TypeScript',
                homepage: 'https://security-tool.io',
                stargazers_count: 120,
                forks_count: 30,
                created_at: '2023-01-01',
                updated_at: '2024-01-01',
                topics: ['osint', 'security'],
              },
            ],
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            login: 'octocat',
            id: 1,
            name: 'The Octocat',
            email: 'octocat@github.com',
            bio: 'GitHub mascot',
            blog: 'https://octocat.io',
            company: '@github',
            location: 'San Francisco',
            twitter_username: 'octocat',
            public_repos: 8,
            html_url: 'https://github.com/octocat',
            avatar_url: 'https://github.com/images/error/octocat_happy.gif',
            created_at: '2011-01-25T18:44:36Z',
            updated_at: '2024-01-01T00:00:00Z',
            type: 'User',
          }),
        });
      });

      const result = await githubCollector.run('octocat', ctx);

      expect(result.entities.some((e) => e.type === 'GITHUB_PROFILE' && e.value === 'https://github.com/octocat')).toBe(true);
      expect(result.entities.some((e) => e.type === 'EMAIL' && e.value === 'octocat@github.com')).toBe(true);
      expect(result.entities.some((e) => e.type === 'WEBSITE' && e.value === 'https://octocat.io')).toBe(true);
      expect(result.entities.some((e) => e.type === 'REPOSITORY')).toBe(true);
      expect(result.relationships.some((r) => r.relationship_type === 'HAS_PUBLIC_EMAIL')).toBe(true);
      expect(result.relationships.some((r) => r.relationship_type === 'LINKS_TO')).toBe(true);
    });

    it('should handle 404 not found user gracefully with warning', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await githubCollector.run('non_existent_analyst_999', ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.some((w) => w.includes('not found'))).toBe(true);
    });
  });

  describe('Username Presence Collector', () => {
    it('should use POSSIBLY_SAME_AS with non-deterministic identity warning', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        // Return 200 for GitHub and Reddit, 404 for others
        if (urlStr.includes('github.com') || urlStr.includes('reddit.com')) {
          return Promise.resolve({ status: 200 });
        }
        return Promise.resolve({ status: 404 });
      });

      const result = await usernamePresenceCollector.run('sampleuser', ctx);

      const profileEntities = result.entities.filter((e) => e.type === 'SOCIAL_PROFILE');
      expect(profileEntities.length).toBe(2);

      // Verify relationship is POSSIBLY_SAME_AS (not SAME_AS)
      const relationships = result.relationships.filter((r) => r.relationship_type === 'POSSIBLY_SAME_AS');
      expect(relationships.length).toBe(2);
      expect(relationships[0].reason).toContain('does not confirm identity');
    });
  });
});
