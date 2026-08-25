import { describe, it, expect } from 'vitest';
import { subdomainCrtCollector, parseCrtResponse, deriveApexDomain } from '../collectors/subdomain-crt.js';

const ctx = {
  caseId: 'test-case',
  requestId: 'test-req',
  signal: new AbortController().signal,
};

describe('subdomain-crt collector', () => {
  it('supports DOMAIN, URL and ORGANIZATION seeds only', () => {
    expect(subdomainCrtCollector.supports('DOMAIN')).toBe(true);
    expect(subdomainCrtCollector.supports('URL')).toBe(true);
    expect(subdomainCrtCollector.supports('ORGANIZATION')).toBe(true);
    expect(subdomainCrtCollector.supports('EMAIL')).toBe(false);
    expect(subdomainCrtCollector.supports('USERNAME')).toBe(false);
  });

  it('derives the apex domain from domains, URLs and emails', () => {
    expect(deriveApexDomain('target.com')).toBe('target.com');
    expect(deriveApexDomain('https://api.target.com/path?q=1')).toBe('api.target.com');
    expect(deriveApexDomain('http://www.TARGET.com:8080')).toBe('target.com');
    expect(deriveApexDomain('user@target.com')).toBeNull();
    expect(deriveApexDomain('not a domain')).toBeNull();
    expect(deriveApexDomain('localhost')).toBeNull();
  });

  it('parses the plain-text crt.name response and keeps only apex descendants', () => {
    const body = [
      'target.com',
      'api.target.com',
      'www.target.com',
      'evil.com',
      'not-target.com.evil.io',
      '*.wildcard.target.com',
      'bad hostname with spaces',
      'API.Target.COM',
    ].join('\n');

    const subs = parseCrtResponse(body, 'target.com');
    // evil.com / not-target.com.evil.io must NOT be included; near-match
    // "not-target.com" ends with ".com" not ".target.com" so excluded too.
    expect(subs).toContain('api.target.com');
    expect(subs).toContain('www.target.com');
    expect(subs).toContain('api.target.com'); // dedupe keeps single entry (case-insensitive)
    expect(subs.filter((s) => s === 'api.target.com')).toHaveLength(1);
    expect(subs.every((s) => s === 'target.com' || s.endsWith('.target.com'))).toBe(true);
    expect(subs.every((s) => !s.startsWith('*.'))).toBe(true);
    expect(subs.some((s) => s.includes('evil'))).toBe(false);
  });

  it('runs a live enumeration against crt.name and emits provenance-backed entities', async () => {
    const result = await subdomainCrtCollector.run('github.com', ctx);

    expect(result.warnings).toHaveLength(0);
    expect(result.entities.length).toBeGreaterThan(0);
    expect(result.entities.length).toBeLessThanOrEqual(1000);
    for (const e of result.entities) {
      expect(e.type).toBe('SUBDOMAIN');
      expect(e.value.endsWith('.github.com') || e.value === 'github.com').toBe(true);
      expect((e.metadata as any)?.source?.collector).toBe('subdomain-crt');
    }
    for (const rel of result.relationships) {
      expect(rel.relationship_type).toBe('RESOLVES_TO');
      expect(rel.target_value).toBe('github.com');
      expect(rel.reason).toContain('Certificate Transparency');
    }
    const evidence = result.evidence[0];
    expect(evidence.source_type).toBe('SUBDOMAIN_ENUM');
    expect(evidence.source_url).toBe('https://crt.name/v1/search?apex=github.com');
  }, 60_000);

  it('warns on non-domain ORGANIZATION values without network activity', async () => {
    const result = await subdomainCrtCollector.run('Acme Corporation', ctx);
    expect(result.entities).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('apex domain');
  });
});
