import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tlsCertificateCollector } from '../collectors/tls-certificate.js';
import { getCollector } from '../collectors/registry.js';

describe('TLS Certificate Collector & SAN Clustering Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should register tls-certificate collector in registry', () => {
    const collector = getCollector('tls-certificate');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('tls-certificate');
  });

  it('should support DOMAIN, URL, and EMAIL input types', () => {
    expect(tlsCertificateCollector.supports('DOMAIN')).toBe(true);
    expect(tlsCertificateCollector.supports('URL')).toBe(true);
    expect(tlsCertificateCollector.supports('EMAIL')).toBe(true);
    expect(tlsCertificateCollector.supports('PHONE')).toBe(false);
  });

  it('should audit certificate expiry and cluster SANs into subdomains and sibling corporate domains', async () => {
    const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const mockCerts = [
      {
        id: 12345678,
        issuer_ca_id: 1,
        issuer_name: "Let's Encrypt Authority X3",
        common_name: 'corp-brand.com',
        name_value: 'corp-brand.com\napi.corp-brand.com\ncorp-payment.net\nportal.corp-brand.com',
        not_before: pastDate,
        not_after: futureDate,
        serial_number: '1234567890abcdef',
      },
    ];

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => mockCerts,
    });

    const result = await tlsCertificateCollector.run('corp-brand.com', {
      caseId: 'test-case-123',
      requestId: 'test-req-123',
      signal: new AbortController().signal,
    });

    expect(result.entities.length).toBeGreaterThan(0);

    // Check certificate entity with expiry metadata
    const certEntity = result.entities.find((e) => e.type === 'CERTIFICATE');
    expect(certEntity).toBeDefined();
    expect((certEntity?.metadata as any).expiryStatus).toBe('VALID');
    expect((certEntity?.metadata as any).daysRemaining).toBeGreaterThan(0);

    // Check SAN entities
    const domainEntities = result.entities.filter((e) => e.type === 'DOMAIN');
    const siblingSan = domainEntities.find((e) => e.value === 'corp-payment.net');
    expect(siblingSan).toBeDefined();
    expect((siblingSan?.metadata as any).sanClusterType).toBe('SIBLING_DOMAIN');
    expect(siblingSan?.title).toContain('Sibling SAN');

    const subSan = domainEntities.find((e) => e.value === 'api.corp-brand.com');
    expect(subSan).toBeDefined();
    expect((subSan?.metadata as any).sanClusterType).toBe('SUBDOMAIN');

    // Evidence
    const summaryEv = result.evidence.find((e) => e.title?.includes('Audit Validitas SSL/TLS'));
    expect(summaryEv).toBeDefined();
    expect((summaryEv?.metadata as any).siblingDomainCount).toBe(1);
    expect((summaryEv?.metadata as any).subdomainCount).toBe(2);
  });
});
