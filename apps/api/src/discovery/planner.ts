/**
 * Discovery Planner — determines which transforms to execute for a seed.
 * Uses seed type + value analysis to select strictly relevant transform families.
 * Does NOT blindly execute every transform or fall back to universal SEED search.
 */

import type { SeedType, TransformDefinition, EntityType } from '@nexusgraph/shared';
import { getTransform } from '../transforms/registry.js';
import { getEffectiveType } from './seed-classifier.js';
import { analyzeValue, inferEffectiveInputType } from './value-analyzer.js';
import type { ValueAnalysis } from './value-analyzer.js';

export interface DiscoveryPlanOutput {
  seedType: SeedType;
  seedValue: string;
  effectiveType: EntityType;
  valueAnalysis: ValueAnalysis;
  transforms: TransformDefinition[];
}

/** Specific transform lists per seed type for deterministic, evidence-backed planning */
const SEED_TRANSFORM_MAP: Record<SeedType, string[]> = {
  URL: [
    'domain.webpage-metadata',
    'domain.resolve-dns',
    'domain.find-tls',
    'domain.find-subdomains-crt',
    'domain.whois-rdap',
    'contact.find-official-contact',
    'intelligence.generate-dorks',
    'mentions.search-public-web',
  ],
  DOMAIN: [
    'domain.resolve-dns',
    'domain.whois-rdap',
    'domain.find-tls',
    'domain.find-subdomains-crt',
    'domain.webpage-metadata',
    'contact.find-official-contact',
    'mentions.search-public-web',
    'domain.website-recon',
    'intelligence.generate-dorks',
  ],
  EMAIL: [
    'domain.resolve-dns',
    'developer.github-profile',
    'contact.email-breach-lookup',
  ],
  USERNAME: [
    'social.rapidapi-social-lookup',
    'social.discover-public-profiles',
    'social.username-sweep',
    'social.mrholmes-engine',
    'developer.github-profile',
    'developer.gitlab-profile',
    'social.youtube-channel',
  ],
  ORGANIZATION: [
    'web.discover-official-site',
    'developer.github-profile',
    'developer.gitlab-profile',
    'social.youtube-channel',
    'mentions.search-public-web',
    'domain.find-subdomains-crt',
  ],
  PERSON: [
    'social.rapidapi-social-lookup',
    'web.discover-official-site',
    'social.mrholmes-engine',
    'social.youtube-channel',
    'developer.github-profile',
    'developer.gitlab-profile',
  ],
  NAME: [
    'social.rapidapi-social-lookup',
    'web.discover-official-site',
    'social.mrholmes-engine',
    'social.youtube-channel',
    'developer.github-profile',
    'developer.gitlab-profile',
  ],
  IP_ADDRESS: [
    'domain.resolve-dns',
    'infrastructure.ip-geolocation',
    'mentions.search-public-web',
  ],
  SOCIAL_PROFILE: [
    'social.rapidapi-social-lookup',
    'social.discover-public-profiles',
    'developer.github-profile',
    'developer.gitlab-profile',
    'social.youtube-channel',
    'domain.webpage-metadata',
  ],
  PHONE: [
    'phone.geo-metadata',
    'contact.mrholmes-phone',
  ],
};

/**
 * Build a discovery plan for a seed.
 * Uses value analysis to intelligently select transforms:
 * - If SOCIAL_PROFILE + URL value → includes both URL-type and username-type transforms
 * - If SOCIAL_PROFILE + username value → includes username-type transforms
 * - EMAIL → includes DNS resolution for provider domain & exact email search on GitHub
 */
export function buildDiscoveryPlan(
  seedType: SeedType,
  seedValue: string,
): DiscoveryPlanOutput {
  const effectiveType = getEffectiveType(seedType);
  const valueAnalysis = analyzeValue(seedValue);
  const effectiveInputType = inferEffectiveInputType(seedType, valueAnalysis);

  // Start with the transforms for the declared seed type
  const transformIdSet = new Set<string>(SEED_TRANSFORM_MAP[seedType] || []);

  // If value analysis infers a different effective type, ALSO include those transforms
  if (effectiveInputType !== seedType && SEED_TRANSFORM_MAP[effectiveInputType]) {
    for (const id of SEED_TRANSFORM_MAP[effectiveInputType]) {
      transformIdSet.add(id);
    }
  }

  // If the value is a URL and the seed is SOCIAL_PROFILE, ensure URL transforms are included
  if (seedType === 'SOCIAL_PROFILE' && valueAnalysis.isUrl) {
    for (const id of SEED_TRANSFORM_MAP['URL']) {
      transformIdSet.add(id);
    }
  }

  const transforms: TransformDefinition[] = [];
  for (const id of transformIdSet) {
    const t = getTransform(id);
    if (t && t.enabled) {
      transforms.push(t);
    }
  }

  // Sort by category for consistent, logical execution order
  const categoryOrder = ['web', 'infrastructure', 'contact', 'developer', 'social', 'intelligence'];
  transforms.sort((a, b) => {
    const ai = categoryOrder.indexOf(a.category);
    const bi = categoryOrder.indexOf(b.category);
    return ai - bi;
  });

  return {
    seedType,
    seedValue,
    effectiveType,
    valueAnalysis,
    transforms,
  };
}
