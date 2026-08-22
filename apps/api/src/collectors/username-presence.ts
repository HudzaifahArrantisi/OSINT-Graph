/**
 * Username Presence Collector — checks a small allowlist of platforms
 * for the existence of a username via public profile URLs.
 * The provider list is kept deliberately small for MVP.
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

// Provider configuration — easily extensible
interface ProviderConfig {
  name: string;
  urlTemplate: string;
  // HTTP status codes that indicate the profile exists
  existsCodes: number[];
  // Patterns in response that indicate profile doesn't exist
  notFoundPatterns?: string[];
}

const PROVIDERS: ProviderConfig[] = [
  {
    name: 'GitHub',
    urlTemplate: 'https://github.com/{username}',
    existsCodes: [200],
  },
  {
    name: 'GitLab',
    urlTemplate: 'https://gitlab.com/{username}',
    existsCodes: [200],
  },
  {
    name: 'Reddit',
    urlTemplate: 'https://www.reddit.com/user/{username}',
    existsCodes: [200],
  },
  {
    name: 'Medium',
    urlTemplate: 'https://medium.com/@{username}',
    existsCodes: [200],
  },
  {
    name: 'Dev.to',
    urlTemplate: 'https://dev.to/{username}',
    existsCodes: [200],
  },
  {
    name: 'Keybase',
    urlTemplate: 'https://keybase.io/{username}',
    existsCodes: [200],
  },
  {
    name: 'HackerOne',
    urlTemplate: 'https://hackerone.com/{username}',
    existsCodes: [200],
  },
  {
    name: 'npm',
    urlTemplate: 'https://www.npmjs.com/~{username}',
    existsCodes: [200],
  },
];

async function checkProvider(
  provider: ProviderConfig,
  username: string,
  signal: AbortSignal,
): Promise<{ found: boolean; url: string; statusCode: number }> {
  const url = provider.urlTemplate.replace('{username}', encodeURIComponent(username));

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal,
      headers: {
        'User-Agent': 'NexusGraph-OSINT/1.0 (Username Check)',
      },
      redirect: 'follow',
    });

    return {
      found: provider.existsCodes.includes(response.status),
      url,
      statusCode: response.status,
    };
  } catch {
    return { found: false, url, statusCode: 0 };
  }
}

export const usernamePresenceCollector: Collector = {
  name: 'username-presence',

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

    // Reject URLs, emails, domains, or strings with spaces / slashes / invalid characters
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
      warnings.push(`Invalid username format: "${input}". Skipping username presence check.`);
      return {
        source: 'username-presence-check',
        collectedAt,
        entities,
        relationships,
        evidence,
        warnings,
      };
    }

    const username = rawInput;

    logger.info('Username presence collector started', {
      requestId: ctx.requestId,
      username,
      providerCount: PROVIDERS.length,
    });

    // Check all providers in parallel with individual timeouts
    const timeoutSignal = AbortSignal.timeout(15_000);
    const combinedSignal = AbortSignal.any([ctx.signal, timeoutSignal]);

    const results = await Promise.allSettled(
      PROVIDERS.map((provider) => checkProvider(provider, username, combinedSignal)),
    );

    const foundPlatforms: string[] = [];

    for (let i = 0; i < PROVIDERS.length; i++) {
      const provider = PROVIDERS[i];
      const result = results[i];

      if (result.status === 'rejected') {
        warnings.push(`${provider.name} check failed: ${result.reason}`);
        continue;
      }

      const { found, url, statusCode } = result.value;

      if (found) {
        foundPlatforms.push(provider.name);

        entities.push({
          type: 'SOCIAL_PROFILE',
          value: url,
          title: `${provider.name}: ${username}`,
          confidence: 65, // Username match is not identity proof
          metadata: {
            platform: provider.name.toLowerCase(),
            username,
            statusCode,
            source: {
              url,
              collector: 'username-presence-check',
              transform: 'social.discover-public-profiles',
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
          confidence: 55,
          reason: `Public profile found on ${provider.name} for handle "${username}". Same username does not confirm identity.`,
        });

        evidence.push({
          source_url: url,
          source_type: 'USERNAME_CHECK',
          title: `Public Profile: ${provider.name}`,
          extracted_value: `Profile exists at ${url} (HTTP ${statusCode})`,
          confidence: 65,
          metadata: {
            platform: provider.name,
            username,
            statusCode,
            checkType: 'HEAD request',
          },
        });
      }
    }

    if (foundPlatforms.length > 0) {
      // Summary evidence
      evidence.push({
        source_type: 'USERNAME_CHECK',
        title: `Username Presence Summary: ${username}`,
        extracted_value: `Found on ${foundPlatforms.length}/${PROVIDERS.length} platforms: ${foundPlatforms.join(', ')}`,
        confidence: 65,
        metadata: {
          username,
          checkedPlatforms: PROVIDERS.map((p) => p.name),
          foundPlatforms,
          totalChecked: PROVIDERS.length,
          totalFound: foundPlatforms.length,
        },
      });
    } else {
      warnings.push(`No public profile presence found on checked platforms for username "${username}"`);
    }

    logger.info('Username presence collector completed', {
      requestId: ctx.requestId,
      username,
      found: foundPlatforms.length,
      total: PROVIDERS.length,
    });

    return {
      source: 'username-presence-check',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
