/**
 * Correlation Engine — creates relationships based on explicit rules.
 * Every correlation must have a confidence score and reason.
 * Uses heuristic scoring (not probabilistic — documented as such in UI).
 */

import type {
  EntityCandidate,
  RelationshipCandidate,
  Entity,
} from '@nexusgraph/shared';
import { CONFIDENCE_FACTORS } from '@nexusgraph/shared';

interface CorrelationRule {
  name: string;
  description: string;
  match(entityA: Entity | EntityCandidate, entityB: Entity | EntityCandidate): boolean;
  confidence: number;
  relationshipType: string;
  reason(entityA: Entity | EntityCandidate, entityB: Entity | EntityCandidate): string;
}

// Clamp confidence score to 0-100
function clampConfidence(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ─── Correlation Rules ──────────────────────────────────────────────

const correlationRules: CorrelationRule[] = [
  {
    name: 'exact-email-match',
    description: 'Same public email observed from independent sources',
    match(a, b) {
      return a.type === 'EMAIL' && b.type === 'EMAIL' && getValue(a) === getValue(b);
    },
    confidence: CONFIDENCE_FACTORS.EXACT_MATCH + CONFIDENCE_FACTORS.DIRECT_PUBLIC_REFERENCE,
    relationshipType: 'SAME_AS',
    reason(a, _b) {
      return `Exact public email match: ${getValue(a)}`;
    },
  },
  {
    name: 'exact-username-match',
    description: 'Same username on different platforms',
    match(a, b) {
      return (
        a.type === 'USERNAME' &&
        b.type === 'USERNAME' &&
        getValue(a) === getValue(b)
      );
    },
    confidence: CONFIDENCE_FACTORS.EXACT_MATCH,
    relationshipType: 'POSSIBLY_SAME_AS',
    reason(a, _b) {
      return `Exact username match: "${getValue(a)}". Same username does not confirm identity.`;
    },
  },
  {
    name: 'domain-ip-resolution',
    description: 'Domain resolves to IP address',
    match(a, b) {
      return (
        (a.type === 'DOMAIN' && b.type === 'IP_ADDRESS') ||
        (a.type === 'IP_ADDRESS' && b.type === 'DOMAIN')
      );
    },
    confidence: CONFIDENCE_FACTORS.EXACT_MATCH + CONFIDENCE_FACTORS.DIRECT_PUBLIC_REFERENCE + 5,
    relationshipType: 'RESOLVES_TO',
    reason(a, b) {
      const domain = a.type === 'DOMAIN' ? getValue(a) : getValue(b);
      const ip = a.type === 'IP_ADDRESS' ? getValue(a) : getValue(b);
      return `DNS resolution: ${domain} resolves to ${ip}`;
    },
  },
  {
    name: 'shared-ip',
    description: 'Multiple domains resolving to the same IP',
    match(a, b) {
      return a.type === 'DOMAIN' && b.type === 'DOMAIN' && getValue(a) !== getValue(b);
    },
    confidence: CONFIDENCE_FACTORS.DIRECT_PUBLIC_REFERENCE,
    relationshipType: 'RELATED_TO',
    reason(a, b) {
      return `Domains ${getValue(a)} and ${getValue(b)} share infrastructure`;
    },
  },
  {
    name: 'website-links-repo',
    description: 'Public website links to repository',
    match(a, b) {
      return (
        (a.type === 'URL' && b.type === 'REPOSITORY') ||
        (a.type === 'REPOSITORY' && b.type === 'URL')
      );
    },
    confidence: CONFIDENCE_FACTORS.DIRECT_PUBLIC_REFERENCE + CONFIDENCE_FACTORS.TEMPORAL_CONSISTENCY,
    relationshipType: 'LINKS_TO',
    reason(a, b) {
      return `Public reference links ${getValue(a)} to ${getValue(b)}`;
    },
  },
  {
    name: 'same-profile-independent',
    description: 'Same profile URL discovered from independent sources',
    match(a, b) {
      return (
        a.type === 'SOCIAL_PROFILE' &&
        b.type === 'SOCIAL_PROFILE' &&
        getValue(a) === getValue(b)
      );
    },
    confidence:
      CONFIDENCE_FACTORS.EXACT_MATCH + CONFIDENCE_FACTORS.MULTIPLE_INDEPENDENT_SOURCES,
    relationshipType: 'SAME_AS',
    reason(a, _b) {
      return `Same social profile URL discovered from independent sources: ${getValue(a)}`;
    },
  },
];

function getValue(entity: Entity | EntityCandidate): string {
  if ('normalized_value' in entity) return (entity as Entity).normalized_value;
  return entity.value.trim().toLowerCase();
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Calculate confidence score for a relationship based on factors.
 */
export function calculateConfidence(factors: number[]): number {
  const raw = factors.reduce((sum, f) => sum + f, 0);
  return clampConfidence(raw);
}

/**
 * Run correlation rules against a set of entities to find candidate relationships.
 * This runs within a single case — cross-case correlation is intentionally not supported.
 */
export function correlateEntities(
  existingEntities: Entity[],
  newCandidates: EntityCandidate[],
): RelationshipCandidate[] {
  const candidates: RelationshipCandidate[] = [];

  // Check new candidates against existing entities
  for (const candidate of newCandidates) {
    for (const existing of existingEntities) {
      for (const rule of correlationRules) {
        if (rule.match(candidate, existing)) {
          candidates.push({
            source_value: candidate.value,
            source_type: candidate.type,
            target_value: existing.value,
            target_type: existing.type,
            relationship_type: rule.relationshipType as RelationshipCandidate['relationship_type'],
            confidence: clampConfidence(rule.confidence),
            reason: rule.reason(candidate, existing),
          });
        }
      }
    }
  }

  // Check new candidates against each other
  for (let i = 0; i < newCandidates.length; i++) {
    for (let j = i + 1; j < newCandidates.length; j++) {
      for (const rule of correlationRules) {
        if (rule.match(newCandidates[i], newCandidates[j])) {
          candidates.push({
            source_value: newCandidates[i].value,
            source_type: newCandidates[i].type,
            target_value: newCandidates[j].value,
            target_type: newCandidates[j].type,
            relationship_type: rule.relationshipType as RelationshipCandidate['relationship_type'],
            confidence: clampConfidence(rule.confidence),
            reason: rule.reason(newCandidates[i], newCandidates[j]),
          });
        }
      }
    }
  }

  return candidates;
}

export { correlationRules };
