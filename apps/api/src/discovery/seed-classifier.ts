/**
 * Seed Classifier — creates the initial SEED entity with appropriate low confidence.
 * The seed is the investigation starting point, NOT a verified discovery.
 * Also provides deterministic entity extraction (URL -> DOMAIN, EMAIL -> DOMAIN, SOCIAL_PROFILE -> USERNAME/DOMAIN).
 */

import type { SeedType, EntityType, CreateEntityInput, RelationshipType } from '@nexusgraph/shared';
import { normalizeDomain } from '@nexusgraph/shared';
import { analyzeValue } from './value-analyzer.js';

export interface DerivedSeedEntity {
  type: EntityType;
  value: string;
  relationshipType: RelationshipType;
  reason: string;
}

export interface ParsedSeed {
  seedEntity: CreateEntityInput;
  derivedEntities: DerivedSeedEntity[];
}

/**
 * Deterministically parse an investigation seed and extract immediate sub-entities.
 */
export function parseSeed(seedType: SeedType, seedValue: string): ParsedSeed {
  const trimmed = seedValue.trim();
  const seedEntity = classifySeed(seedType, trimmed);
  const derivedEntities: DerivedSeedEntity[] = [];
  const analysis = analyzeValue(trimmed);

  if (seedType === 'URL') {
    try {
      const urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
      const domain = normalizeDomain(urlObj.hostname);
      if (domain) {
        derivedEntities.push({
          type: 'DOMAIN',
          value: domain,
          relationshipType: 'HOSTED_ON',
          reason: `Deterministic derivation: URL "${trimmed}" is hosted on domain "${domain}"`,
        });
      }
    } catch {
      // Invalid URL syntax
    }
  } else if (seedType === 'EMAIL') {
    if (trimmed.includes('@')) {
      const parts = trimmed.split('@');
      const domainPart = parts[parts.length - 1];
      const domain = normalizeDomain(domainPart);
      if (domain) {
        derivedEntities.push({
          type: 'DOMAIN',
          value: domain,
          relationshipType: 'OBSERVED_ON',
          reason: `Deterministic derivation: Email "${trimmed}" uses mail provider domain "${domain}"`,
        });
      }
    }
  } else if (seedType === 'SOCIAL_PROFILE') {
    if (analysis.isUrl) {
      if (analysis.extractedDomain) {
        const domain = normalizeDomain(analysis.extractedDomain);
        if (domain) {
          derivedEntities.push({
            type: 'DOMAIN',
            value: domain,
            relationshipType: 'HOSTED_ON',
            reason: `Deterministic derivation: Profile URL hosted on domain "${domain}"`,
          });
        }
      }
      if (analysis.extractedUsername) {
        derivedEntities.push({
          type: 'USERNAME',
          value: analysis.extractedUsername,
          relationshipType: 'USES_USERNAME',
          reason: `Deterministic derivation: Extracted handle "${analysis.extractedUsername}" from profile URL`,
        });
      }
    } else if (analysis.isUsername && analysis.extractedUsername) {
      derivedEntities.push({
        type: 'USERNAME',
        value: analysis.extractedUsername,
        relationshipType: 'USES_USERNAME',
        reason: `Deterministic derivation: Social profile handle "${analysis.extractedUsername}"`,
      });
    }
  }

  return { seedEntity, derivedEntities };
}

/**
 * Map a SeedType to the corresponding EntityType for the seed entity.
 * Seeds get type 'SEED' in the graph to visually distinguish them.
 */
export function classifySeed(
  seedType: SeedType,
  seedValue: string,
): CreateEntityInput {
  return {
    type: 'SEED' as EntityType,
    value: seedValue.trim(),
    title: `Investigation Seed: ${seedValue.trim()}`,
    confidence: 30, // Low confidence — seed is a starting point, not proof
    metadata: {
      isSeed: true,
      declaredType: seedType,
      status: 'investigation_seed',
    },
  };
}

/**
 * Determine the "effective" entity type for transform planning.
 * While the seed is stored as type SEED, the planner needs the declared type
 * to decide which transforms are relevant.
 */
export function getEffectiveType(seedType: SeedType): EntityType {
  const mapping: Record<SeedType, EntityType> = {
    USERNAME: 'USERNAME',
    EMAIL: 'EMAIL',
    DOMAIN: 'DOMAIN',
    IP_ADDRESS: 'IP_ADDRESS',
    URL: 'URL',
    ORGANIZATION: 'ORGANIZATION',
    SOCIAL_PROFILE: 'SOCIAL_PROFILE',
    PERSON: 'PERSON',
    NAME: 'PERSON',
  };
  return mapping[seedType] || 'SEED';
}
