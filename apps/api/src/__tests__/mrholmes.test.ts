import { describe, it, expect } from 'vitest';
import { dorkGeneratorCollector, inferDorkSeedType } from '../collectors/dork-generator.js';
import { emailLookupCollector } from '../collectors/email-lookup.js';
import { websiteReconCollector } from '../collectors/website-recon.js';
import { usernameSweepCollector } from '../collectors/username-sweep.js';
import { MR_HOLMES_SITES } from '../collectors/data/mrholmes-sites.generated.js';
import { MR_HOLMES_DORK_GROUPS } from '../collectors/data/mrholmes-dorks.generated.js';

const ctx = {
  caseId: 'test-case',
  requestId: 'test-req',
  signal: new AbortController().signal,
};

describe('Mr.Holmes data files', () => {
  it('ports a substantial Mr.Holmes site list with unique URLs', () => {
    expect(MR_HOLMES_SITES.length).toBeGreaterThan(100);
    const urls = MR_HOLMES_SITES.map((s) => s.url);
    expect(new Set(urls).size).toBe(urls.length);
    for (const site of MR_HOLMES_SITES) {
      expect(site.url).toMatch(/^https?:\/\//);
      if (site.mode === 'MESSAGE') expect(site.notFoundText).toBeTruthy();
      if (site.mode === 'REDIRECT') expect(site.redirectTarget).toMatch(/^https?:\/\//);
    }
  });

  it('ports dork template groups for every category', () => {
    const categories = new Set(MR_HOLMES_DORK_GROUPS.map((g) => g.category));
    for (const expected of ['username', 'email', 'phone', 'phone-fingerprint', 'website']) {
      expect(categories.has(expected)).toBe(true);
    }
    for (const group of MR_HOLMES_DORK_GROUPS) {
      expect(group.templates.length).toBeGreaterThan(0);
      for (const t of group.templates) expect(t).toContain('{}');
    }
  });
});

describe('dork-generator collector', () => {
  it('supports domain and url seeds only, excluding personal identity seeds', () => {
    expect(dorkGeneratorCollector.supports('DOMAIN')).toBe(true);
    expect(dorkGeneratorCollector.supports('URL')).toBe(true);
    expect(dorkGeneratorCollector.supports('USERNAME')).toBe(false);
    expect(dorkGeneratorCollector.supports('EMAIL')).toBe(false);
    expect(dorkGeneratorCollector.supports('PHONE')).toBe(false);
    expect(dorkGeneratorCollector.supports('IP_ADDRESS')).toBe(false);
    expect(dorkGeneratorCollector.supports('ORGANIZATION')).toBe(false);
  });

  it('generates deterministic site-scoped dork URLs for a domain', async () => {
    const result = await dorkGeneratorCollector.run('example.com', ctx);
    expect(result.warnings).toHaveLength(0);
    expect(result.evidence.length).toBeGreaterThan(10);

    for (const ev of result.evidence) {
      expect(ev.source_type).toBe('DORK_TEMPLATE');
      expect(ev.source_url).toContain('example.com');
      expect(ev.metadata?.deterministic).toBe(true);
    }

    const templates = MR_HOLMES_DORK_GROUPS.flatMap((g) => g.templates);
    for (const ev of result.evidence) {
      expect(templates.some((t) => t.replace(/\{\}/g, encodeURIComponent('example.com')) === ev.source_url)).toBe(true);
    }
  });

  it('is fully deterministic across runs', async () => {
    const a = await dorkGeneratorCollector.run('acme.com', ctx);
    const b = await dorkGeneratorCollector.run('acme.com', ctx);
    expect(a.evidence.map((e) => e.source_url)).toEqual(b.evidence.map((e) => e.source_url));
  });

  it('uses website categories for a domain seed and site-scopes the queries', async () => {
    const result = await dorkGeneratorCollector.run('acme.com', ctx);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.evidence.some((e) => (e.source_url || '').includes('site%3A') || (e.source_url || '').includes('site:'))).toBe(true);
  });

  it('warns on trivial seeds without throwing', async () => {
    const result = await dorkGeneratorCollector.run('x', ctx);
    expect(result.warnings).toHaveLength(1);
    expect(result.entities).toHaveLength(0);
  });
});

describe('seed type inference', () => {
  it('classifies inputs deterministically', () => {
    expect(inferDorkSeedType('https://acme.com/page')).toBe('URL');
    expect(inferDorkSeedType('acme.com')).toBe('DOMAIN');
  });
});

describe('username-sweep collector', () => {
  it('supports only USERNAME seed type', () => {
    expect(usernameSweepCollector.supports('USERNAME')).toBe(true);
    expect(usernameSweepCollector.supports('EMAIL')).toBe(false);
  });

  it('rejects invalid usernames without any network activity', async () => {
    const result = await usernameSweepCollector.run('https://evil.example/x', ctx);
    expect(result.entities).toHaveLength(0);
    expect(result.relationships).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });

  it('rejects usernames containing @ or spaces', async () => {
    for (const bad of ['a b', '@x@y', 'x'.repeat(51)]) {
      const result = await usernameSweepCollector.run(bad, ctx);
      expect(result.warnings).toHaveLength(1);
    }
  });
});

describe('email-lookup collector', () => {
  it('supports only EMAIL seed type', () => {
    expect(emailLookupCollector.supports('EMAIL')).toBe(true);
    expect(emailLookupCollector.supports('DOMAIN')).toBe(false);
  });

  it('rejects invalid emails without any network activity', async () => {
    const result = await emailLookupCollector.run('not-an-email', ctx);
    expect(result.entities).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});

describe('website-recon collector', () => {
  it('supports DOMAIN and URL seed types', () => {
    expect(websiteReconCollector.supports('DOMAIN')).toBe(true);
    expect(websiteReconCollector.supports('URL')).toBe(true);
    expect(websiteReconCollector.supports('EMAIL')).toBe(false);
  });

  it('normalizes domains and rejects bare hostnames without dots', async () => {
    const result = await websiteReconCollector.run('localhost', ctx);
    expect(result.entities).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
  });
});
