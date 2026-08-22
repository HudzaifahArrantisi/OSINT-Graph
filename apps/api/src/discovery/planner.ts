/**
 * Discovery Planner — determines which transforms to execute for a seed.
 * Uses seed type to select strictly relevant transform families.
 * Does NOT blindly execute every transform or fall back to universal SEED search.
 */

import type { SeedType, TransformDefinition, EntityType } from '@nexusgraph/shared';
import { getTransform } from '../transforms/registry.js';
import { getEffectiveType } from './seed-classifier.js';

export interface DiscoveryPlanOutput {
  seedType: SeedType;
  seedValue: string;
  effectiveType: EntityType;
  transforms: TransformDefinition[];
}

/** Specific transform lists per seed type for deterministic, evidence-backed planning */
const SEED_TRANSFORM_MAP: Record<SeedType, string[]> = {
  URL: [
    'domain.webpage-metadata',
    'domain.resolve-dns',
    'domain.find-tls',
    'contact.find-official-contact',
  ],
  DOMAIN: [
    'domain.resolve-dns',
    'domain.find-tls',
    'domain.webpage-metadata',
    'contact.find-official-contact',
    'mentions.search-public-web',
  ],
  EMAIL: [
    'domain.resolve-dns',
    'developer.github-profile',
  ],
  USERNAME: [
    'social.discover-public-profiles',
    'developer.github-profile',
    'developer.gitlab-profile',
    'social.youtube-channel',
    'mentions.search-public-web',
  ],
  ORGANIZATION: [
    'web.discover-official-site',
    'developer.github-profile',
    'developer.gitlab-profile',
    'social.youtube-channel',
    'mentions.search-public-web',
  ],
  PERSON: [
    'web.discover-official-site',
    'mentions.search-public-web',
    'social.youtube-channel',
    'developer.github-profile',
    'developer.gitlab-profile',
  ],
  NAME: [
    'web.discover-official-site',
    'mentions.search-public-web',
    'social.youtube-channel',
    'developer.github-profile',
    'developer.gitlab-profile',
  ],
  IP_ADDRESS: [
    'domain.resolve-dns',
  ],
  SOCIAL_PROFILE: [
    'domain.webpage-metadata',
    'social.discover-public-profiles',
  ],
};

/**
 * Build a discovery plan for a seed.
 * Strictly maps the seed type to its allowed transform suite.
 */
export function buildDiscoveryPlan(
  seedType: SeedType,
  seedValue: string,
): DiscoveryPlanOutput {
  const effectiveType = getEffectiveType(seedType);
  const transformIds = SEED_TRANSFORM_MAP[seedType] || [];

  const transforms: TransformDefinition[] = [];
  for (const id of transformIds) {
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
    transforms,
  };
}

