/**
 * Subdomain Collector — Certificate Transparency enumeration via crt.name
 *
 * Queries https://crt.name/v1/search?apex=<domain> which returns a plain-text
 * list of hostnames observed in public CT logs. Only hostnames that genuinely
 * end with the apex domain are emitted (the API can include near-matches).
 *
 * Applies to DOMAIN, URL and ORGANIZATION seed categories.
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
import { safeFetch, readResponseWithLimit } from '../security/ssrf.js';
import { normalizeDomain } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024; // crt.name can return very large lists
const MAX_SUBDOMAINS = 1_000;

const HOSTNAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** Derive the apex domain from any supported seed value. */
export function deriveApexDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  if (!value) return null;
  try {
    if (value.includes('://')) {
      value = new URL(value).hostname;
    }
  } catch {
    return null;
  }
  // Strip ports/paths for bare-host inputs
  value = value.split('/')[0].split(':')[0].replace(/^www\./, '');
  const normalized = normalizeDomain(value);
  if (!normalized || !normalized.includes('.') || normalized.length > 253) return null;
  if (!HOSTNAME_REGEX.test(normalized)) return null;
  return normalized;
}

export function parseCrtResponse(body: string, apex: string): string[] {
  const results = new Set<string>();
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim().toLowerCase();
    if (!line || !line.endsWith('.' + apex) && line !== apex) continue;
    if (!HOSTNAME_REGEX.test(line)) continue;
    // Wildcard entries from CT logs are not concrete hosts
    if (line.startsWith('*.')) continue;
    results.add(line);
    if (results.size >= MAX_SUBDOMAINS) break;
  }
  return [...results];
}

export const subdomainCrtCollector: Collector = {
  name: 'subdomain-crt',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'ORGANIZATION';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const apex = deriveApexDomain(input);
    if (!apex) {
      warnings.push(
        `Could not derive an apex domain from "${input}". The crt.name subdomain search requires a domain (e.g. target.com).`,
      );
      return { source: 'subdomain-crt', collectedAt, entities, relationships, evidence, warnings };
    }

    const apiUrl = `https://crt.name/v1/search?apex=${encodeURIComponent(apex)}`;

    logger.info('crt.name subdomain enumeration starting', { requestId: ctx.requestId, apex });

    let body: string;
    try {
      const response = await safeFetch(apiUrl, {
        method: 'GET',
        signal: AbortSignal.any([ctx.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS + 5_000)]),
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxRedirects: 3,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          Accept: 'text/plain',
          'User-Agent': 'NexusGraph-OSINT/1.0 (Subdomain Enumeration)',
        },
      });

      if (response.status !== 200) {
        warnings.push(`crt.name returned HTTP ${response.status} for ${apex}`);
        return { source: 'subdomain-crt', collectedAt, entities, relationships, evidence, warnings };
      }

      body = await readResponseWithLimit(response, MAX_BODY_BYTES);
    } catch (error) {
      warnings.push(`crt.name request failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { source: 'subdomain-crt', collectedAt, entities, relationships, evidence, warnings };
    }

    const subdomains = parseCrtResponse(body, apex);

    for (const sub of subdomains) {
      entities.push({
        type: 'SUBDOMAIN',
        value: sub,
        title: sub,
        confidence: 85,
        metadata: {
          apex,
          discoveredVia: 'certificate-transparency',
          source: {
            url: apiUrl,
            collector: 'subdomain-crt',
            transform: 'domain.find-subdomains-crt',
            derivedFrom: apex,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: sub,
        source_type: 'SUBDOMAIN',
        target_value: apex,
        target_type: 'DOMAIN',
        relationship_type: 'RESOLVES_TO',
        confidence: 85,
        reason: `Hostname listed in public Certificate Transparency logs under the apex ${apex} (crt.name).`,
      });
    }

    evidence.push({
      source_url: apiUrl,
      source_type: 'SUBDOMAIN_ENUM',
      title: `CT subdomain enumeration for ${apex}`,
      extracted_value:
        subdomains.length > 0
          ? `${subdomains.length} unique subdomain(s): ${subdomains.slice(0, 25).join(', ')}${subdomains.length > 25 ? ', …' : ''}`
          : `No subdomains listed for ${apex}`,
      confidence: subdomains.length > 0 ? 85 : 40,
      metadata: {
        provider: 'crt.name',
        apex,
        totalFound: subdomains.length,
        truncatedAt: MAX_SUBDOMAINS,
        negativeResult: subdomains.length === 0,
      },
    });

    if (subdomains.length === 0) {
      warnings.push(`No subdomains found in CT logs for ${apex}`);
    }

    logger.info('crt.name subdomain enumeration completed', {
      requestId: ctx.requestId,
      apex,
      found: subdomains.length,
    });

    return { source: 'subdomain-crt', collectedAt, entities, relationships, evidence, warnings };
  },
};
