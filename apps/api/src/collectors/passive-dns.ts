/**
 * Passive DNS & Historical IP Resolution Collector
 *
 * Unmasks origin IP addresses and past infrastructure records for a domain:
 * 1. HackerTarget HostSearch API (free/public)
 * 2. AlienVault OTX Passive DNS (public indicators endpoint)
 *
 * Correlates historical resolutions to detect origin servers before CDN / WAF deployment.
 * Filters private, reserved, and loopback IP ranges.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain, normalizeIpAddress } from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const PROBE_TIMEOUT_MS = 6_000;
const MAX_BODY_BYTES = 512 * 1024; // 512 KB

export interface PassiveDnsRecord {
  hostname: string;
  ip: string;
  firstSeen?: string;
  lastSeen?: string;
  source: string;
}

function isValidPublicIp(ip: string): boolean {
  // Basic IPv4 validation
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number);
    if (a > 255 || b > 255 || c > 255 || d > 255) return false;

    // Private / Reserved ranges
    if (a === 10) return false;
    if (a === 127) return false;
    if (a === 0) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224) return false; // Multicast / reserved
    return true;
  }

  // Basic IPv6 check (not loopback or link-local)
  if (ip.includes(':')) {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return false;
    }
    return true;
  }

  return false;
}

export function parseHackerTargetHostsearch(body: string, targetDomain: string): PassiveDnsRecord[] {
  const records: PassiveDnsRecord[] = [];
  if (!body || body.includes('error') || body.includes('No records') || body.includes('API count exceeded')) {
    return records;
  }

  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(',')) continue;

    const [hostnameRaw, ipRaw] = trimmed.split(',');
    const hostname = hostnameRaw?.trim().toLowerCase();
    const ip = ipRaw?.trim();

    if (hostname && ip && isValidPublicIp(ip)) {
      if (hostname === targetDomain || hostname.endsWith(`.${targetDomain}`)) {
        records.push({
          hostname,
          ip,
          source: 'hackertarget',
        });
      }
    }
  }

  return records;
}

export function parseAlienVaultOtxPassiveDns(jsonStr: string, targetDomain: string): PassiveDnsRecord[] {
  const records: PassiveDnsRecord[] = [];
  try {
    const data = JSON.parse(jsonStr);
    const pdnsList = data?.passive_dns;
    if (Array.isArray(pdnsList)) {
      for (const item of pdnsList) {
        const ip = item?.address?.trim();
        const hostname = (item?.hostname || targetDomain).trim().toLowerCase();
        if (ip && isValidPublicIp(ip)) {
          if (hostname === targetDomain || hostname.endsWith(`.${targetDomain}`)) {
            records.push({
              hostname,
              ip,
              firstSeen: item?.first,
              lastSeen: item?.last,
              source: 'alienvault_otx',
            });
          }
        }
      }
    }
  } catch {
    // Ignore JSON parse error
  }
  return records;
}

export const passiveDnsCollector: Collector = {
  name: 'passive-dns',

  supports(inputType: string): boolean {
    return inputType === 'DOMAIN' || inputType === 'URL' || inputType === 'WEBSITE';
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
        warnings.push(`Input URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'passive-dns', collectedAt, entities, relationships, evidence, warnings };
      }
      try {
        targetDomain = normalizeDomain(new URL(input).hostname);
      } catch {
        warnings.push(`Invalid URL format: "${input}"`);
        return { source: 'passive-dns', collectedAt, entities, relationships, evidence, warnings };
      }
    } else {
      targetDomain = normalizeDomain(input);
    }

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid domain for passive DNS: "${input}"`);
      return { source: 'passive-dns', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Passive DNS & Historical IP resolution started', {
      requestId: ctx.requestId,
      domain: targetDomain,
    });

    const allRecords: PassiveDnsRecord[] = [];
    const fetchOpts = {
      requestId: ctx.requestId,
      timeoutMs: PROBE_TIMEOUT_MS,
      maxResponseBytes: MAX_BODY_BYTES,
      headers: {
        'User-Agent': 'NexusGraph-OSINT/1.0',
        Accept: 'text/plain, application/json, */*',
      },
    };

    // ─── 1. Query HackerTarget HostSearch API ──────────────────────────
    try {
      const htUrl = `https://api.hackertarget.com/hostsearch/?q=${encodeURIComponent(targetDomain)}`;
      const res = await safeFetch(htUrl, fetchOpts);
      if (res.ok && res.status === 200) {
        const body = await readResponseWithLimit(res, MAX_BODY_BYTES);
        const htRecords = parseHackerTargetHostsearch(body, targetDomain);
        allRecords.push(...htRecords);
      }
    } catch (err: any) {
      logger.debug(`HackerTarget query failed: ${err?.message}`);
    }

    // ─── 2. Query AlienVault OTX Passive DNS ───────────────────────────
    try {
      const otxUrl = `https://otx.alienvault.com/api/v1/indicators/domain/${encodeURIComponent(targetDomain)}/passive_dns`;
      const res = await safeFetch(otxUrl, fetchOpts);
      if (res.ok && res.status === 200) {
        const body = await readResponseWithLimit(res, MAX_BODY_BYTES);
        const otxRecords = parseAlienVaultOtxPassiveDns(body, targetDomain);
        allRecords.push(...otxRecords);
      }
    } catch (err: any) {
      logger.debug(`AlienVault OTX query failed: ${err?.message}`);
    }

    // ─── 3. Deduplicate and Construct Graph Entities ───────────────────
    const seenIps = new Map<string, PassiveDnsRecord[]>();
    const seenSubdomains = new Set<string>();

    for (const rec of allRecords) {
      const normIp = normalizeIpAddress(rec.ip);
      if (!normIp) continue;

      if (!seenIps.has(normIp)) {
        seenIps.set(normIp, []);
      }
      seenIps.get(normIp)!.push(rec);

      if (rec.hostname && rec.hostname !== targetDomain && rec.hostname.endsWith(`.${targetDomain}`)) {
        seenSubdomains.add(rec.hostname);
      }
    }

    if (seenIps.size > 0) {
      evidence.push({
        source_url: `passivedns://${targetDomain}`,
        source_type: 'PASSIVE_DNS',
        title: `Historical Passive DNS Resolution (${targetDomain})`,
        extracted_value: `Ditemukan ${seenIps.size} alamat IP historis dan ${seenSubdomains.size} subdomain dari log pasif.`,
        confidence: 85,
        metadata: {
          uniqueIpsCount: seenIps.size,
          subdomainsCount: seenSubdomains.size,
          ips: Array.from(seenIps.keys()),
        },
      });

      // Emit IP entities and historical relationships
      for (const [ip, records] of Array.from(seenIps.entries()).slice(0, 30)) {
        const firstSeen = records.find((r) => r.firstSeen)?.firstSeen;
        const lastSeen = records.find((r) => r.lastSeen)?.lastSeen;

        entities.push({
          type: 'IP_ADDRESS',
          value: ip,
          title: `Historical IP: ${ip}`,
          confidence: 85,
          metadata: {
            is_historical: true,
            recordsCount: records.length,
            firstSeen,
            lastSeen,
            source: {
              collector: 'passive-dns',
              derivedFrom: targetDomain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: targetDomain,
          source_type: 'DOMAIN',
          target_value: ip,
          target_type: 'IP_ADDRESS',
          relationship_type: 'RESOLVED_HISTORICALLY',
          confidence: 85,
          reason: `Domain ${targetDomain} historically resolved to IP ${ip} (Passive DNS)`,
        });
      }

      // Emit historical subdomains
      for (const sub of Array.from(seenSubdomains).slice(0, 25)) {
        entities.push({
          type: 'SUBDOMAIN',
          value: sub,
          title: `Subdomain: ${sub}`,
          confidence: 80,
          metadata: {
            is_historical: true,
            source: {
              collector: 'passive-dns',
              derivedFrom: targetDomain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: targetDomain,
          source_type: 'DOMAIN',
          target_value: sub,
          target_type: 'SUBDOMAIN',
          relationship_type: 'HAS_DOMAIN',
          confidence: 80,
          reason: 'Subdomain discovered in historical passive DNS dataset',
        });
      }
    } else {
      warnings.push(`No historical passive DNS records discovered for ${targetDomain}`);
    }

    logger.info('Passive DNS collector completed', {
      requestId: ctx.requestId,
      domain: targetDomain,
      entityCount: entities.length,
      relationshipCount: relationships.length,
    });

    return {
      source: 'passive-dns',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
