/**
 * Email Lookup Collector (Mr.Holmes integration)
 *
 * Ported from Mr.Holmes (Lucksi/Mr.Holmes, GPL-3.0) E-Mail module:
 *  - GitHub public email search (api.github.com/search/users?q=...in:email)
 *  - Gravatar existence check via MD5 hash of the address
 *  - Breach-lookup reference URLs (HaveIBeenPwned, IntelligenceX) persisted
 *    as deterministic evidence links for the analyst
 *
 * All outbound requests go through the SSRF guard.
 */

import { createHash } from 'node:crypto';
import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { safeFetch, readResponseWithLimit } from '../security/ssrf.js';
import { normalizeEmail } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 256 * 1024;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface GithubSearchResponse {
  total_count?: number;
  items?: { login?: string; html_url?: string; avatar_url?: string }[];
}

export const emailLookupCollector: Collector = {
  name: 'email-lookup',

  supports(inputType: string): boolean {
    return inputType === 'EMAIL';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const raw = input.trim();
    if (!EMAIL_REGEX.test(raw)) {
      warnings.push(`Invalid email format: "${input}". Skipping email lookup.`);
      return { source: 'mrholmes-email-lookup', collectedAt, entities, relationships, evidence, warnings };
    }

    const email = normalizeEmail(raw);
    const timeoutSignal = AbortSignal.timeout(15_000);
    const signal = AbortSignal.any([ctx.signal, timeoutSignal]);

    logger.info('Mr.Holmes email lookup started', { requestId: ctx.requestId, domain: email.split('@')[1] });

    // ── 1. GitHub public email search (Mr.Holmes Lookup.Github) ──────
    try {
      const ghUrl = `https://api.github.com/search/users?q=${encodeURIComponent(email)}+in:email`;
      const response = await safeFetch(ghUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'NexusGraph-OSINT/1.0 (Email Lookup)',
        },
      });

      if (response.status === 200) {
        const body = await readResponseWithLimit(response, MAX_BODY_BYTES);
        const parsed = JSON.parse(body) as GithubSearchResponse;
        const total = parsed.total_count ?? 0;

        evidence.push({
          source_url: ghUrl,
          source_type: 'EMAIL_LOOKUP',
          title: 'GitHub public email search',
          extracted_value:
            total > 0
              ? `${total} GitHub user(s) publicly list ${email}`
              : `No GitHub users publicly list ${email}`,
          confidence: total > 0 ? 85 : 50,
          metadata: { provider: 'GitHub', totalCount: total, negativeResult: total === 0 },
        });

        for (const item of (parsed.items ?? []).slice(0, 20)) {
          if (!item.login || !item.html_url) continue;

          entities.push({
            type: 'GITHUB_PROFILE',
            value: item.html_url,
            title: `GitHub: ${item.login}`,
            confidence: 80,
            metadata: {
              username: item.login,
              avatarUrl: item.avatar_url,
              matchedVia: 'public-email',
              source: {
                url: ghUrl,
                collector: 'email-lookup',
                transform: 'mrholmes.email-github-search',
                derivedFrom: email,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: email,
            source_type: 'EMAIL',
            target_value: item.html_url,
            target_type: 'GITHUB_PROFILE',
            relationship_type: 'USES_EMAIL',
            confidence: 80,
            reason: `GitHub user "${item.login}" publicly lists this exact email address (GitHub search API).`,
          });
        }
      } else {
        warnings.push(`GitHub email search returned HTTP ${response.status}`);
      }
    } catch (error) {
      warnings.push(`GitHub email search failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // ── 2. Gravatar existence check (Mr.Holmes Lookup/Gravatar) ─────
    const md5 = createHash('md5').update(email.trim().toLowerCase()).digest('hex');
    try {
      const gravatarUrl = `https://gravatar.com/${md5}.json`;
      const response = await safeFetch(gravatarUrl, {
        method: 'GET',
        signal,
        requestId: ctx.requestId,
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxResponseBytes: MAX_BODY_BYTES,
        headers: { Accept: 'application/json', 'User-Agent': 'NexusGraph-OSINT/1.0 (Email Lookup)' },
      });

      // Gravatar returns 200 with a profile for registered hashes; 404 otherwise.
      const exists = response.status === 200;

      evidence.push({
        source_url: `https://gravatar.com/${md5}`,
        source_type: 'EMAIL_LOOKUP',
        title: 'Gravatar profile check',
        extracted_value: exists ? `Gravatar profile exists for ${email}` : `No Gravatar profile for ${email}`,
        confidence: exists ? 70 : 40,
        metadata: {
          provider: 'Gravatar',
          hashAlgorithm: 'md5',
          statusCode: response.status,
          negativeResult: !exists,
        },
      });

      if (exists) {
        const gravatarProfile = `https://gravatar.com/${md5}`;
        entities.push({
          type: 'SOCIAL_PROFILE',
          value: gravatarProfile,
          title: `Gravatar: ${email}`,
          confidence: 70,
          metadata: {
            platform: 'gravatar',
            hash: md5,
            source: {
              url: gravatarProfile,
              collector: 'email-lookup',
              transform: 'mrholmes.email-gravatar-check',
              derivedFrom: email,
              collectedAt,
            },
          },
        });
        relationships.push({
          source_value: email,
          source_type: 'EMAIL',
          target_value: gravatarProfile,
          target_type: 'SOCIAL_PROFILE',
          relationship_type: 'LINKS_TO',
          confidence: 70,
          reason: `MD5 hash of the email resolves to an existing Gravatar profile.`,
        });
      }
    } catch (error) {
      warnings.push(`Gravatar check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    // ── 3. Breach-lookup reference URLs (deterministic, no fetch) ────
    const breachReferences = [
      { name: 'IntelligenceX', url: `https://intelx.io/?s=${encodeURIComponent(email)}` },
      { name: 'HaveIBeenPwned', url: `https://haveibeenpwned.com/unifiedsearch/${encodeURIComponent(email)}` },
    ];

    for (const ref of breachReferences) {
      evidence.push({
        source_url: ref.url,
        source_type: 'EMAIL_LOOKUP',
        title: `Breach lookup reference: ${ref.name}`,
        extracted_value: ref.url,
        confidence: 100,
        metadata: { provider: ref.name, deterministic: true, kind: 'MANUAL_LOOKUP_LINK' },
      });
    }

    return { source: 'mrholmes-email-lookup', collectedAt, entities, relationships, evidence, warnings };
  },
};
