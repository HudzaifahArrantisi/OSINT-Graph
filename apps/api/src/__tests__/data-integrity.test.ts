import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { parseSeed } from '../discovery/seed-classifier.js';
import { usernamePresenceCollector } from '../collectors/username-presence.js';
import { gitlabCollector } from '../collectors/gitlab.js';
import { githubCollector } from '../collectors/github.js';
import { youtubeCollector } from '../collectors/youtube.js';
import { urlMetadataCollector } from '../collectors/url-metadata.js';
import { executeTransform } from '../transforms/adapter.js';

describe('Data Integrity & No-Contamination Verification Suite', () => {
  const ctx = {
    caseId: 'case-integrity-test',
    signal: new AbortController().signal,
    requestId: 'req-integrity-1',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Scenario 1: URL Input — https://www.loket.com/', () => {
    const urlSeed = 'https://www.loket.com/';

    it('should formulate plan with ONLY infrastructure and web metadata transforms', () => {
      const plan = buildDiscoveryPlan('URL', urlSeed);
      const transformIds = plan.transforms.map((t) => t.id);

      // Must have infrastructure/web transforms
      expect(transformIds).toContain('domain.webpage-metadata');
      expect(transformIds).toContain('domain.resolve-dns');
      expect(transformIds).toContain('domain.find-tls');

      // Must NEVER contain social/username/developer transforms for unrelated accounts
      expect(transformIds).not.toContain('social.discover-public-profiles');
      expect(transformIds).not.toContain('developer.gitlab-profile');
      expect(transformIds).not.toContain('social.youtube-channel');
    });

    it('should deterministically extract DOMAIN from URL with HOSTED_ON relationship', () => {
      const parsed = parseSeed('URL', urlSeed);

      expect(parsed.seedEntity.type).toBe('SEED');
      expect(parsed.seedEntity.value).toBe(urlSeed);
      expect(parsed.seedEntity.confidence).toBe(30);

      expect(parsed.derivedEntities.length).toBe(1);
      expect(parsed.derivedEntities[0].type).toBe('DOMAIN');
      expect(parsed.derivedEntities[0].value).toBe('loket.com');
      expect(parsed.derivedEntities[0].relationshipType).toBe('HOSTED_ON');
    });

    it('username-presence collector MUST reject URL and return 0 entities', async () => {
      const result = await usernamePresenceCollector.run(urlSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.relationships.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('gitlab collector MUST reject URL and return 0 entities', async () => {
      const result = await gitlabCollector.run(urlSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('github collector MUST reject URL and return 0 entities', async () => {
      const result = await githubCollector.run(urlSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('youtube collector MUST reject URL and return 0 entities', async () => {
      const result = await youtubeCollector.run(urlSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 2: Email Input — hudzaifaharantisi17@gmail.com', () => {
    const emailSeed = 'hudzaifaharantisi17@gmail.com';

    it('should formulate plan scoped to email and its derived domain infrastructure', () => {
      const plan = buildDiscoveryPlan('EMAIL', emailSeed);
      const transformIds = plan.transforms.map((t) => t.id);

      expect(transformIds).toContain('developer.github-profile');
      expect(transformIds).toContain('domain.resolve-dns');

      // Must NEVER strip local part to query generic username platforms
      expect(transformIds).not.toContain('social.discover-public-profiles');
      expect(transformIds).not.toContain('social.youtube-channel');
      expect(transformIds).not.toContain('developer.gitlab-profile');
    });

    it('should deterministically extract domain gmail.com from email', () => {
      const parsed = parseSeed('EMAIL', emailSeed);

      expect(parsed.seedEntity.type).toBe('SEED');
      expect(parsed.seedEntity.value).toBe(emailSeed);
      expect(parsed.derivedEntities.length).toBe(1);
      expect(parsed.derivedEntities[0].type).toBe('DOMAIN');
      expect(parsed.derivedEntities[0].value).toBe('gmail.com');
      expect(parsed.derivedEntities[0].relationshipType).toBe('OBSERVED_ON');
    });

    it('github collector must search exact email and NEVER fallback to username handle', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('cloudflare-dns.com')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                Status: 0,
                Answer: [{ name: 'api.github.com', type: 1, TTL: 300, data: '140.82.121.4' }],
              }),
              { headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        // Check that it calls /search/users?q=...in:email
        if (urlStr.includes('/search/users?q=')) {
          expect(urlStr).toContain(encodeURIComponent(emailSeed));
          expect(urlStr).toContain('in:email');
          // Return empty items
          return Promise.resolve(
            new Response(JSON.stringify({ total_count: 0, items: [] }), {
              headers: { 'content-type': 'application/json' },
            }),
          );
        }
        return Promise.resolve(new Response('Not found', { status: 404 }));
      });

      const result = await githubCollector.run(emailSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.some((w) => w.includes('No public GitHub user'))).toBe(true);
    });

    it('username-presence collector MUST reject email input', async () => {
      const result = await usernamePresenceCollector.run(emailSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('gitlab collector MUST reject email input', async () => {
      const result = await gitlabCollector.run(emailSeed, ctx);
      expect(result.entities.length).toBe(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Scenario 3: Organization / Name Input — Nurul Fikri', () => {
    const orgSeed = 'Nurul Fikri';

    it('should start with unverified low confidence (30%)', () => {
      const parsed = parseSeed('ORGANIZATION', orgSeed);
      expect(parsed.seedEntity.confidence).toBe(30);
      expect(parsed.seedEntity.metadata?.isSeed).toBe(true);
    });

    it('should return NOT_FOUND cleanly when web search finds no official candidate', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('cloudflare-dns.com')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                Status: 0,
                Answer: [{ name: 'api.duckduckgo.com', type: 1, TTL: 300, data: '52.142.124.215' }],
              }),
              { headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ AbstractURL: '', RelatedTopics: [], Heading: '' }), {
            headers: { 'content-type': 'application/json' },
          }),
        );
      });

      const result = await executeTransform(
        'web.discover-official-site',
        orgSeed,
        'ORGANIZATION',
        orgSeed,
        ctx,
      );

      expect(result.status).toBe('NOT_FOUND');
      expect(result.entities.length).toBe(0);
    });

    it('should attach structured provenance metadata to any discovered entities', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url.toString();
        if (urlStr.includes('cloudflare-dns.com')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                Status: 0,
                Answer: [{ name: 'nurulfikri.ac.id', type: 1, TTL: 300, data: '103.28.148.18' }],
              }),
              { headers: { 'content-type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            `<!DOCTYPE html>
            <html>
              <head><title>Nurul Fikri Home</title></head>
              <body>
                <p>Contact: info@nurulfikri.ac.id</p>
                <a href="https://github.com/nurulfikri-org">GitHub</a>
              </body>
            </html>`,
            {
              status: 200,
              headers: { 'content-type': 'text/html', server: 'nginx/1.18.0' },
            },
          ),
        );
      });

      const result = await urlMetadataCollector.run('https://nurulfikri.ac.id', ctx);

      expect(result.entities.length).toBeGreaterThan(0);
      for (const entity of result.entities) {
        const src = entity.metadata?.source as Record<string, any> | undefined;
        expect(src).toBeDefined();
        expect(src?.url).toBe('https://nurulfikri.ac.id');
        expect(src?.collector).toBe('url-metadata');
        expect(src?.collectedAt).toBeDefined();
      }
    });
  });
});
