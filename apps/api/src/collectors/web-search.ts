/**
 * Web Search Collector — uses DuckDuckGo Instant Answer API for public web discovery.
 * Discovers official websites, public mentions, and related URLs.
 * No API key required. Uses existing SSRF-safe fetch layer.
 */

import type { Collector, CollectorContext, CollectorResult, SeedType } from '@nexusgraph/shared';
import { ssrfSafeFetch } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

export const webSearchCollector: Collector = {
  name: 'web-search',

  supports(inputType: SeedType): boolean {
    return ['ORGANIZATION', 'USERNAME', 'DOMAIN', 'PERSON', 'NAME', 'EMAIL'].includes(inputType);
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const query = input.trim();
    const entities: CollectorResult['entities'] = [];
    const relationships: CollectorResult['relationships'] = [];
    const evidence: CollectorResult['evidence'] = [];
    const warnings: CollectorResult['warnings'] = [];

    logger.info('Web search collector started', {
      requestId: ctx.requestId,
      query,
    });

    try {
      // DuckDuckGo Instant Answer API
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=0`;
      const response = await ssrfSafeFetch(ddgUrl, {
        signal: ctx.signal,
        headers: {
          'User-Agent': 'NexusGraph-OSINT/1.0 (public-investigation-tool)',
        },
      });

      if (!response.ok) {
        warnings.push(`DuckDuckGo API returned ${response.status}`);
        return { source: 'web-search', collectedAt: new Date().toISOString(), entities, relationships, evidence, warnings };
      }

      const data = await response.json() as any;

      // Extract official website from AbstractURL
      if (data.AbstractURL && typeof data.AbstractURL === 'string' && data.AbstractURL.startsWith('http')) {
        try {
          const url = new URL(data.AbstractURL);
          entities.push({
            type: 'WEBSITE',
            value: data.AbstractURL,
            title: data.Heading || `Website: ${url.hostname}`,
            confidence: 75,
            metadata: {
              source: 'duckduckgo',
              abstract: data.AbstractText?.slice(0, 500),
              abstractSource: data.AbstractSource,
              discoveryMethod: 'web-search',
              officialStatus: 'POSSIBLE_OFFICIAL',
              provenance: {
                url: ddgUrl,
                collector: 'web-search',
                transform: 'web.discover-official-site',
                collectedAt: new Date().toISOString(),
              },
            },
          });

          entities.push({
            type: 'DOMAIN',
            value: url.hostname,
            confidence: 70,
            metadata: {
              discoveredFrom: 'web-search',
              url: data.AbstractURL,
              source: {
                url: data.AbstractURL,
                collector: 'web-search',
                transform: 'web.discover-official-site',
                collectedAt: new Date().toISOString(),
              },
            },
          });

          relationships.push({
            source_value: query,
            source_type: 'ORGANIZATION',
            target_value: data.AbstractURL,
            target_type: 'WEBSITE',
            relationship_type: 'HAS_WEBSITE',
            confidence: 70,
            reason: `Official website candidate discovered via DuckDuckGo for "${query}"`,
          });

          evidence.push({
            source_url: ddgUrl,
            source_type: 'WEB_SEARCH',
            title: `Web search result: ${data.Heading || query}`,
            extracted_value: data.AbstractURL,
            confidence: 70,
            metadata: {
              query,
              abstractSource: data.AbstractSource,
              domain: url.hostname,
            },
          });
        } catch { /* invalid URL */ }
      }

      // Extract from Related Topics
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.FirstURL && typeof topic.FirstURL === 'string' && topic.FirstURL.startsWith('http')) {
            try {
              const topicUrl = new URL(topic.FirstURL);
              // Skip DuckDuckGo internal links
              if (topicUrl.hostname.includes('duckduckgo.com')) continue;

              entities.push({
                type: 'PUBLIC_MENTION',
                value: topic.FirstURL,
                title: topic.Text?.slice(0, 200) || `Mention: ${topicUrl.hostname}`,
                confidence: 50,
                metadata: {
                  source: 'duckduckgo',
                  text: topic.Text?.slice(0, 500),
                  discoveryMethod: 'web-search-related',
                  provenance: {
                    url: topic.FirstURL,
                    collector: 'web-search',
                    transform: 'mentions.search-public-web',
                    collectedAt: new Date().toISOString(),
                  },
                },
              });

              evidence.push({
                source_url: topic.FirstURL,
                source_type: 'WEB_SEARCH',
                title: `Related topic: ${topic.Text?.slice(0, 100) || 'Unknown'}`,
                extracted_value: topic.FirstURL,
                confidence: 45,
                metadata: { query, type: 'related_topic' },
              });
            } catch { /* invalid URL */ }
          }
        }
      }

      // Extract from Infobox (if available — often has social links)
      if (data.Infobox && data.Infobox.content && Array.isArray(data.Infobox.content)) {
        for (const item of data.Infobox.content) {
          if (item.data_type === 'string' && item.value && typeof item.value === 'string') {
            const label = (item.label || '').toLowerCase();

            // Check for website
            if (label.includes('website') && item.value.startsWith('http')) {
              entities.push({
                type: 'WEBSITE',
                value: item.value,
                title: `Official Website`,
                confidence: 80,
                metadata: {
                  source: 'duckduckgo-infobox',
                  label: item.label,
                  provenance: {
                    url: item.value,
                    collector: 'web-search',
                    transform: 'web.discover-official-site',
                    collectedAt: new Date().toISOString(),
                  },
                },
              });
            }

            // Check for social profiles
            if (
              (label.includes('twitter') || label.includes('instagram') ||
               label.includes('facebook') || label.includes('linkedin') ||
               label.includes('youtube') || label.includes('github')) &&
              item.value.startsWith('http')
            ) {
              entities.push({
                type: 'SOCIAL_PROFILE',
                value: item.value,
                title: `${item.label}: ${item.value}`,
                confidence: 70,
                metadata: {
                  platform: label,
                  source: 'duckduckgo-infobox',
                  provenance: {
                    url: item.value,
                    collector: 'web-search',
                    transform: 'mentions.search-public-web',
                    collectedAt: new Date().toISOString(),
                  },
                },
              });

              relationships.push({
                source_value: query,
                source_type: 'ORGANIZATION',
                target_value: item.value,
                target_type: 'SOCIAL_PROFILE',
                relationship_type: 'HAS_SOCIAL_PROFILE',
                confidence: 65,
                reason: `Social profile (${item.label}) found via DuckDuckGo Infobox`,
              });
            }
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`Web search failed: ${msg}`);
      logger.warn('Web search collector error', {
        requestId: ctx.requestId,
        error: msg,
      });
    }

    logger.info('Web search collector completed', {
      requestId: ctx.requestId,
      query,
      entityCount: entities.length,
      relationshipCount: relationships.length,
      evidenceCount: evidence.length,
    });

    return {
      source: 'web-search',
      collectedAt: new Date().toISOString(),
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
