import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dnsSecurityAuditCollector } from '../collectors/dns-security-audit.js';
import { getCollector } from '../collectors/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { getTransform } from '../transforms/registry.js';

describe('Deep DNS Security & Email Spoofing Audit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should register dns-security-audit collector in registry', () => {
    const collector = getCollector('dns-security-audit');
    expect(collector).toBeDefined();
    expect(collector?.name).toBe('dns-security-audit');
  });

  it('should support DOMAIN, URL, and EMAIL input types', () => {
    expect(dnsSecurityAuditCollector.supports('DOMAIN')).toBe(true);
    expect(dnsSecurityAuditCollector.supports('URL')).toBe(true);
    expect(dnsSecurityAuditCollector.supports('EMAIL')).toBe(true);
    expect(dnsSecurityAuditCollector.supports('PHONE')).toBe(false);
  });

  it('should include dns-security-audit transform in discovery plan', () => {
    const domainPlan = buildDiscoveryPlan('DOMAIN', 'example.org');
    expect(domainPlan.transforms.map((t) => t.id)).toContain('domain.dns-security-audit');
  });

  it('should define correct metadata for domain.dns-security-audit transform', () => {
    const transform = getTransform('domain.dns-security-audit');
    expect(transform).toBeDefined();
    expect(transform?.name).toContain('DNS Security');
    expect(transform?.category).toBe('infrastructure');
  });

  it('should parse SPF, DMARC, and SaaS verification tokens correctly', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('_dmarc') && url.includes('type=TXT')) {
        return {
          ok: true,
          json: async () => ({
            Status: 0,
            Answer: [{ data: '"v=DMARC1; p=reject; rua=mailto:dmarc@reports.com"' }],
          }),
        };
      }
      if (url.includes('type=TXT')) {
        return {
          ok: true,
          json: async () => ({
            Status: 0,
            Answer: [
              { data: '"v=spf1 include:_spf.google.com -all"' },
              { data: '"google-site-verification=abc123xyz"' },
              { data: '"stripe-verification=stripe456token"' },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ Status: 0, Answer: [] }) };
    });

    const result = await dnsSecurityAuditCollector.run('corp-target.com', {
      caseId: 'test-case-123',
      requestId: 'test-req-123',
      signal: new AbortController().signal,
    });

    expect(result.entities.length).toBeGreaterThan(0);
    // Verified SaaS vendors surfaced as ORGANIZATION entities
    const orgs = result.entities.filter((e) => e.type === 'ORGANIZATION');
    expect(orgs.some((o) => o.value === 'Google')).toBe(true);
    expect(orgs.some((o) => o.value === 'Stripe')).toBe(true);

    // Audit evidence emitted
    const auditEvidence = result.evidence.find((e) => e.source_type === 'DNS_SECURITY_AUDIT');
    expect(auditEvidence).toBeDefined();
    expect((auditEvidence?.metadata as any)?.emailSecurityGrade).toBe('EXCELLENT');
    expect((auditEvidence?.metadata as any).spf.status).toBe('HARD_FAIL');
    expect((auditEvidence?.metadata as any).dmarc.policy).toBe('REJECT');
  });
});
