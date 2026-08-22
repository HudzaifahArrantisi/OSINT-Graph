/**
 * YouTube Public Collector — discovers YouTube channels.
 * Uses public channel page existence check (no API key required).
 * Uses existing SSRF-safe fetch layer.
 */

import type { Collector, CollectorContext, CollectorResult, SeedType } from '@nexusgraph/shared';
import { ssrfSafeFetch } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

export const youtubeCollector: Collector = {
  name: 'youtube-public',

  supports(inputType: SeedType): boolean {
    return ['USERNAME', 'ORGANIZATION', 'PERSON', 'NAME'].includes(inputType);
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const rawInput = input.trim();
    const collectedAt = new Date().toISOString();
    const entities: CollectorResult['entities'] = [];
    const relationships: CollectorResult['relationships'] = [];
    const evidence: CollectorResult['evidence'] = [];
    const warnings: CollectorResult['warnings'] = [];

    // Reject emails, URLs, domains
    if (
      rawInput.includes('@') && !rawInput.startsWith('@') ||
      rawInput.startsWith('http://') ||
      rawInput.startsWith('https://') ||
      rawInput.includes('/') ||
      rawInput.includes(':') ||
      rawInput.length < 2 ||
      rawInput.length > 60
    ) {
      warnings.push(`Invalid input for YouTube discovery: "${input}". Skipping.`);
      return {
        source: 'youtube-public',
        collectedAt,
        entities,
        relationships,
        evidence,
        warnings,
      };
    }

    // Generate candidate handles to check
    const candidates = generateCandidates(rawInput);

    logger.info('YouTube collector started', {
      requestId: ctx.requestId,
      input: rawInput,
      candidateCount: candidates.length,
    });

    for (const handle of candidates) {
      try {
        // Check @handle format first (modern YouTube)
        const channelUrl = `https://www.youtube.com/@${handle}`;
        const response = await ssrfSafeFetch(channelUrl, {
          signal: ctx.signal,
          method: 'GET',
          headers: {
            'User-Agent': 'NexusGraph-OSINT/1.0 (public-investigation-tool)',
          },
        });

        if (response.ok) {
          const html = await response.text();

          // Verify it's an actual channel page (not a 404/redirect to search)
          if (
            html.includes('"channelId"') ||
            html.includes('channel-header') ||
            html.includes('og:url')
          ) {
            // Extract channel name from title
            const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
            const channelName = titleMatch
              ? titleMatch[1].replace(/\s*-\s*YouTube\s*$/i, '').trim()
              : handle;

            // Extract channel description
            const descMatch = html.match(
              /meta\s+(?:name|property)="(?:description|og:description)"\s+content="([^"]*)"/i,
            );
            const description = descMatch ? descMatch[1] : undefined;

            entities.push({
              type: 'YOUTUBE_CHANNEL',
              value: channelUrl,
              title: `YouTube: ${channelName}`,
              confidence: 70,
              metadata: {
                platform: 'youtube',
                handle,
                channelName,
                description: description?.slice(0, 500),
                source: {
                  url: channelUrl,
                  collector: 'youtube-public',
                  transform: 'social.youtube-channel',
                  collectedAt,
                },
              },
            });

            relationships.push({
              source_value: rawInput,
              source_type: 'USERNAME',
              target_value: channelUrl,
              target_type: 'YOUTUBE_CHANNEL',
              relationship_type: 'POSSIBLY_SAME_AS',
              confidence: 60,
              reason: `YouTube channel @${handle} found for handle "${rawInput}". Same username does not confirm identity.`,
            });

            evidence.push({
              source_url: channelUrl,
              source_type: 'YOUTUBE_API',
              title: `YouTube channel: ${channelName}`,
              extracted_value: channelUrl,
              confidence: 70,
              metadata: {
                handle,
                channelName,
                platform: 'youtube',
              },
            });

            // Only use first matching handle
            break;
          }
        }
      } catch (err) {
        // Silently continue to next candidate
        const msg = err instanceof Error ? err.message : 'Unknown error';
        logger.debug?.('YouTube handle check failed', {
          requestId: ctx.requestId,
          handle,
          error: msg,
        });
      }
    }

    if (entities.length === 0) {
      warnings.push(`No YouTube channel found for "${rawInput}"`);
    }

    logger.info('YouTube collector completed', {
      requestId: ctx.requestId,
      input: rawInput,
      entityCount: entities.length,
    });

    return {
      source: 'youtube-public',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};

/** Generate candidate YouTube handles from an input string */
function generateCandidates(input: string): string[] {
  const candidates = new Set<string>();
  const cleaned = input.replace(/^@/, '').trim();

  // As-is (lowercase)
  candidates.add(cleaned.toLowerCase().replace(/\s+/g, ''));

  // With hyphens
  candidates.add(cleaned.toLowerCase().replace(/\s+/g, '-'));

  // With underscores
  candidates.add(cleaned.toLowerCase().replace(/\s+/g, '_'));

  // Camel case style
  const words = cleaned.split(/\s+/);
  if (words.length > 1) {
    candidates.add(
      words
        .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(''),
    );
  }

  // Original casing no spaces
  candidates.add(cleaned.replace(/\s+/g, ''));

  return [...candidates].slice(0, 3); // Limit to 3 candidates
}
