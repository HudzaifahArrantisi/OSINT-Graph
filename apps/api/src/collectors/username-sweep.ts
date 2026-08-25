/**
 * Username Sweep Collector (Mr.Holmes integration)
 *
 * Ported from Mr.Holmes (Lucksi/Mr.Holmes, GPL-3.0) username enumeration
 * across ~150 platforms. Detection modes mirror the original tool:
 *  - STATUS:    profile exists when HTTP status is 200
 *  - MESSAGE:   profile exists when the not-found body text is absent
 *  - REDIRECT:  profile exists when the final URL differs from the known
 *               not-found redirect target
 *
 * All outbound requests go through the SSRF guard. This is a large
 * collector and is subject to LARGE_COLLECTOR_PER_HOUR rate limiting.
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
import { SsrfError } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';
import { MR_HOLMES_SITES, type MrHolmesSite } from './data/mrholmes-sites.generated.js';

const CONCURRENCY = 12;
const PER_REQUEST_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 64 * 1024;

interface CheckOutcome {
  site: MrHolmesSite;
  found: boolean | null;
  statusCode: number;
  finalUrl?: string;
  error?: string;
}

function buildUrl(site: MrHolmesSite, username: string): string {
  const encoded = encodeURIComponent(username);
  return site.url.replace(/\{\}/g, encoded);
}

async function checkSite(site: MrHolmesSite, username: string, ctx: CollectorContext): Promise<CheckOutcome> {
  const url = buildUrl(site, username);
  const timeout = AbortSignal.timeout(PER_REQUEST_TIMEOUT_MS);
  const signal = AbortSignal.any([ctx.signal, timeout]);

  try {
    const response = await safeFetch(url, {
      method: 'GET',
      signal,
      requestId: ctx.requestId,
      timeoutMs: PER_REQUEST_TIMEOUT_MS,
      maxRedirects: 5,
      maxResponseBytes: MAX_BODY_BYTES,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (site.mode === 'STATUS') {
      return { site, found: response.status === 200, statusCode: response.status };
    }

    if (site.mode === 'REDIRECT') {
      const finalUrl = response.url || url;
      const found = !finalUrl.startsWith(site.redirectTarget!);
      return { site, found, statusCode: response.status, finalUrl };
    }

    // MESSAGE mode — inspect a bounded body slice for the not-found text
    if (response.status !== 200) {
      return { site, found: false, statusCode: response.status };
    }
    const body = await readResponseWithLimit(response, MAX_BODY_BYTES);
    const needle = site.notFoundText!;
    const found = !body.toLowerCase().includes(needle.toLowerCase());
    return { site, found, statusCode: response.status };
  } catch (error) {
    if (error instanceof SsrfError) {
      return { site, found: null, statusCode: 0, error: `SSRF blocked: ${error.message}` };
    }
    if (signal.aborted) {
      return { site, found: null, statusCode: 0, error: 'timeout or aborted' };
    }
    return { site, found: null, statusCode: 0, error: error instanceof Error ? error.message : 'request failed' };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function lane(): Promise<void> {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => lane()));
  return results;
}

export const usernameSweepCollector: Collector = {
  name: 'username-sweep',

  supports(inputType: string): boolean {
    return inputType === 'USERNAME';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const rawInput = input.trim().replace(/^@/, '');
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    if (
      rawInput.startsWith('http://') ||
      rawInput.startsWith('https://') ||
      rawInput.includes('/') ||
      rawInput.includes('@') ||
      rawInput.includes(':') ||
      rawInput.length < 2 ||
      rawInput.length > 50 ||
      /\s/.test(rawInput)
    ) {
      warnings.push(`Invalid username format: "${input}". Skipping username sweep.`);
      return { source: 'mrholmes-username-sweep', collectedAt, entities, relationships, evidence, warnings };
    }

    const username = rawInput;

    logger.info('Mr.Holmes username sweep started', {
      requestId: ctx.requestId,
      username,
      siteCount: MR_HOLMES_SITES.length,
    });

    const outcomes = await runWithConcurrency(MR_HOLMES_SITES, CONCURRENCY, (site) =>
      checkSite(site, username, ctx),
    );

    const foundPlatforms: string[] = [];

    for (const outcome of outcomes) {
      const { site, found, statusCode, finalUrl, error } = outcome;

      if (found === null) {
        warnings.push(`${site.name} check failed: ${error}`);
        continue;
      }

      const url = buildUrl(site, username);

      evidence.push({
        source_url: url,
        source_type: 'USERNAME_CHECK',
        title: `Mr.Holmes Sweep: ${site.name}`,
        extracted_value: found
          ? `Profile exists at ${url} (HTTP ${statusCode}${finalUrl ? `, final: ${finalUrl}` : ''})`
          : `No profile at ${url} (HTTP ${statusCode}, detection=${site.mode})`,
        confidence: found ? 60 : 40,
        metadata: {
          platform: site.name,
          detectionMode: site.mode,
          statusCode,
          finalUrl,
          negativeResult: !found,
        },
      });

      if (!found) continue;

      foundPlatforms.push(site.name);

      entities.push({
        type: 'SOCIAL_PROFILE',
        value: url,
        title: `${site.name}: ${username}`,
        confidence: 60,
        metadata: {
          platform: site.name.toLowerCase(),
          username,
          statusCode,
          tags: site.tags,
          source: {
            url,
            collector: 'username-sweep',
            transform: 'mrholmes.username-sweep',
            derivedFrom: username,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: username,
        source_type: 'USERNAME',
        target_value: url,
        target_type: 'SOCIAL_PROFILE',
        relationship_type: 'POSSIBLY_SAME_AS',
        confidence: 50,
        reason: `Public profile found on ${site.name} for handle "${username}" via Mr.Holmes sweep (${site.mode} detection). Same handle does not confirm identity.`,
      });
    }

    if (foundPlatforms.length > 0) {
      evidence.push({
        source_type: 'USERNAME_CHECK',
        title: `Mr.Holmes Sweep Summary: ${username}`,
        extracted_value: `Found on ${foundPlatforms.length}/${MR_HOLMES_SITES.length} platforms: ${foundPlatforms.join(', ')}`,
        confidence: 60,
        metadata: {
          totalChecked: MR_HOLMES_SITES.length,
          totalFound: foundPlatforms.length,
          foundPlatforms,
        },
      });
    } else {
      warnings.push(`No public profile presence found across ${MR_HOLMES_SITES.length} Mr.Holmes platforms for "${username}"`);
    }

    logger.info('Mr.Holmes username sweep completed', {
      requestId: ctx.requestId,
      username,
      found: foundPlatforms.length,
      total: MR_HOLMES_SITES.length,
    });

    return { source: 'mrholmes-username-sweep', collectedAt, entities, relationships, evidence, warnings };
  },
};
