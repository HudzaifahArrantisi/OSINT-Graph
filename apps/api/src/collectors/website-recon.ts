/**
 * Website Recon Collector (Mr.Holmes integration)
 *
 * Ported from Mr.Holmes (Lucksi/Mr.Holmes, GPL-3.0) Websites module:
 *  - robots.txt fetch and Disallow rule extraction
 *  - IP geolocation of the resolved host (ip-api.com, non-commercial field-limited)
 *  - Reputation-check reference URLs (ScamAdviser, SSLTrust, IsLegitSite)
 *
 * All outbound requests go through the SSRF guard.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { normalizeDomain } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 256 * 1024;

interface IpApiGeo {
  status?: string;
  query?: string;
  country?: string;
  countryCode?: string;
  regionName?: string;
  city?: string;
  isp?: string;
  lat?: number;
  lon?: number;
}

function parseRobotsDisallowRules(body: string): string[] {
  const rules: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.replace(/#.*$/, '').trim();
    const match = /^disallow:\s*(\S*)$/i.exec(trimmed);
    if (match) rules.push(match[1]);
  }
  return [...new Set(rules)].slice(0, 100);
}

export const websiteReconCollector: Collector = {
  name: 'website-recon',

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
        return { source: 'mrholmes-website-recon', collectedAt, entities, relationships, evidence, warnings };
      }
      domain = normalizeDomain(new URL(input).hostname);
    } else {
      domain = normalizeDomain(input);
    }

    if (!domain || !domain.includes('.')) {
      warnings.push(`Invalid domain: "${input}".`);
      return { source: 'mrholmes-website-recon', collectedAt, entities, relationships, evidence, warnings };
    }

    const timeoutSignal = AbortSignal.timeout(20_000);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    logger.info('Mr.Holmes website recon started', { requestId: ctx.requestId, domain });

    // ── 1. robots.txt (Mr.Holmes Scanner/Robots) ─────────────────────
    try {
      const robotsUrl = `https://${domain}/robots.txt`;
      const response = await safeFetch(robotsUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { 'User-Agent': 'NexusGraph-OSINT/1.0 (Website Recon)' },
      });

      if (response.status === 200) {
        const body = await readResponseWithLimit(response, MAX_BODY_BYTES);
        const disallowRules = parseRobotsDisallowRules(body);

        entities.push({
          type: 'DOCUMENT',
          value: robotsUrl,
          title: `robots.txt — ${domain}`,
          confidence: 95,
          metadata: {
            docKind: 'ROBOTS_TXT',
            disallowRuleCount: disallowRules.length,
            disallowRules: disallowRules.slice(0, 50),
            source: {
              url: robotsUrl,
              collector: 'website-recon',
              transform: 'mrholmes.robots-fetch',
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
          reason: `robots.txt published at the domain root reveals crawler-restricted paths.`,
        });

        evidence.push({
          source_url: robotsUrl,
          source_type: 'ROBOTS_TXT',
          title: `robots.txt for ${domain}`,
          extracted_value:
            disallowRules.length > 0 ? `Disallow rules: ${disallowRules.slice(0, 20).join(', ')}` : 'robots.txt present, no Disallow rules',
          confidence: 95,
          metadata: { disallowRuleCount: disallowRules.length },
        });
      } else {
        evidence.push({
          source_url: `https://${domain}/robots.txt`,
          source_type: 'ROBOTS_TXT',
          title: `robots.txt for ${domain}`,
          extracted_value: `No robots.txt served (HTTP ${response.status})`,
          confidence: 40,
          metadata: { statusCode: response.status, negativeResult: true },
        });
      }
    } catch (error) {
      warnings.push(`robots.txt fetch failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // ── 2. IP geolocation via ip-api.com (Mr.Holmes Map module) ──────
    try {
      const geoUrl = `http://ip-api.com/json/${encodeURIComponent(domain)}`;
      const response = await safeFetch(geoUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { Accept: 'application/json', 'User-Agent': 'NexusGraph-OSINT/1.0 (Website Recon)' },
      });

      if (response.status === 200) {
        const body = await readResponseWithLimit(response, MAX_BODY_BYTES);
        const geo = JSON.parse(body) as IpApiGeo;
        const resolvedIp = geo.query;

        if (geo.status === 'success' && resolvedIp && geo.countryCode) {
          entities.push({
            type: 'LOCATION',
            value: `${resolvedIp}:${geo.countryCode}`,
            title: `Hosting location — ${domain}`,
            confidence: 70,
            metadata: {
              precision: geo.city ? 'CITY' : 'COUNTRY',
              resolvedIp,
              countryName: geo.country,
              countryCode: geo.countryCode,
              regionName: geo.regionName,
              cityName: geo.city,
              isp: geo.isp,
              lat: geo.lat,
              lng: geo.lon,
              source: {
                url: geoUrl,
                collector: 'website-recon',
                transform: 'mrholmes.ip-geolocation',
                derivedFrom: domain,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: domain,
            source_type: 'DOMAIN',
            target_value: `${resolvedIp}:${geo.countryCode}`,
            target_type: 'LOCATION',
            relationship_type: 'HOSTED_ON',
            confidence: 70,
            reason: `DNS resolution + ip-api.com geolocates hosting infrastructure (${geo.city ?? geo.country}).`,
          });

          if (/^\d+\.\d+\.\d+\.\d+$/.test(resolvedIp)) {
            entities.push({
              type: 'IP_ADDRESS',
              value: resolvedIp,
              title: `Resolved IP — ${domain}`,
              confidence: 90,
              metadata: {
                source: {
                  url: geoUrl,
                  collector: 'website-recon',
                  transform: 'mrholmes.ip-geolocation',
                  derivedFrom: domain,
                  collectedAt,
                },
              },
            });
            relationships.push({
              source_value: domain,
              source_type: 'DOMAIN',
              target_value: resolvedIp,
              target_type: 'IP_ADDRESS',
              relationship_type: 'RESOLVES_TO',
              confidence: 90,
              reason: 'DNS A record resolution confirmed via ip-api.com query.',
            });
          }

          evidence.push({
            source_url: geoUrl,
            source_type: 'IP_GEOLOCATION',
            title: `IP geolocation for ${domain}`,
            extracted_value: `${resolvedIp} → ${geo.city ?? geo.regionName ?? ''} ${geo.country} (${geo.isp ?? 'unknown ISP'})`,
            confidence: 70,
            metadata: { provider: 'ip-api.com', ...geo },
          });
        } else {
          warnings.push(`ip-api.com could not geolocate ${domain}: ${geo.status ?? 'unknown status'}`);
        }
      } else {
        warnings.push(`ip-api.com returned HTTP ${response.status}`);
      }
    } catch (error) {
      warnings.push(`IP geolocation failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // ── 3. Reputation-check reference URLs (deterministic) ───────────
    const reputationReferences = [
      { name: 'ScamAdviser', url: `https://www.scamadviser.com/check-website/${domain}` },
      { name: 'SSLTrust', url: `https://www.ssltrust.com.au/ssl-tools/website-security-check?domain=${domain}` },
      { name: 'IsLegitSite', url: `https://www.islegitsite.com/check/${domain}` },
    ];

    for (const ref of reputationReferences) {
      evidence.push({
        source_url: ref.url,
        source_type: 'DORK_TEMPLATE',
        title: `Reputation lookup reference: ${ref.name}`,
        extracted_value: ref.url,
        confidence: 100,
        metadata: { provider: ref.name, deterministic: true, kind: 'MANUAL_LOOKUP_LINK' },
      });
    }

    return { source: 'mrholmes-website-recon', collectedAt, entities, relationships, evidence, warnings };
  },
};
