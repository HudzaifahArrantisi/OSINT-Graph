/**
 * GitHub Public Metadata Collector — gathers publicly available GitHub data.
 * Only accesses public APIs and profiles. No private repo access.
 * Works with or without GITHUB_TOKEN (unauthenticated = 60 req/hr).
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

const GITHUB_API = 'https://api.github.com';

async function githubFetch(path: string, signal: AbortSignal): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'NexusGraph-OSINT/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${GITHUB_API}${path}`, { headers, signal });
}

interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
  email: string | null;
  bio: string | null;
  blog: string;
  company: string | null;
  location: string | null;
  twitter_username: string | null;
  public_repos: number;
  html_url: string;
  avatar_url: string;
  created_at: string;
  updated_at: string;
  type: string;
}

interface GitHubRepo {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  created_at: string;
  updated_at: string;
  topics: string[];
}

export const githubCollector: Collector = {
  name: 'github-public',

  supports(inputType: string): boolean {
    return (
      inputType === 'USERNAME' ||
      inputType === 'EMAIL' ||
      inputType === 'ORGANIZATION'
    );
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    const rawInput = input.trim();

    // ─── 1. Case: Email Input ──────────────────────────────────────────
    if (rawInput.includes('@') && !rawInput.startsWith('http')) {
      const email = rawInput.toLowerCase();
      logger.info('GitHub collector searching by public email', {
        requestId: ctx.requestId,
        email,
      });

      try {
        const searchRes = await githubFetch(
          `/search/users?q=${encodeURIComponent(email)}+in:email`,
          ctx.signal,
        );

        if (!searchRes.ok) {
          if (searchRes.status === 403) {
            warnings.push('GitHub API rate limit reached during email search');
          } else {
            warnings.push(`GitHub search returned HTTP ${searchRes.status}`);
          }
          return { source: GITHUB_API, collectedAt, entities, relationships, evidence, warnings };
        }

        const searchData = (await searchRes.json()) as { items?: Array<{ login: string; html_url: string }> };
        if (!searchData.items || searchData.items.length === 0) {
          warnings.push(`No public GitHub user publicly associated with email "${email}"`);
          return { source: GITHUB_API, collectedAt, entities, relationships, evidence, warnings };
        }

        // Exact match found on GitHub
        const matchedUser = searchData.items[0];
        const userResp = await githubFetch(`/users/${encodeURIComponent(matchedUser.login)}`, ctx.signal);
        if (userResp.ok) {
          const user = (await userResp.json()) as GitHubUser;
          entities.push({
            type: 'GITHUB_PROFILE',
            value: user.html_url,
            title: `GitHub: ${user.login}`,
            confidence: 85,
            metadata: {
              platform: 'github',
              username: user.login,
              name: user.name,
              publicEmail: user.email || email,
              source: {
                url: user.html_url,
                collector: 'github-public',
                transform: 'developer.github-profile',
                derivedFrom: email,
                collectedAt,
              },
            },
          });

          relationships.push({
            source_value: email,
            source_type: 'EMAIL',
            target_value: user.html_url,
            target_type: 'GITHUB_PROFILE',
            relationship_type: 'HAS_PUBLIC_EMAIL',
            confidence: 85,
            reason: `GitHub profile ${user.login} is publicly associated with email ${email}`,
          });

          evidence.push({
            source_url: `${GITHUB_API}/search/users?q=${encodeURIComponent(email)}+in:email`,
            source_type: 'GITHUB_API',
            title: `GitHub Email Association: ${user.login}`,
            extracted_value: JSON.stringify({ username: user.login, email, url: user.html_url }),
            confidence: 85,
            metadata: { username: user.login, email },
          });
        }
      } catch (err: any) {
        warnings.push(`GitHub email search error: ${err.message || 'unknown'}`);
      }

      return {
        source: `${GITHUB_API}/search/users`,
        collectedAt,
        entities,
        relationships,
        evidence,
        warnings,
      };
    }

    // ─── 2. Case: Handle / Organization / URL Input ────────────────────
    let handle = rawInput;
    if (handle.startsWith('http')) {
      try {
        const parsedUrl = new URL(handle);
        if (!parsedUrl.hostname.includes('github.com')) {
          warnings.push(`Non-GitHub URL provided: "${handle}"`);
          return { source: GITHUB_API, collectedAt, entities, relationships, evidence, warnings };
        }
        const parts = parsedUrl.pathname.split('/').filter(Boolean);
        if (parts.length > 0) {
          handle = parts[0];
        } else {
          warnings.push(`No username found in URL: "${handle}"`);
          return { source: GITHUB_API, collectedAt, entities, relationships, evidence, warnings };
        }
      } catch {
        // use as-is
      }
    }

    handle = handle.replace(/^@/, '').trim();
    if (!handle || /\s/.test(handle) || handle.includes('/') || handle.includes(':')) {
      // If organization name with spaces, slugify
      handle = handle.replace(/\s+/g, '-').toLowerCase();
    }

    logger.info('GitHub collector started', {
      requestId: ctx.requestId,
      handle,
    });

    try {
      // 1. First fetch user profile
      const userResponse = await githubFetch(
        `/users/${encodeURIComponent(handle)}`,
        ctx.signal,
      );

      if (userResponse.ok) {
        const user = (await userResponse.json()) as GitHubUser;

        // Profile entity
        entities.push({
          type: 'GITHUB_PROFILE',
          value: user.html_url,
          title: `GitHub: ${user.name || user.login}`,
          confidence: 80,
          metadata: {
            platform: 'github',
            username: user.login,
            name: user.name,
            bio: user.bio,
            publicRepos: user.public_repos,
            source: {
              url: user.html_url,
              collector: 'github-public',
              transform: 'developer.github-profile',
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: handle,
          source_type: 'USERNAME',
          target_value: user.html_url,
          target_type: 'GITHUB_PROFILE',
          relationship_type: 'POSSIBLY_SAME_AS',
          confidence: 60,
          reason: `Public GitHub account found for handle "${handle}". Same username does not confirm identity.`,
        });

        // Public email
        if (user.email) {
          entities.push({
            type: 'EMAIL',
            value: user.email,
            title: `Public email from GitHub`,
            confidence: 80,
            metadata: {
              source: {
                url: user.html_url,
                collector: 'github-public',
                transform: 'developer.github-profile',
                collectedAt,
              },
            },
          });
          relationships.push({
            source_value: user.html_url,
            source_type: 'GITHUB_PROFILE',
            target_value: user.email,
            target_type: 'EMAIL',
            relationship_type: 'HAS_PUBLIC_EMAIL',
            confidence: 80,
            reason: `Public email listed on GitHub profile for ${user.login}`,
          });
        }

        // Website/blog
        if (user.blog && user.blog.startsWith('http')) {
          entities.push({
            type: 'WEBSITE',
            value: user.blog,
            title: `Website: ${user.blog}`,
            confidence: 75,
            metadata: {
              source: {
                url: user.html_url,
                collector: 'github-public',
                transform: 'developer.github-profile',
                collectedAt,
              },
            },
          });
          relationships.push({
            source_value: user.html_url,
            source_type: 'GITHUB_PROFILE',
            target_value: user.blog,
            target_type: 'WEBSITE',
            relationship_type: 'LINKS_TO',
            confidence: 75,
            reason: `Website linked from GitHub profile of ${user.login}`,
          });
        }

        // Evidence
        evidence.push({
          source_url: user.html_url,
          source_type: 'GITHUB_API',
          title: `GitHub Profile: ${user.login}`,
          extracted_value: JSON.stringify({
            name: user.name,
            email: user.email,
            bio: user.bio,
            blog: user.blog,
            location: user.location,
            publicRepos: user.public_repos,
          }),
          confidence: 85,
          metadata: { type: 'github-profile', username: user.login },
        });

        // Repositories (top 5)
        const reposResponse = await githubFetch(
          `/users/${encodeURIComponent(handle)}/repos?sort=stars&per_page=5&type=owner`,
          ctx.signal,
        );

        if (reposResponse.ok) {
          const repos = (await reposResponse.json()) as GitHubRepo[];
          if (Array.isArray(repos)) {
            for (const repo of repos) {
              entities.push({
                type: 'REPOSITORY',
                value: repo.html_url,
                title: `Repo: ${repo.name}`,
                confidence: 80,
                metadata: {
                  platform: 'github',
                  name: repo.name,
                  description: repo.description,
                  language: repo.language,
                  stars: repo.stargazers_count,
                  forks: repo.forks_count,
                  homepage: repo.homepage,
                  topics: repo.topics,
                  source: {
                    url: repo.html_url,
                    collector: 'github-public',
                    transform: 'developer.github-profile',
                    collectedAt,
                  },
                },
              });

              relationships.push({
                source_value: user.html_url,
                source_type: 'GITHUB_PROFILE',
                target_value: repo.html_url,
                target_type: 'REPOSITORY',
                relationship_type: 'LINKS_TO',
                confidence: 85,
                reason: `GitHub repository owned by ${user.login}`,
              });
            }
          }
        }

        return {
          source: `${GITHUB_API}/users/${handle}`,
          collectedAt,
          entities,
          relationships,
          evidence,
          warnings,
        };
      }

      // 2. If user not found, try as organization
      const orgResp = await githubFetch(`/orgs/${encodeURIComponent(handle)}`, ctx.signal);
      if (orgResp.ok) {
        const org = await orgResp.json() as any;
        if (org && org.login) {
          entities.push({
            type: 'ORGANIZATION',
            value: org.name || org.login,
            title: `GitHub Org: ${org.name || org.login}`,
            confidence: 80,
            metadata: {
              platform: 'github',
              login: org.login,
              htmlUrl: org.html_url,
              blog: org.blog,
              description: org.description,
              source: {
                url: org.html_url,
                collector: 'github-public',
                transform: 'developer.github-profile',
                collectedAt,
              },
            },
          });

          entities.push({
            type: 'GITHUB_PROFILE',
            value: org.html_url,
            title: `GitHub Organization: ${org.login}`,
            confidence: 85,
            metadata: { platform: 'github', type: 'organization', login: org.login },
          });

          relationships.push({
            source_value: input,
            source_type: 'ORGANIZATION',
            target_value: org.html_url,
            target_type: 'GITHUB_PROFILE',
            relationship_type: 'LINKS_TO',
            confidence: 80,
            reason: `Public GitHub Organization found for "${handle}"`,
          });

          evidence.push({
            source_url: org.html_url,
            source_type: 'GITHUB_API',
            title: `GitHub Organization: ${org.login}`,
            extracted_value: JSON.stringify({ name: org.name, login: org.login, description: org.description }),
            confidence: 85,
            metadata: { type: 'organization', login: org.login },
          });

          return {
            source: `${GITHUB_API}/orgs/${handle}`,
            collectedAt,
            entities,
            relationships,
            evidence,
            warnings,
          };
        }
      }

      warnings.push(`GitHub user or organization "${handle}" not found`);
    } catch (err: any) {
      warnings.push(`GitHub collection error: ${err.message || 'unknown'}`);
    }

    return {
      source: `${GITHUB_API}/users/${handle}`,
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
