/**
 * Web Exposure & Policy Analyzer Collector
 *
 * Probes and extracts public policy, vulnerability disclosure, sitemap indices,
 * and crawler exposure paths from standard well-known endpoints:
 *  - /.well-known/security.txt (RFC 9116)
 *  - /sitemap.xml
 *  - /robots.txt
 *
 * Extracts security team contacts (emails), bug bounty policies, sitemaps,
 * and restricted/sensitive administrative paths.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain, normalizeEmail } from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 1024 * 1024; // 1MB

export interface SecurityTxtData {
  contacts: string[];
  encryption?: string[];
  acknowledgments?: string[];
  policies?: string[];
  canonical?: string[];
  rawText: string;
}

export function parseSecurityTxt(content: string): SecurityTxtData {
  const contacts: string[] = [];
  const encryption: string[] = [];
  const acknowledgments: string[] = [];
  const policies: string[] = [];
  const canonical: string[] = [];

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
    const val = trimmed.slice(colonIdx + 1).trim();
    if (!val) continue;

    if (key === 'contact') {
      contacts.push(val);
    } else if (key === 'encryption') {
      encryption.push(val);
    } else if (key === 'acknowledgments') {
      acknowledgments.push(val);
    } else if (key === 'policy') {
      policies.push(val);
    } else if (key === 'canonical') {
      canonical.push(val);
    }
  }

  return { contacts, encryption, acknowledgments, policies, canonical, rawText: content };
}

export function parseSitemapUrls(xmlContent: string, apexDomain: string): string[] {
  const urls: string[] = [];
  const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
  let match: RegExpExecArray | null;

  while ((match = locRegex.exec(xmlContent)) !== null) {
    const urlStr = match[1].trim();
    try {
      const u = new URL(urlStr);
      if (u.hostname.toLowerCase().endsWith(apexDomain) || u.hostname.toLowerCase() === apexDomain) {
        urls.push(urlStr);
      }
    } catch {
      // Ignore invalid URL
    }
    if (urls.length >= 80) break;
  }

  return urls;
}

export const webExposureCollector: Collector = {
  name: 'web-exposure',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetDomain: string;
    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'web-exposure', collectedAt, entities, relationships, evidence, warnings };
      }
      targetDomain = normalizeDomain(new URL(input).hostname);
    } else {
      targetDomain = normalizeDomain(input);
    }

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid domain: "${input}"`);
      return { source: 'web-exposure', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(25_000);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    // ── 1. Probe RFC 9116 security.txt ────────────────────────────────────
    try {
      const secUrls = [
        `https://${targetDomain}/.well-known/security.txt`,
        `https://${targetDomain}/security.txt`,
      ];

      let secResponse: Response | null = null;
      let usedSecUrl = '';

      for (const testUrl of secUrls) {
        try {
          const res = await safeFetch(testUrl, {
            method: 'GET',
            signal,
            requestId: ctx.requestId,
            timeoutMs: REQUEST_TIMEOUT_MS,
            maxResponseBytes: MAX_BODY_BYTES,
            headers: { 'User-Agent': 'NexusGraph-OSINT-SecurityScanner/1.0' },
          });

          if (res.status === 200) {
            secResponse = res;
            usedSecUrl = testUrl;
            break;
          }
        } catch {
          // Try next
        }
      }

      if (secResponse) {
        const secBody = await readResponseWithLimit(secResponse, MAX_BODY_BYTES);
        if (secBody.includes('Contact:') || secBody.includes('contact:')) {
          const secData = parseSecurityTxt(secBody);

          entities.push({
            type: 'DOCUMENT',
            value: usedSecUrl,
            title: `security.txt — ${targetDomain}`,
            confidence: 95,
            metadata: {
              docKind: 'SECURITY_TXT',
              contacts: secData.contacts,
              policies: secData.policies,
              encryption: secData.encryption,
              source: {
                url: usedSecUrl,
                collector: 'web-exposure',
                derivedFrom: targetDomain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: targetDomain,
            source_type: 'DOMAIN',
            target_value: usedSecUrl,
            target_type: 'DOCUMENT',
            relationship_type: 'LINKS_TO',
            confidence: 95,
            reason: 'Kebijakan pengungkapan kerentanan dan kontak sekuriti dipublikasikan di security.txt',
          });

          evidence.push({
            source_url: usedSecUrl,
            source_type: 'SECURITY_TXT',
            title: `security.txt Policy for ${targetDomain}`,
            extracted_value: `Kontak: ${secData.contacts.join(', ') || 'N/A'} | Kebijakan: ${(secData.policies || []).join(', ') || 'N/A'}`,
            confidence: 95,
            metadata: {
              contacts: secData.contacts,
              acknowledgments: secData.acknowledgments,
            },
          });

          // Extract direct emails from security contacts
          for (const rawContact of secData.contacts) {
            const emailMatch = /mailto:([^\s<>]+)/i.exec(rawContact) || /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i.exec(rawContact);
            if (emailMatch) {
              const emailVal = normalizeEmail(emailMatch[1]);
              entities.push({
                type: 'EMAIL',
                value: emailVal,
                title: `Tim Sekuriti (${emailVal})`,
                confidence: 90,
                metadata: {
                  role: 'SECURITY_TEAM',
                  discoveredVia: 'security.txt',
                  source: {
                    collector: 'web-exposure',
                    derivedFrom: targetDomain,
                    collectedAt,
                  },
                },
              });

              relationships.push({
                source_value: targetDomain,
                source_type: 'DOMAIN',
                target_value: emailVal,
                target_type: 'EMAIL',
                relationship_type: 'USES_EMAIL',
                confidence: 90,
                reason: 'Alamat email tim sekuriti resmi dipublikasikan di file security.txt domain',
              });
            }
          }
        }
      }
    } catch (secErr: any) {
      warnings.push(`security.txt probe error: ${secErr.message || String(secErr)}`);
    }

    // ── 2. Probe sitemap.xml ──────────────────────────────────────────────
    try {
      const sitemapUrl = `https://${targetDomain}/sitemap.xml`;
      const sitemapRes = await safeFetch(sitemapUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { 'User-Agent': 'NexusGraph-OSINT-SitemapScanner/1.0' },
      });

      if (sitemapRes.status === 200) {
        const sitemapBody = await readResponseWithLimit(sitemapRes, MAX_BODY_BYTES);
        const discoveredUrls = parseSitemapUrls(sitemapBody, targetDomain);

        if (discoveredUrls.length > 0) {
          evidence.push({
            source_url: sitemapUrl,
            source_type: 'SITEMAP_XML',
            title: `Sitemap Index for ${targetDomain}`,
            extracted_value: `Ditemukan ${discoveredUrls.length} rute halaman dari sitemap.xml publik`,
            confidence: 90,
            metadata: {
              urlCount: discoveredUrls.length,
              sample: discoveredUrls.slice(0, 10),
            },
          });

          // Prioritize high-value administrative/portal paths
          const highValueUrls = discoveredUrls.filter((u) => {
            const lower = u.toLowerCase();
            return (
              lower.includes('admin') ||
              lower.includes('api') ||
              lower.includes('login') ||
              lower.includes('auth') ||
              lower.includes('portal') ||
              lower.includes('dashboard') ||
              lower.includes('docs')
            );
          });

          const emitUrls = (highValueUrls.length > 0 ? highValueUrls : discoveredUrls).slice(0, 20);

          for (const pageUrl of emitUrls) {
            let label = pageUrl;
            try {
              const u = new URL(pageUrl);
              label = `${u.hostname}${u.pathname}`;
            } catch {
              // Ignore
            }

            entities.push({
              type: 'URL',
              value: pageUrl,
              title: label,
              confidence: 85,
              metadata: {
                sourceType: 'SITEMAP_ENTRY',
                source: {
                  collector: 'web-exposure',
                  derivedFrom: targetDomain,
                  collectedAt,
                },
              },
            });

            relationships.push({
              source_value: targetDomain,
              source_type: 'DOMAIN',
              target_value: pageUrl,
              target_type: 'URL',
              relationship_type: 'LINKS_TO',
              confidence: 85,
              reason: 'Halaman terdaftar dalam sitemap.xml resmi website',
            });
          }
        }
      }
    } catch (sitemapErr: any) {
      warnings.push(`sitemap.xml probe error: ${sitemapErr.message || String(sitemapErr)}`);
    }

    return {
      source: 'web-exposure',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
