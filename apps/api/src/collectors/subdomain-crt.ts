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
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_SUBDOMAINS = 300;
const DOH_URL = 'https://cloudflare-dns.com/dns-query';

const HOSTNAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export interface SubdomainProbeResult {
  subdomain: string;
  active: boolean;
  ips: string[];
  httpStatus?: number | null;
}

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
    if (!line || (!line.endsWith('.' + apex) && line !== apex)) continue;
    if (!HOSTNAME_REGEX.test(line)) continue;
    if (line.startsWith('*.')) continue;
    results.add(line);
    if (results.size >= MAX_SUBDOMAINS) break;
  }
  return [...results];
}

/** Fast DNS A / AAAA probe via Cloudflare DoH to check if subdomain is currently active */
async function probeSubdomainActive(
  subdomain: string,
  signal: AbortSignal,
): Promise<{ active: boolean; ips: string[] }> {
  try {
    const res = await fetch(`${DOH_URL}?name=${encodeURIComponent(subdomain)}&type=A`, {
      headers: { Accept: 'application/dns-json' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(3500)]),
    });
    if (!res.ok) return { active: false, ips: [] };
    const json = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    const ips = (json.Answer || [])
      .filter((ans) => ans.type === 1 || ans.type === 28)
      .map((ans) => ans.data);

    return {
      active: ips.length > 0,
      ips,
    };
  } catch {
    return { active: false, ips: [] };
  }
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

    const rawSubdomains = parseCrtResponse(body, apex);

    // Concurrently probe active status in batches
    const BATCH_SIZE = 15;
    const probeResults: SubdomainProbeResult[] = [];

    for (let i = 0; i < rawSubdomains.length; i += BATCH_SIZE) {
      const chunk = rawSubdomains.slice(i, i + BATCH_SIZE);
      const chunkProbes = await Promise.all(
        chunk.map(async (sub) => {
          const { active, ips } = await probeSubdomainActive(sub, ctx.signal);
          return {
            subdomain: sub,
            active,
            ips,
          };
        }),
      );
      probeResults.push(...chunkProbes);
    }

    const activeList = probeResults.filter((p) => p.active);
    const inactiveList = probeResults.filter((p) => !p.active);

    // Aggregate all subdomain items into ONE single dedicated node
    const summaryTitle = `Subdomains (${activeList.length} Active / ${probeResults.length} Total)`;

    entities.push({
      type: 'SUBDOMAIN',
      value: `Subdomains of ${apex}`,
      title: summaryTitle,
      confidence: 90,
      metadata: {
        apex,
        isSubdomainAggregate: true,
        totalFound: probeResults.length,
        activeCount: activeList.length,
        inactiveCount: inactiveList.length,
        activeSubdomains: activeList,
        inactiveSubdomains: inactiveList,
        allSubdomains: probeResults,
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
      source_value: `Subdomains of ${apex}`,
      source_type: 'SUBDOMAIN',
      target_value: apex,
      target_type: 'DOMAIN',
      relationship_type: 'RESOLVES_TO',
      confidence: 90,
      reason: `Aggregated list of ${probeResults.length} subdomains (${activeList.length} currently active) discovered from public Certificate Transparency logs for ${apex}.`,
    });

    evidence.push({
      source_url: apiUrl,
      source_type: 'SUBDOMAIN_ENUM',
      title: `CT subdomain discovery for ${apex}`,
      extracted_value: `${activeList.length} active and ${inactiveList.length} inactive subdomain(s) enumerated under ${apex}.`,
      confidence: 90,
      metadata: {
        provider: 'crt.name',
        apex,
        totalFound: probeResults.length,
        activeCount: activeList.length,
        inactiveCount: inactiveList.length,
      },
    });

    if (probeResults.length === 0) {
      warnings.push(`No subdomains found in CT logs for ${apex}`);
    }

    logger.info('crt.name subdomain enumeration completed', {
      requestId: ctx.requestId,
      apex,
      total: probeResults.length,
      active: activeList.length,
    });

    return { source: 'subdomain-crt', collectedAt, entities, relationships, evidence, warnings };
  },
};

