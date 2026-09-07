/**
 * Tracking ID & Analytics Pivoting Collector
 *
 * Scans target Domain / URL web pages for embedded third-party tracking,
 * advertising, and analytics tags (Google Analytics GA4/UA, GTM, Google AdSense,
 * Meta / Facebook Pixel, Microsoft Clarity, Hotjar, TikTok Pixel).
 *
 * Essential for OSINT investigations: tracking tags shared across different domains
 * reveal infrastructure, affiliate networks, and hidden sister sites operated
 * by the same actor or organization.
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
import { normalizeDomain } from '@nexusgraph/shared';
import { safeFetch, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB

interface TrackerMatch {
  trackerType: string;
  label: string;
  id: string;
  provider: string;
  pivotQuery: string;
}

/**
 * Extracts distinct analytics & marketing tracking IDs from HTML
 */
function extractTrackers(html: string): TrackerMatch[] {
  const matches: TrackerMatch[] = [];
  const seen = new Set<string>();

  const patterns: Array<{
    type: string;
    label: string;
    provider: string;
    regex: RegExp;
    formatId?: (raw: string) => string;
  }> = [
    {
      type: 'GOOGLE_ANALYTICS_GA4',
      label: 'Google Analytics 4',
      provider: 'Google',
      regex: /\b(G-[A-Z0-9]{8,12})\b/gi,
    },
    {
      type: 'GOOGLE_ANALYTICS_UA',
      label: 'Google Analytics Universal',
      provider: 'Google',
      regex: /\b(UA-\d{4,10}-\d{1,4})\b/gi,
    },
    {
      type: 'GOOGLE_TAG_MANAGER',
      label: 'Google Tag Manager',
      provider: 'Google',
      regex: /\b(GTM-[A-Z0-9]{5,10})\b/gi,
    },
    {
      type: 'GOOGLE_ADSENSE',
      label: 'Google AdSense Publisher',
      provider: 'Google',
      regex: /\b((?:ca-)?pub-\d{10,20})\b/gi,
      formatId: (raw) => (raw.startsWith('ca-') ? raw : `ca-${raw}`),
    },
    {
      type: 'META_PIXEL',
      label: 'Meta / Facebook Pixel',
      provider: 'Meta',
      regex: /(?:fbq\(\s*['"]init['"]\s*,\s*['"](\d{10,20})['"]|connect\.facebook\.net\/[^"']*?[?&]id=(\d{10,20}))/gi,
    },
    {
      type: 'MICROSOFT_CLARITY',
      label: 'Microsoft Clarity',
      provider: 'Microsoft',
      regex: /clarity\.ms\/tag\/([a-z0-9]{8,12})/gi,
    },
    {
      type: 'HOTJAR',
      label: 'Hotjar Analytics',
      provider: 'Hotjar',
      regex: /(?:hjid\s*[:=]\s*['"]?(\d{5,10})|static\.hotjar\.com\/c\/hotjar-(\d{5,10})\.js)/gi,
    },
    {
      type: 'TIKTOK_PIXEL',
      label: 'TikTok Pixel',
      provider: 'TikTok',
      regex: /ttq\.load\(\s*['"]([A-Z0-9]{15,25})['"]/gi,
    },
  ];

  for (const { type, label, provider, regex, formatId } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(html)) !== null) {
      const rawId = match[1] || match[2];
      if (!rawId) continue;
      const id = formatId ? formatId(rawId) : rawId.trim();
      const key = `${type}:${id}`;
      if (!seen.has(key)) {
        seen.add(key);
        matches.push({
          trackerType: type,
          label,
          id,
          provider,
          pivotQuery: `site:* "${id}"`,
        });
      }
    }
  }

  return matches;
}

export const trackingIdCollector: Collector = {
  name: 'tracking-id-extractor',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetUrl: string;
    let domain: string;

    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`Target URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'tracking-id-extractor', collectedAt, entities, relationships, evidence, warnings };
      }
      targetUrl = input;
      domain = normalizeDomain(new URL(input).hostname);
    } else {
      domain = normalizeDomain(input);
      targetUrl = `https://${domain}`;
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain for tracking ID extraction: "${input}"`);
      return { source: 'tracking-id-extractor', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    logger.info('Tracking ID & Analytics extraction started', { requestId: ctx.requestId, targetUrl, domain });

    try {
      const response = await safeFetch(targetUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          'User-Agent': 'NexusGraph-OSINT/1.0 (Analytics & Tracker Inspector; +https://nexusgraph.io)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      if (response.status >= 200 && response.status < 400) {
        const html = await response.text();
        const trackers = extractTrackers(html);

        if (trackers.length === 0) {
          evidence.push({
            source_url: targetUrl,
            source_type: 'HTTP_RESPONSE',
            title: `Tracker Inspection — ${domain}`,
            extracted_value: 'No third-party analytics or ad tracker tags observed in HTML.',
            confidence: 60,
            metadata: { domain, targetUrl, negativeResult: true },
          });
        }

        for (const tr of trackers) {
          const entityValue = `${tr.label}: ${tr.id}`;

          entities.push({
            type: 'TECHNOLOGY',
            value: entityValue,
            title: `${tr.label} (${tr.id})`,
            confidence: 95,
            metadata: {
              category: 'TRACKER',
              trackerType: tr.trackerType,
              trackingId: tr.id,
              provider: tr.provider,
              pivotQuery: tr.pivotQuery,
              source: {
                url: targetUrl,
                collector: 'tracking-id-extractor',
                transform: 'domain.tracking-ids',
                derivedFrom: domain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: domain,
            source_type: 'DOMAIN',
            target_value: entityValue,
            target_type: 'TECHNOLOGY',
            relationship_type: 'OBSERVED_ON',
            confidence: 95,
            reason: `Found active embedded ${tr.label} code (${tr.id}) in web HTML of ${domain}.`,
          });

          evidence.push({
            source_url: targetUrl,
            source_type: 'HTTP_RESPONSE',
            title: `Embedded Tracker: ${tr.label}`,
            extracted_value: `${tr.label} [${tr.id}] observed on ${targetUrl}`,
            confidence: 95,
            metadata: {
              trackerType: tr.trackerType,
              trackingId: tr.id,
              provider: tr.provider,
              domain,
            },
          });
        }
      } else {
        warnings.push(`Target returned HTTP ${response.status} when fetching HTML for tracker inspection`);
      }
    } catch (error) {
      warnings.push(`Tracking ID inspection failed: ${error instanceof Error ? error.message : 'network error'}`);
    }

    return { source: 'tracking-id-extractor', collectedAt, entities, relationships, evidence, warnings };
  },
};
