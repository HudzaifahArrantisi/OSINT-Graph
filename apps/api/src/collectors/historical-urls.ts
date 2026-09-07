/**
 * Historical URLs & Archived Endpoints Collector
 *
 * Passively queries the Wayback Machine CDX API (Internet Archive)
 * to uncover historical REST endpoints, dynamic query parameters,
 * hidden administrative routes, and sensitive files.
 *
 * Completely passive (0 traffic directed at target infrastructure).
 * Protected by SSRF validation and response caps.
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
import { safeFetch, readResponseWithLimit, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const CDX_API_URL = 'https://web.archive.org/cdx/search/cdx';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_URLS_TO_PROCESS = 150;

// Filter out static media assets that add noise to the investigation graph
const STATIC_EXTENSION_REGEX = /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp|tiff|woff|woff2|ttf|eot|mp4|webm|m4v|mp3|wav|ogg|css|map)$/i;

export interface CdxRecord {
  url: string;
  timestamp?: string;
  mimetype?: string;
  statuscode?: string;
}

/**
 * Filter and extract valid, high-interest URLs from Wayback CDX API response
 */
export function parseCdxUrls(rawJsonText: string, apexDomain: string): string[] {
  let records: string[][];
  try {
    records = JSON.parse(rawJsonText);
  } catch {
    return [];
  }

  if (!Array.isArray(records) || records.length <= 1) {
    return [];
  }

  const results = new Set<string>();
  // CDX output with fl=original gives a 2D array: [["original"], ["url1"], ["url2"], ...]
  for (let i = 1; i < records.length; i++) {
    const row = records[i];
    const urlStr = Array.isArray(row) ? row[0] : typeof row === 'string' ? row : '';
    if (!urlStr || typeof urlStr !== 'string') continue;

    const trimmed = urlStr.trim();
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) continue;

    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      if (!host.endsWith(apexDomain) && host !== apexDomain) continue;

      // Filter noise & static extensions
      if (STATIC_EXTENSION_REGEX.test(u.pathname)) continue;

      // Clean default port
      if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) {
        u.port = '';
      }

      results.add(u.toString());
      if (results.size >= MAX_URLS_TO_PROCESS) break;
    } catch {
      continue;
    }
  }

  return Array.from(results);
}

