/**
 * URL Metadata Collector — fetches public metadata from a URL.
 * Collects status code, title, headers, redirects, content type.
 * SSRF protection is enforced via safeFetch.
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
import { logger } from '../lib/logger.js';

export const urlMetadataCollector: Collector = {
  name: 'url-metadata',

  supports(inputType: string): boolean {
    return inputType === 'URL' || inputType === 'DOMAIN';
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    // Ensure input has protocol
    let targetUrl = input.trim();
    if (!targetUrl.match(/^https?:\/\//i)) {
      targetUrl = `https://${targetUrl}`;
    }

    logger.info('URL metadata collector started', {
      requestId: ctx.requestId,
      url: targetUrl,
    });

    try {
      const response = await safeFetch(targetUrl, {
        timeoutMs: 10_000,
        maxResponseBytes: 2 * 1024 * 1024, // 2MB for HTML
        requestId: ctx.requestId,
      });

      const finalUrl = response.url || targetUrl;
      const statusCode = response.status;
      const contentType = response.headers.get('content-type') || 'unknown';
      const server = response.headers.get('server') || null;

      // Read body to extract title and meta
      let title = '';
      let metaDescription = '';

      if (contentType.includes('text/html')) {
        const body = await readResponseWithLimit(response, 1 * 1024 * 1024);

        // Extract title
        const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
          title = titleMatch[1].trim().slice(0, 500);
        }

        // Extract meta description
        const metaMatch = body.match(
          /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i,
        );
        if (metaMatch) {
          metaDescription = metaMatch[1].trim().slice(0, 1000);
        }

        // Extract public contact emails from page
        const emailMatches = body.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (emailMatches) {
          const uniqueEmails = [...new Set(emailMatches.map((e) => e.toLowerCase()))].slice(0, 5);
          for (const discoveredEmail of uniqueEmails) {
            // Avoid image extensions or junk
            if (!discoveredEmail.endsWith('.png') && !discoveredEmail.endsWith('.jpg') && !discoveredEmail.endsWith('.js')) {
              entities.push({
                type: 'EMAIL',
                value: discoveredEmail,
                title: `Contact Email: ${discoveredEmail}`,
                confidence: 80,
                metadata: {
                  discoveredFrom: finalUrl,
                  source: {
                    url: finalUrl,
                    collector: 'url-metadata',
                    transform: 'domain.webpage-metadata',
                    collectedAt,
                  },
                },
              });
              relationships.push({
                source_value: finalUrl,
                source_type: 'URL',
                target_value: discoveredEmail,
                target_type: 'EMAIL',
                relationship_type: 'MENTIONS',
                confidence: 80,
                reason: `Public contact email found in webpage content of ${finalUrl}`,
              });
            }
          }
        }

        // Extract social profiles linked on the webpage
        const socialPatterns = [
          { platform: 'github', regex: /https?:\/\/(www\.)?github\.com\/([a-zA-Z0-9-_]+)/gi },
          { platform: 'twitter', regex: /https?:\/\/(www\.)?(twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/gi },
          { platform: 'linkedin', regex: /https?:\/\/(www\.)?linkedin\.com\/(in|company)\/([a-zA-Z0-9-_]+)/gi },
          { platform: 'telegram', regex: /https?:\/\/(t\.me|telegram\.me)\/([a-zA-Z0-9_]+)/gi },
        ];

        for (const { platform, regex } of socialPatterns) {
          const matches = body.match(regex);
          if (matches) {
            const uniqueSocials = [...new Set(matches)].slice(0, 3);
            for (const socialUrl of uniqueSocials) {
              entities.push({
                type: 'SOCIAL_PROFILE',
                value: socialUrl,
                title: `${platform.toUpperCase()} profile found on site`,
                confidence: 85,
                metadata: {
                  platform,
                  sourceUrl: finalUrl,
                  source: {
                    url: finalUrl,
                    collector: 'url-metadata',
                    transform: 'domain.webpage-metadata',
                    collectedAt,
                  },
                },
              });
              relationships.push({
                source_value: finalUrl,
                source_type: 'URL',
                target_value: socialUrl,
                target_type: 'SOCIAL_PROFILE',
                relationship_type: 'LINKS_TO',
                confidence: 85,
                reason: `Official social profile link extracted from webpage ${finalUrl}`,
              });
            }
          }
        }
      }

      // Create URL entity
      entities.push({
        type: 'URL',
        value: finalUrl,
        title: title || undefined,
        confidence: 90,
        metadata: {
          statusCode,
          contentType,
          server,
          metaDescription,
          source: {
            url: finalUrl,
            collector: 'url-metadata',
            transform: 'domain.webpage-metadata',
            collectedAt,
          },
        },
      });

      // If Server header present, create TECHNOLOGY entity
      if (server) {
        entities.push({
          type: 'TECHNOLOGY',
          value: server,
          title: `Web Server: ${server}`,
          confidence: 85,
          metadata: {
            header: 'Server',
            host: finalUrl,
            source: {
              url: finalUrl,
              collector: 'url-metadata',
              transform: 'domain.webpage-metadata',
              collectedAt,
            },
          },
        });
        relationships.push({
          source_value: finalUrl,
          source_type: 'URL',
          target_value: server,
          target_type: 'TECHNOLOGY',
          relationship_type: 'OBSERVED_ON',
          confidence: 85,
          reason: `HTTP Server header returned by ${finalUrl}`,
        });
      }

      // If redirected, track the redirect chain
      if (finalUrl !== targetUrl) {
        relationships.push({
          source_value: targetUrl,
          source_type: 'URL',
          target_value: finalUrl,
          target_type: 'URL',
          relationship_type: 'LINKS_TO',
          confidence: 95,
          reason: `HTTP redirect from ${targetUrl} to ${finalUrl}`,
        });
      }

      // Extract domain from final URL and link DOMAIN -> URL
      try {
        const urlObj = new URL(finalUrl);
        entities.push({
          type: 'DOMAIN',
          value: urlObj.hostname,
          confidence: 90,
          metadata: {
            discoveredFrom: 'url-metadata',
            source: {
              url: finalUrl,
              collector: 'url-metadata',
              transform: 'domain.webpage-metadata',
              collectedAt,
            },
          },
        });
        relationships.push({
          source_value: finalUrl,
          source_type: 'URL',
          target_value: urlObj.hostname,
          target_type: 'DOMAIN',
          relationship_type: 'HOSTED_ON',
          confidence: 95,
          reason: `Webpage hosted on domain ${urlObj.hostname}`,
        });
      } catch {
        // URL parsing failed
      }

      // Create evidence
      evidence.push({
        source_url: finalUrl,
        source_type: 'HTTP_RESPONSE',
        title: title ? `Page: ${title}` : `HTTP ${statusCode}`,
        extracted_value: JSON.stringify({
          statusCode,
          contentType,
          server,
          title,
          metaDescription,
          finalUrl,
        }),
        confidence: 90,
        metadata: {
          statusCode,
          contentType,
          server,
          title,
          metaDescription,
          redirected: finalUrl !== targetUrl,
        },
      });

      // Selected security-relevant headers
      const secHeaders = ['strict-transport-security', 'x-frame-options', 'content-security-policy', 'x-content-type-options'];
      const headerEvidence: Record<string, string> = {};
      for (const h of secHeaders) {
        const val = response.headers.get(h);
        if (val) headerEvidence[h] = val;
      }

      if (Object.keys(headerEvidence).length > 0) {
        evidence.push({
          source_url: finalUrl,
          source_type: 'HTTP_RESPONSE',
          title: 'Security Headers',
          extracted_value: JSON.stringify(headerEvidence),
          confidence: 85,
          metadata: headerEvidence,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      warnings.push(`URL metadata collection failed: ${message}`);
      logger.warn('URL metadata collector error', {
        requestId: ctx.requestId,
        url: targetUrl,
        error: message,
      });
    }

    return {
      source: targetUrl,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
