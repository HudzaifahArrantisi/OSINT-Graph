import { describe, it, expect, vi, beforeEach } from 'vitest';
import { whoisRdapCollector, deriveApexForRdap } from '../collectors/whois-rdap.js';
import * as ssrf from '../security/ssrf.js';

const ctx = {
  caseId: 'test-case-id',
  requestId: 'test-req-id',
  signal: new AbortController().signal,
};

describe('WHOIS / RDAP Collector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports DOMAIN, URL, and ORGANIZATION input types', () => {
    expect(whoisRdapCollector.supports('DOMAIN')).toBe(true);
    expect(whoisRdapCollector.supports('URL')).toBe(true);
    expect(whoisRdapCollector.supports('ORGANIZATION')).toBe(true);
    expect(whoisRdapCollector.supports('PHONE')).toBe(false);
    expect(whoisRdapCollector.supports('EMAIL')).toBe(false);
  });

  it('correctly derives apex domain from various URL and host formats', () => {
    expect(deriveApexForRdap('https://sub.example.com/path?a=1')).toBe('sub.example.com');
    expect(deriveApexForRdap('http://www.target.org:8080/')).toBe('target.org');
    expect(deriveApexForRdap('  Acme-Corp.com  ')).toBe('acme-corp.com');
    expect(deriveApexForRdap('not-a-domain')).toBeNull();
  });

  it('handles successful RDAP responses with registrar, registrant, and nameservers', async () => {
    const mockRdapJson = {
      handle: '2336799_DOMAIN_COM-VRSN',
      ldhName: 'EXAMPLE.COM',
      status: ['clientDeleteProhibited', 'clientTransferProhibited'],
      events: [
        { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
        { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' },
        { eventAction: 'last changed', eventDate: '2024-08-14T07:01:38Z' },
      ],
      entities: [
        {
          roles: ['registrar'],
          vcardArray: [
            'vcard',
            [
              ['version', {}, 'text', '4.0'],
              ['fn', {}, 'text', 'ICANN Reserve Registrar, LLC'],
            ],
          ],
        },
        {
          roles: ['registrant'],
          vcardArray: [
            'vcard',
            [
              ['version', {}, 'text', '4.0'],
              ['org', {}, 'text', 'Internet Assigned Numbers Authority'],
            ],
          ],
        },
      ],
      nameservers: [
        { ldhName: 'a.iana-servers.net' },
        { ldhName: 'b.iana-servers.net' },
      ],
    };

    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as any);

    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValueOnce(JSON.stringify(mockRdapJson));

    const result = await whoisRdapCollector.run('example.com', ctx);

    expect(result.source).toBe('whois-rdap');
    expect(result.warnings.length).toBe(0);

    // Verify registrar organization entity
    const registrar = result.entities.find((e) => e.value === 'ICANN Reserve Registrar, LLC');
    expect(registrar).toBeDefined();
    expect(registrar?.type).toBe('ORGANIZATION');

    // Verify registrant organization entity
    const registrant = result.entities.find((e) => e.value === 'Internet Assigned Numbers Authority');
    expect(registrant).toBeDefined();
    expect(registrant?.type).toBe('ORGANIZATION');

    // Verify nameserver entities
    const ns = result.entities.filter((e) => e.type === 'NS_RECORD');
    expect(ns.length).toBe(2);
    expect(ns.map((n) => n.value)).toContain('a.iana-servers.net');

    // Verify evidence record
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].source_type).toBe('WHOIS_RDAP');
    expect(result.evidence[0].metadata?.registrationDate).toBe('1995-08-14T04:00:00Z');
    expect(result.evidence[0].metadata?.expirationDate).toBe('2027-08-13T04:00:00Z');

    // Verify relationships
    const rels = result.relationships;
    expect(rels.some((r) => r.relationship_type === 'BELONGS_TO' && r.target_value === 'ICANN Reserve Registrar, LLC')).toBe(true);
    expect(rels.some((r) => r.relationship_type === 'OWNS_DOMAIN' && r.source_value === 'Internet Assigned Numbers Authority')).toBe(true);
    expect(rels.some((r) => r.relationship_type === 'HOSTED_ON' && r.target_value === 'a.iana-servers.net')).toBe(true);
  });

  it('redacts privacy-protected registrant info gracefully', async () => {
    const mockRdapJson = {
      handle: 'DOMAIN-123',
      events: [{ eventAction: 'registration', eventDate: '2020-01-01T00:00:00Z' }],
      entities: [
        {
          roles: ['registrant'],
          vcardArray: [
            'vcard',
            [['fn', {}, 'text', 'REDACTED FOR PRIVACY']],
          ],
        },
      ],
      nameservers: [],
    };

    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as any);

    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValueOnce(JSON.stringify(mockRdapJson));

    const result = await whoisRdapCollector.run('privatedomain.com', ctx);

    // Should NOT emit a person or organization for redacted privacy text
    const person = result.entities.find((e) => e.value === 'REDACTED FOR PRIVACY');
    expect(person).toBeUndefined();
    expect(result.evidence[0].metadata?.isRegistrantRedacted).toBe(true);
  });

  it('returns graceful warning when RDAP server returns 404', async () => {
    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as any);

    const result = await whoisRdapCollector.run('unregistered-nonexistent-1234567.com', ctx);

    expect(result.entities.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('HTTP 404');
  });
});