export const historicalUrlsCollector: Collector = {
  name: 'historical-urls',

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
        warnings.push(`Input URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'historical-urls', collectedAt, entities, relationships, evidence, warnings };
      }
      targetDomain = normalizeDomain(new URL(input).hostname);
    } else {
      targetDomain = normalizeDomain(input);
    }

    if (!targetDomain || !targetDomain.includes('.')) {
      warnings.push(`Invalid target domain: "${input}"`);
      return { source: 'historical-urls', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Wayback historical URL reconnaissance started', {
      requestId: ctx.requestId,
      domain: targetDomain,
    });

    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    try {
      // Query CDX API for matching URLs on target domain
      const cdxQuery = `${CDX_API_URL}?url=${encodeURIComponent(targetDomain)}/*&output=json&fl=original&collapse=urlkey&limit=150`;

      const response = await safeFetch(cdxQuery, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });

      if (response.status !== 200) {
        logger.info('Wayback CDX API returned non-200 status', { domain: targetDomain, status: response.status });
        evidence.push({
          source_url: cdxQuery,
          source_type: 'WAYBACK_ARCHIVE',
          title: `Wayback Machine Snapshot (${targetDomain})`,
          extracted_value: response.status === 429 || response.status === 503
            ? `Layanan arsip publik Wayback CDX sedang padat (HTTP ${response.status}). Arsip tidak dapat diakses saat ini.`
            : `Arsip publik Internet Archive tidak memiliki snapshot aktif untuk target ini (HTTP ${response.status}).`,
          confidence: 65,
          metadata: { status: response.status, domain: targetDomain },
        });
        return { source: 'historical-urls', collectedAt, entities, relationships, evidence, warnings };
      }

      const bodyText = await readResponseWithLimit(response, MAX_BODY_BYTES);
      const discoveredUrls = parseCdxUrls(bodyText, targetDomain);

      if (discoveredUrls.length === 0) {
        evidence.push({
          source_url: cdxQuery,
          source_type: 'WAYBACK_ARCHIVE',
          title: `Wayback Machine Snapshot (${targetDomain})`,
          extracted_value: 'Tidak ada URL historis yang terindeks dalam arsip publik untuk domain ini.',
          confidence: 70,
          metadata: { totalFound: 0, domain: targetDomain },
        });
        return { source: 'historical-urls', collectedAt, entities, relationships, evidence, warnings };
      }

      // 1. Evidence Summary
      evidence.push({
        source_url: cdxQuery,
        source_type: 'WAYBACK_ARCHIVE',
        title: `Wayback Machine Archive (${targetDomain})`,
        extracted_value: `Ditemukan ${discoveredUrls.length} endpoint & URL historis dari arsip publik Internet Archive.`,
        confidence: 85,
        metadata: {
          totalDiscovered: discoveredUrls.length,
          sampleUrls: discoveredUrls.slice(0, 20),
        },
      });

      // 2. Extract unique subdomains from historical URLs
      const subdomains = new Set<string>();
      for (const urlStr of discoveredUrls) {
        try {
          const u = new URL(urlStr);
          if (u.hostname && u.hostname !== targetDomain && u.hostname.endsWith(`.${targetDomain}`)) {
            subdomains.add(u.hostname.toLowerCase());
          }
        } catch {
          // Ignore parse errors
        }
      }

      for (const sub of Array.from(subdomains).slice(0, 25)) {
        entities.push({
          type: 'SUBDOMAIN',
          value: sub,
          title: sub,
          confidence: 80,
          metadata: {
            source: {
              collector: 'historical-urls',
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
          reason: 'Subdomain ditemukan dari jejak URL historis di Internet Archive',
        });
      }

      // 3. Emit top in-scope URLs (prioritize URLs with query params or API-like paths)
      const rankedUrls = [...discoveredUrls].sort((a, b) => {
        const aHasParam = a.includes('?') ? 1 : 0;
        const bHasParam = b.includes('?') ? 1 : 0;
        const aIsApi = a.includes('/api/') || a.includes('/v1/') || a.includes('/v2/') ? 1 : 0;
        const bIsApi = b.includes('/api/') || b.includes('/v1/') || b.includes('/v2/') ? 1 : 0;
        return (bHasParam + bIsApi) - (aHasParam + aIsApi);
      });

      const topUrls = rankedUrls.slice(0, 35);
      for (const urlStr of topUrls) {
        let displayLabel = urlStr;
        try {
          const u = new URL(urlStr);
          displayLabel = `${u.hostname}${u.pathname}${u.search}`;
        } catch {
          // Use full urlStr
        }

        entities.push({
          type: 'URL',
          value: urlStr,
          title: displayLabel,
          confidence: 80,
          metadata: {
            historical: true,
            archiveSource: 'Wayback Machine',
            source: {
              collector: 'historical-urls',
              derivedFrom: targetDomain,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: targetDomain,
          source_type: 'DOMAIN',
          target_value: urlStr,
          target_type: 'URL',
          relationship_type: 'LINKS_TO',
          confidence: 80,
          reason: 'Endpoint URL historis terarsip di Wayback Machine CDX',
        });
      }
    } catch (err: any) {
      const msg = err.message || String(err);
      logger.info('Historical URLs archive query aborted or timed out', {
        requestId: ctx.requestId,
        domain: targetDomain,
        error: msg,
      });
      evidence.push({
        source_url: `https://web.archive.org/web/*/${targetDomain}`,
        source_type: 'WAYBACK_ARCHIVE',
        title: `Wayback Machine Snapshot (${targetDomain})`,
        extracted_value: `Pencarian arsip publik Wayback CDX dihentikan (batas waktu permintaan terlampaui/server sibuk).`,
        confidence: 60,
        metadata: { domain: targetDomain, reason: msg },
      });
    }

    return {
      source: 'historical-urls',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
