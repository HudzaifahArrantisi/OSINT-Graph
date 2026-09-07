/**
 * Deep Site Architecture Crawler (robots.txt, sitemap.xml, & security.txt)
 *
 * Implements authoritative site inspection:
 *  1. robots.txt — parses Disallow rules; extracts sensitive/hidden directories as URL entities
 *  2. sitemap.xml — extracts indexed page architecture count and primary site structure
 *  3. /.well-known/security.txt (RFC 9116) — extracts official vulnerability disclosure contacts
 *     (security emails, PGP encryption keys, bug bounty policy)
 *
 * All outbound requests strictly adhere to the NexusGraph SSRF guard.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain, normalizeEmail, normalizeUrl } from '@nexusgraph/shared';
import { safeFetch, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 256 * 1024; // 256 KB

const SENSITIVE_PATH_KEYWORDS = [
  'admin',
  'login',
  'portal',
  'backup',
  'staging',
  'internal',
  'secret',
  'private',
  'api',
  'config',
  'debug',
  'db',
  'sql',
  'test',
  'dev',
  'wp-admin',
  'wp-includes',
  'auth',
  'root',
  'user',
  'member',
];

export const siteCrawlerCollector: Collector = {
  name: 'site-crawler',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let domain: string;
    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'site-crawler', collectedAt, entities, relationships, evidence, warnings };
      }
      domain = normalizeDomain(new URL(input).hostname);
    } else {
      domain = normalizeDomain(input);
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain for site crawler: "${input}"`);
      return { source: 'site-crawler', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(18_000);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    logger.info('Site architecture crawler started', { requestId: ctx.requestId, domain });

    let declaredSitemapUrl: string | null = null;

    // ── 1. robots.txt Deep Inspection ────────────────────────────────
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const response = await safeFetch(robotsUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { 'User-Agent': 'NexusGraph-OSINT/1.0 (Site Crawler; +https://nexusgraph.io)' },
      });

      if (response.status === 200) {
        const body = await response.text();
        const disallowRules: string[] = [];
        const sensitivePaths: string[] = [];

        for (const line of body.split(/\r?\n/)) {
          const trimmed = line.replace(/#.*$/, '').trim();
          const disallowMatch = /^disallow:\s*(\S*)$/i.exec(trimmed);
          if (disallowMatch && disallowMatch[1] && disallowMatch[1] !== '/') {
            const path = disallowMatch[1];
            disallowRules.push(path);
            const lower = path.toLowerCase();
            if (SENSITIVE_PATH_KEYWORDS.some((kw) => lower.includes(kw))) {
              sensitivePaths.push(path);
            }
          }
          const sitemapMatch = /^sitemap:\s*(\S+)$/i.exec(trimmed);
          if (sitemapMatch && !declaredSitemapUrl) {
            declaredSitemapUrl = sitemapMatch[1];
          }
        }

        const uniqueDisallows = [...new Set(disallowRules)];
        const uniqueSensitives = [...new Set(sensitivePaths)];

        // Document entity for robots.txt
        entities.push({
          type: 'DOCUMENT',
          value: robotsUrl,
          title: `robots.txt — ${domain}`,
          confidence: 95,
          metadata: {
            docKind: 'ROBOTS_TXT',
            disallowCount: uniqueDisallows.length,
            sensitiveCount: uniqueSensitives.length,
            disallowRules: uniqueDisallows.slice(0, 50),
            sensitivePaths: uniqueSensitives.slice(0, 30),
            declaredSitemap: declaredSitemapUrl,
            source: {
              url: robotsUrl,
              collector: 'site-crawler',
              transform: 'domain.site-crawler',
              derivedFrom: domain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: domain,
          source_type: 'DOMAIN',
          target_value: robotsUrl,
          target_type: 'DOCUMENT',
          relationship_type: 'LINKS_TO',
          confidence: 95,
          reason: `robots.txt crawler rules index published by ${domain}.`,
        });

        evidence.push({
          source_url: robotsUrl,
          source_type: 'ROBOTS_TXT',
          title: `robots.txt — ${domain}`,
          extracted_value: `${uniqueDisallows.length} disallow rules (${uniqueSensitives.length} sensitive/restricted)`,
          confidence: 95,
          metadata: { disallowCount: uniqueDisallows.length, sensitivePaths: uniqueSensitives.slice(0, 15) },
        });

        // Emit high-value sensitive URLs discovered in robots.txt (up to 8)
        for (const sensPath of uniqueSensitives.slice(0, 8)) {
          const fullSensUrl = normalizeUrl(`https://${domain}${sensPath.startsWith('/') ? '' : '/'}${sensPath}`);
          entities.push({
            type: 'URL',
            value: fullSensUrl,
            title: `Restricted Path: ${sensPath}`,
            confidence: 85,
            metadata: {
              path: sensPath,
              isDisallowed: true,
              isSensitive: true,
              sourceKind: 'ROBOTS_DISALLOW',
              source: {
                url: robotsUrl,
                collector: 'site-crawler',
                transform: 'domain.site-crawler',
                derivedFrom: domain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: domain,
            source_type: 'DOMAIN',
            target_value: fullSensUrl,
            target_type: 'URL',
            relationship_type: 'LINKS_TO',
            confidence: 85,
            reason: `Declared crawler-forbidden path in robots.txt (${sensPath}).`,
          });
        }
      }
    } catch (error) {
      warnings.push(`robots.txt fetch failed: ${error instanceof Error ? error.message : 'network error'}`);
    }

    // ── 2. sitemap.xml Architectural Inspection ──────────────────────
    try {
      const sitemapTarget = declaredSitemapUrl || `https://${domain}/sitemap.xml`;
      const response = await safeFetch(sitemapTarget, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { 'User-Agent': 'NexusGraph-OSINT/1.0 (Site Crawler; +https://nexusgraph.io)' },
      });

      if (response.status === 200) {
        const body = await response.text();
        const locMatches: string[] = [];
        const locRegex = /<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi;
        let match: RegExpExecArray | null;
        while ((match = locRegex.exec(body)) !== null) {
          locMatches.push(match[1].trim());
          if (locMatches.length >= 200) break;
        }

        const isNestedIndex = body.includes('<sitemapindex');
        const pageCount = locMatches.length;

        entities.push({
          type: 'DOCUMENT',
          value: sitemapTarget,
          title: `sitemap.xml — ${domain}`,
          confidence: 90,
          metadata: {
            docKind: 'SITEMAP_XML',
            isIndex: isNestedIndex,
            pageCount,
            sampleUrls: locMatches.slice(0, 10),
            source: {
              url: sitemapTarget,
              collector: 'site-crawler',
              transform: 'domain.site-crawler',
              derivedFrom: domain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: domain,
          source_type: 'DOMAIN',
          target_value: sitemapTarget,
          target_type: 'DOCUMENT',
          relationship_type: 'LINKS_TO',
          confidence: 90,
          reason: `Published sitemap architecture mapping ${pageCount}+ indexed pages.`,
        });

        evidence.push({
          source_url: sitemapTarget,
          source_type: 'SITEMAP_XML',
          title: `sitemap.xml (${domain})`,
          extracted_value: `${pageCount} indexed pages discovered in sitemap (${isNestedIndex ? 'nested sitemap index' : 'standard urlset'})`,
          confidence: 90,
          metadata: { pageCount, isIndex: isNestedIndex },
        });
      }
    } catch {
      // Sitemaps are optional, suppress noisy warnings
    }

    // ── 3. RFC 9116 security.txt Official Security Contacts ──────────
    try {
      const secUrls = [
        `https://${domain}/.well-known/security.txt`,
        `https://${domain}/security.txt`,
      ];

      for (const secUrl of secUrls) {
        const response = await safeFetch(secUrl, {
          method: 'GET',
          signal,
          requestId: ctx.requestId,
          timeoutMs: 8000,
          maxResponseBytes: MAX_BODY_BYTES,
          headers: { 'User-Agent': 'NexusGraph-OSINT/1.0 (Site Crawler; +https://nexusgraph.io)' },
        });

        if (response.status === 200) {
          const body = await response.text();
          const contacts: string[] = [];
          const policies: string[] = [];
          const encryptions: string[] = [];

          for (const line of body.split(/\r?\n/)) {
            const trimmed = line.replace(/#.*$/, '').trim();
            const contactMatch = /^contact:\s*(\S+)$/i.exec(trimmed);
            if (contactMatch) contacts.push(contactMatch[1]);
            const policyMatch = /^policy:\s*(\S+)$/i.exec(trimmed);
            if (policyMatch) policies.push(policyMatch[1]);
            const encMatch = /^encryption:\s*(\S+)$/i.exec(trimmed);
            if (encMatch) encryptions.push(encMatch[1]);
          }

          entities.push({
            type: 'DOCUMENT',
            value: secUrl,
            title: `security.txt — ${domain}`,
            confidence: 95,
            metadata: {
              docKind: 'SECURITY_TXT',
              contacts,
              policies,
              encryptions,
              source: {
                url: secUrl,
                collector: 'site-crawler',
                transform: 'domain.site-crawler',
                derivedFrom: domain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: domain,
            source_type: 'DOMAIN',
            target_value: secUrl,
            target_type: 'DOCUMENT',
            relationship_type: 'LINKS_TO',
            confidence: 95,
            reason: `RFC 9116 security vulnerability disclosure policy published by ${domain}.`,
          });

          evidence.push({
            source_url: secUrl,
            source_type: 'SECURITY_TXT',
            title: `security.txt — ${domain}`,
            extracted_value: `Official contacts: ${contacts.join(', ') || 'none'}`,
            confidence: 95,
            metadata: { contacts, policies, encryptions },
          });

          // Extract verified security contact emails
          for (const contact of contacts) {
            let emailValue = '';
            if (contact.startsWith('mailto:')) {
              emailValue = contact.replace('mailto:', '').split('?')[0].trim();
            } else if (contact.includes('@') && !contact.includes('/')) {
              emailValue = contact.trim();
            }

            if (emailValue && emailValue.includes('@')) {
              const normEmail = normalizeEmail(emailValue);
              entities.push({
                type: 'EMAIL',
                value: normEmail,
                title: `Security Contact: ${normEmail}`,
                confidence: 95,
                metadata: {
                  isOfficialSecurityContact: true,
                  source: {
                    url: secUrl,
                    collector: 'site-crawler',
                    transform: 'domain.site-crawler',
                    derivedFrom: domain,
                    collectedAt,
                  },
                },
              });

              relationships.push({
                source_value: domain,
                source_type: 'DOMAIN',
                target_value: normEmail,
                target_type: 'EMAIL',
                relationship_type: 'HAS_PUBLIC_EMAIL',
                confidence: 95,
                reason: `Official security contact email listed in RFC 9116 security.txt of ${domain}.`,
              });
            }
          }
          break; // Found security.txt, no need to check fallback URL
        }
      }
    } catch {
      // security.txt optional
    }

    return { source: 'site-crawler', collectedAt, entities, relationships, evidence, warnings };
  },
};
