import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  passiveDnsCollector,
  parseHackerTargetHostsearch,
  parseAlienVaultOtxPassiveDns,
} from '../collectors/passive-dns.js';
import * as ssrf from '../security/ssrf.js';

const ctx = {
  caseId: 'test-case-id',
  requestId: 'test-req-id',
  signal: new AbortController().signal,
};

describe('Passive DNS & Historical IP Resolution Collector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports DOMAIN, URL, and WEBSITE input types', () => {
    expect(passiveDnsCollector.supports('DOMAIN')).toBe(true);
    expect(passiveDnsCollector.supports('URL')).toBe(true);
    expect(passiveDnsCollector.supports('WEBSITE' as any)).toBe(true);
    expect(passiveDnsCollector.supports('EMAIL')).toBe(false);
    expect(passiveDnsCollector.supports('PHONE')).toBe(false);
  });

  it('parses HackerTarget hostsearch lines correctly and rejects private IPs', () => {
    const raw = `
api.example.com,93.184.216.34
dev.example.com,192.168.1.1
vpn.example.com,10.0.0.1
mail.example.com,93.184.216.35
unrelated.other.org,93.184.216.99
`;
    const records = parseHackerTargetHostsearch(raw, 'example.com');
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.hostname)).toEqual(['api.example.com', 'mail.example.com']);
    expect(records.map((r) => r.ip)).toEqual(['93.184.216.34', '93.184.216.35']);
  });

  it('parses AlienVault OTX JSON passive DNS entries', () => {
    const jsonStr = JSON.stringify({
      passive_dns: [
        {
          address: '93.184.216.40',
          hostname: 'staging.example.com',
          first: '2021-01-01T00:00:00Z',
          last: '2023-01-01T00:00:00Z',
        },
        {
          address: '127.0.0.1', // should be filtered out
          hostname: 'local.example.com',
        },
      ],
    });

    const records = parseAlienVaultOtxPassiveDns(jsonStr, 'example.com');
    expect(records).toHaveLength(1);
    expect(records[0].ip).toBe('93.184.216.40');
    expect(records[0].hostname).toBe('staging.example.com');
  });

  it('runs successfully with mocked feeds and generates historical entities', async () => {
    vi.spyOn(ssrf, 'safeFetch').mockImplementation(async (url: string) => {
      if (url.includes('api.hackertarget.com')) {
        return { ok: true, status: 200 } as any;
      }
      if (url.includes('otx.alienvault.com')) {
        return { ok: true, status: 200 } as any;
      }
      return { ok: false, status: 404 } as any;
    });

    vi.spyOn(ssrf, 'readResponseWithLimit').mockImplementation(async (_res: any) => {
      // Return hostsearch format
      return 'origin.example.com,198.51.100.22\nportal.example.com,203.0.113.88';
    });

    const result = await passiveDnsCollector.run('example.com', ctx);

    expect(result.source).toBe('passive-dns');
    const ips = result.entities.filter((e) => e.type === 'IP_ADDRESS');
    expect(ips.length).toBeGreaterThan(0);

    // Verify relationship
    expect(
      result.relationships.some((r) => r.relationship_type === 'RESOLVED_HISTORICALLY'),
    ).toBe(true);

    expect(result.evidence.some((ev) => ev.source_type === 'PASSIVE_DNS')).toBe(true);
  });
});
