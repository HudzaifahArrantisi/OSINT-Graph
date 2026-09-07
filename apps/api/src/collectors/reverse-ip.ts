/**
 * Reverse IP & Virtual Host Neighbors Collector
 *
 * Discovers neighboring domains, co-hosted applications, and virtual hosts
 * sharing the same physical or cloud server IP address using public reverse IP registries.
 *
 * Supports input types: DOMAIN, URL, IP_ADDRESS.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
  EntityType,
} from '@nexusgraph/shared';
import { normalizeDomain, normalizeIpAddress } from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';
import dns from 'node:dns/promises';

const HACKERTARGET_REVERSE_IP = 'https://api.hackertarget.com/reverseiplookup/?q=';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SIBLING_DOMAINS = 30;

export function parseReverseIpResponse(text: string, originalDomain?: string): string[] {
  const lines = text.split(/\r?\n/);
  const domains = new Set<string>();

  for (const rawLine of lines) {
    const line = rawLine.trim().toLowerCase();
    // Filter error strings from API
    if (
      !line ||
      line.includes('error') ||
      line.includes('no records') ||
      line.includes('api count exceeded') ||
      line.includes('input invalid') ||
      line.includes('<')
    ) {
      continue;
    }

    const cleaned = normalizeDomain(line);
    if (!cleaned || !cleaned.includes('.') || cleaned === originalDomain) {
      continue;
    }

    domains.add(cleaned);
    if (domains.size >= MAX_SIBLING_DOMAINS) break;
  }

  return Array.from(domains);
}

export const reverseIpCollector: Collector = {
  name: 'reverse-ip',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'IP_ADDRESS';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetHostOrIp = input.trim();
    let queryValue = targetHostOrIp;
    let resolvedIp: string | null = null;
    let inputDomain: string | null = null;

    if (targetHostOrIp.includes('://')) {
      const validation = validateUrl(targetHostOrIp);
      if (!validation.safe) {
        warnings.push(`URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'reverse-ip', collectedAt, entities, relationships, evidence, warnings };
      }
      inputDomain = normalizeDomain(new URL(targetHostOrIp).hostname);
      queryValue = inputDomain;
    } else if (/^[0-9a-f:.]+$/i.test(targetHostOrIp) && !targetHostOrIp.includes('..')) {
      // Looks like an IP address
      resolvedIp = normalizeIpAddress(targetHostOrIp);
      queryValue = resolvedIp;
    } else {
      inputDomain = normalizeDomain(targetHostOrIp);
      queryValue = inputDomain;
    }

    // If query value is a domain, resolve to IP first to provide rich graph context
    if (inputDomain && !resolvedIp) {
      try {
        const lookupRes = await dns.lookup(inputDomain, { family: 4 });
        if (lookupRes?.address) {
          resolvedIp = lookupRes.address;
        }
      } catch {
        // DNS lookup failed, we'll query API directly with domain
      }
    }

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    try {
      const apiUrl = `${HACKERTARGET_REVERSE_IP}${encodeURIComponent(queryValue)}`;
      const response = await safeFetch(apiUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { 'User-Agent': 'NexusGraph-OSINT-ReverseIP/1.0' },
      });

      if (response.status === 200) {
        const bodyText = await readResponseWithLimit(response, MAX_BODY_BYTES);
        const siblings = parseReverseIpResponse(bodyText, inputDomain || undefined);

        if (siblings.length > 0) {
          evidence.push({
            source_url: apiUrl,
            source_type: 'REVERSE_IP_LOOKUP',
            title: `Reverse IP Discovery (${queryValue})`,
            extracted_value: `Ditemukan ${siblings.length} domain lain yang di-hosting pada server/IP yang sama`,
            confidence: 85,
            metadata: {
              target: queryValue,
              resolvedIp,
              siblingsCount: siblings.length,
              sample: siblings.slice(0, 10),
            },
          });

          // Add IP entity if resolved
          if (resolvedIp) {
            entities.push({
              type: 'IP_ADDRESS',
              value: resolvedIp,
              title: resolvedIp,
              confidence: 90,
              metadata: {
                role: 'SHARED_HOSTING_SERVER',
                source: {
                  collector: 'reverse-ip',
                  derivedFrom: input,
                  collectedAt,
                },
              },
            });

            if (inputDomain) {
              relationships.push({
                source_value: inputDomain,
                source_type: 'DOMAIN',
                target_value: resolvedIp,
                target_type: 'IP_ADDRESS',
                relationship_type: 'RESOLVES_TO',
                confidence: 90,
                reason: 'Domain target me-resolve ke alamat IP server ini',
              });
            }
          }

          // Emit sibling domains
          const primarySourceVal = inputDomain || resolvedIp || input;
          const primarySourceType: EntityType = inputDomain ? 'DOMAIN' : resolvedIp ? 'IP_ADDRESS' : 'DOMAIN';

          for (const sibling of siblings) {
            entities.push({
              type: 'DOMAIN',
              value: sibling,
              title: `Co-Hosted: ${sibling}`,
              confidence: 80,
              metadata: {
                coHostedOn: resolvedIp || queryValue,
                source: {
                  collector: 'reverse-ip',
                  derivedFrom: input,
                  collectedAt,
                },
              },
            });

            relationships.push({
              source_value: primarySourceVal,
              source_type: primarySourceType,
              target_value: sibling,
              target_type: 'DOMAIN',
              relationship_type: 'RELATED_TO',
              confidence: 80,
              reason: `Domain bertetangga (co-hosted) berbagi infrastruktur server yang sama (${resolvedIp || queryValue})`,
            });
          }
        } else {
          evidence.push({
            source_url: apiUrl,
            source_type: 'REVERSE_IP_LOOKUP',
            title: `Reverse IP Discovery (${queryValue})`,
            extracted_value: 'Tidak ditemukan domain tetangga co-hosted (dedicated server atau private CDN).',
            confidence: 50,
            metadata: { negativeResult: true },
          });
        }
      }
    } catch (err: any) {
      warnings.push(`Reverse IP lookup failed: ${err.message || String(err)}`);
      logger.warn('Reverse IP error', { requestId: ctx.requestId, error: err.message });
    }

    return {
      source: 'reverse-ip',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
