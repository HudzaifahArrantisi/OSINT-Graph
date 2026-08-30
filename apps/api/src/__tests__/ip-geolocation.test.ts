import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipGeolocationCollector } from '../collectors/ip-geolocation.js';
import * as ssrf from '../security/ssrf.js';

const ctx = {
  caseId: 'test-case-id',
  requestId: 'test-req-id',
  signal: new AbortController().signal,
};

describe('IP Geolocation & ASN Collector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports only IP_ADDRESS input type', () => {
    expect(ipGeolocationCollector.supports('IP_ADDRESS')).toBe(true);
    expect(ipGeolocationCollector.supports('DOMAIN')).toBe(false);
    expect(ipGeolocationCollector.supports('EMAIL')).toBe(false);
    expect(ipGeolocationCollector.supports('USERNAME')).toBe(false);
  });

  it('rejects invalid IP address values with a warning', async () => {
    const result = await ipGeolocationCollector.run('not-an-ip-address', ctx);
    expect(result.entities.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('Invalid IP address');
  });

  it('resolves public IPv4 address and creates LOCATION and ORGANIZATION entities', async () => {
    const mockApiResponse = {
      status: 'success',
      country: 'United States',
      countryCode: 'US',
      region: 'CA',
      regionName: 'California',
      city: 'San Francisco',
      zip: '94107',
      lat: 37.7749,
      lon: -122.4194,
      timezone: 'America/Los_Angeles',
      isp: 'Cloudflare, Inc.',
      org: 'Cloudflare, Inc.',
      as: 'AS13335 CLOUDFLARENET',
      asname: 'CLOUDFLARENET',
      query: '1.1.1.1',
    };

    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as any);

    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValueOnce(JSON.stringify(mockApiResponse));

    const result = await ipGeolocationCollector.run('1.1.1.1', ctx);

    expect(result.source).toBe('ip-geolocation');
    expect(result.warnings.length).toBe(0);

    // Verify LOCATION entity
    const location = result.entities.find((e) => e.type === 'LOCATION');
    expect(location).toBeDefined();
    expect(location?.value).toBe('San Francisco, California, United States');
    expect(location?.metadata?.lat).toBe(37.7749);
    expect(location?.metadata?.lon).toBe(-122.4194);
    expect(location?.metadata?.countryCode).toBe('US');

    // Verify ORGANIZATION entity (hosting provider / ISP)
    const org = result.entities.find((e) => e.type === 'ORGANIZATION');
    expect(org).toBeDefined();
    expect(org?.value).toBe('Cloudflare, Inc.');
    expect(org?.metadata?.asn).toBe('AS13335 CLOUDFLARENET');

    // Verify GEOLOCATED_IN and HOSTED_ON relationships
    const geoRel = result.relationships.find((r) => r.relationship_type === 'GEOLOCATED_IN');
    expect(geoRel).toBeDefined();
    expect(geoRel?.source_value).toBe('1.1.1.1');
    expect(geoRel?.target_value).toBe('San Francisco, California, United States');

    const hostedRel = result.relationships.find((r) => r.relationship_type === 'HOSTED_ON');
    expect(hostedRel).toBeDefined();
    expect(hostedRel?.source_value).toBe('1.1.1.1');
    expect(hostedRel?.target_value).toBe('Cloudflare, Inc.');

    // Verify Evidence record
    expect(result.evidence.length).toBe(1);
    expect(result.evidence[0].source_type).toBe('IP_GEOLOCATION');
    expect(result.evidence[0].metadata?.as).toBe('AS13335 CLOUDFLARENET');
  });

  it('handles API failure response gracefully', async () => {
    const mockApiResponse = {
      status: 'fail',
      message: 'reserved range',
      query: '192.168.1.1',
    };

    vi.spyOn(ssrf, 'safeFetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
    } as any);

    vi.spyOn(ssrf, 'readResponseWithLimit').mockResolvedValueOnce(JSON.stringify(mockApiResponse));

    const result = await ipGeolocationCollector.run('192.168.1.1', ctx);

    expect(result.entities.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('reserved range');
  });
});
