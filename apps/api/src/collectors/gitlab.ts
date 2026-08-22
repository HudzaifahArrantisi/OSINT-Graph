/**
 * GitLab Public Collector — discovers public GitLab profiles and projects.
 * Uses GitLab public API v4 (no authentication required for public data).
 * Uses existing SSRF-safe fetch layer.
 */

import type { Collector, CollectorContext, CollectorResult, SeedType } from '@nexusgraph/shared';
import { ssrfSafeFetch } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

export const gitlabCollector: Collector = {
  name: 'gitlab-public',

  supports(inputType: SeedType): boolean {
    return ['USERNAME', 'ORGANIZATION'].includes(inputType);
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
      rawInput.includes('@') ||
      rawInput.startsWith('http://') ||
      rawInput.startsWith('https://') ||
      rawInput.includes('/') ||
      rawInput.includes(':') ||
      rawInput.length < 2 ||
      rawInput.length > 50
    ) {
      warnings.push(`Invalid username/group for GitLab: "${input}". Skipping.`);
      return {
        source: 'gitlab-public',
        collectedAt,
        entities,
        relationships,
        evidence,
        warnings,
      };
    }

    const slug = rawInput.replace(/^@/, '').replace(/\s+/g, '-').toLowerCase();

    logger.info('GitLab collector started', {
      requestId: ctx.requestId,
      slug,
    });

    try {
      // 1. Try as group/organization first
      const groupUrl = `https://gitlab.com/api/v4/groups/${encodeURIComponent(slug)}`;
      const groupResp = await ssrfSafeFetch(groupUrl, {
        signal: ctx.signal,
        headers: {
          'User-Agent': 'NexusGraph-OSINT/1.0 (public-investigation-tool)',
        },
      });

      if (groupResp.ok) {
        const group = await groupResp.json() as any;
        if (group && group.web_url) {
          entities.push({
            type: 'GITLAB_PROFILE',
            value: group.web_url,
            title: `GitLab Organization: ${group.name || group.path}`,
            confidence: 75,
            metadata: {
              platform: 'gitlab',
              type: 'group',
              name: group.name,
              path: group.path,
              description: group.description,
              visibility: group.visibility,
              source: {
                url: group.web_url,
                collector: 'gitlab-public',
                transform: 'developer.gitlab-profile',
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: input,
            source_type: 'ORGANIZATION',
            target_value: group.web_url,
            target_type: 'GITLAB_PROFILE',
            relationship_type: 'LINKS_TO',
            confidence: 75,
            reason: `Public GitLab group found for "${input}"`,
          });

          evidence.push({
            source_url: groupUrl,
            source_type: 'GITLAB_API',
            title: `GitLab group: ${group.name || group.path}`,
            extracted_value: group.description || group.name,
            confidence: 75,
            metadata: { type: 'group', platform: 'gitlab' },
          });

          return {
            source: 'gitlab-public',
            collectedAt,
            entities,
            relationships,
            evidence,
            warnings,
          };
        }
      }

      // 2. Search for users
      const userUrl = `https://gitlab.com/api/v4/users?username=${encodeURIComponent(slug)}`;
      const userResp = await ssrfSafeFetch(userUrl, {
        signal: ctx.signal,
        headers: {
          'User-Agent': 'NexusGraph-OSINT/1.0 (public-investigation-tool)',
        },
      });

      if (userResp.ok) {
        const users = await userResp.json() as any[];

        if (users.length > 0) {
          const user = users[0];
          const profileUrl = user.web_url || `https://gitlab.com/${user.username}`;

          entities.push({
            type: 'GITLAB_PROFILE',
            value: profileUrl,
            title: `GitLab: ${user.name || user.username}`,
            confidence: 75,
            metadata: {
              platform: 'gitlab',
              username: user.username,
              name: user.name,
              avatarUrl: user.avatar_url,
              bio: user.bio,
              location: user.location,
              website: user.website_url,
              publicEmail: user.public_email,
              source: {
                url: profileUrl,
                collector: 'gitlab-public',
                transform: 'developer.gitlab-profile',
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: rawInput,
            source_type: 'USERNAME',
            target_value: profileUrl,
            target_type: 'GITLAB_PROFILE',
            relationship_type: 'POSSIBLY_SAME_AS',
            confidence: 60,
            reason: `GitLab public profile found for handle "${slug}". Same username does not confirm identity.`,
          });

          // Extract website if present
          if (user.website_url && typeof user.website_url === 'string' && user.website_url.startsWith('http')) {
            entities.push({
              type: 'WEBSITE',
              value: user.website_url,
              title: `Website from GitLab: ${user.website_url}`,
              confidence: 65,
              metadata: { source: 'gitlab-profile', username: user.username },
            });

            relationships.push({
              source_value: profileUrl,
              source_type: 'GITLAB_PROFILE',
              target_value: user.website_url,
              target_type: 'WEBSITE',
              relationship_type: 'LINKS_TO',
              confidence: 65,
              reason: `Website linked from GitLab profile ${user.username}`,
            });
          }

          // Extract public email if present
          if (user.public_email && typeof user.public_email === 'string') {
            entities.push({
              type: 'EMAIL',
              value: user.public_email,
              title: `Public email from GitLab`,
              confidence: 75,
              metadata: { source: 'gitlab-profile', username: user.username },
            });

            relationships.push({
              source_value: profileUrl,
              source_type: 'GITLAB_PROFILE',
              target_value: user.public_email,
              target_type: 'EMAIL',
              relationship_type: 'HAS_PUBLIC_EMAIL',
              confidence: 75,
              reason: `Public email from GitLab profile ${user.username}`,
            });
          }

          evidence.push({
            source_url: userUrl,
            source_type: 'GITLAB_API',
            title: `GitLab public profile: ${user.username}`,
            extracted_value: JSON.stringify({
              username: user.username,
              name: user.name,
              website: user.website_url,
              bio: user.bio,
            }),
            confidence: 75,
            metadata: { username: user.username, platform: 'gitlab' },
          });
        } else {
          warnings.push(`No GitLab user found with username "${slug}"`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      warnings.push(`GitLab search failed: ${msg}`);
      logger.warn('GitLab collector error', {
        requestId: ctx.requestId,
        error: msg,
      });
    }

    logger.info('GitLab collector completed', {
      requestId: ctx.requestId,
      slug,
      entityCount: entities.length,
    });

    return {
      source: 'gitlab-public',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
