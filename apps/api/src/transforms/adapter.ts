/**
 * Transform Adapter — wraps existing collectors as transforms.
 * Maps transform IDs → collector calls, filters seed echoes, and returns structured results with provenance.
 */

import type {
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
  TransformResult,
  SeedType,
} from '@nexusgraph/shared';
import { runCollector } from '../collectors/registry.js';
import { logger } from '../lib/logger.js';

/** Mapping from transform ID → collector(s) + input derivation */
interface TransformHandler {
  /** Derive the collector input from the entity value and seed context */
  deriveInput(entityValue: string, seedType: SeedType): string | null;
  /** Which collector(s) to invoke */
  collectors: Array<{
    name: string;
    /** Optional: override input derivation for this specific collector */
    deriveInput?: (entityValue: string, seedType: SeedType) => string | null;
  }>;
}

const TRANSFORM_HANDLERS: Record<string, TransformHandler> = {
  'web.discover-official-site': {
    deriveInput: (v, st) => (st === 'ORGANIZATION' || st === 'PERSON' || st === 'NAME' ? v.trim() : null),
    collectors: [{ name: 'web-search' }],
  },
  'domain.resolve-dns': {
    deriveInput: (v) => extractDomain(v),
    collectors: [{ name: 'dns' }],
  },
  'domain.find-tls': {
    deriveInput: (v) => extractDomain(v),
    collectors: [{ name: 'tls-certificate' }],
  },
  'domain.webpage-metadata': {
    deriveInput: (v) => {
      const trimmed = v.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      const d = extractDomain(trimmed);
      return d ? `https://${d}` : null;
    },
    collectors: [{ name: 'url-metadata' }],
  },
  'social.discover-public-profiles': {
    deriveInput: (v, st) => (st === 'USERNAME' ? v.trim().replace(/^@/, '') : null),
    collectors: [{ name: 'username-presence' }],
  },
  'social.youtube-channel': {
    deriveInput: (v, st) =>
      st === 'USERNAME' || st === 'ORGANIZATION' || st === 'PERSON' || st === 'NAME'
        ? v.trim().replace(/^@/, '')
        : null,
    collectors: [{ name: 'youtube-public' }],
  },
  'developer.github-profile': {
    deriveInput: (v, st) =>
      st === 'USERNAME' || st === 'ORGANIZATION' || st === 'EMAIL' || st === 'PERSON' || st === 'NAME'
        ? v.trim()
        : null,
    collectors: [{ name: 'github-public' }],
  },
  'developer.gitlab-profile': {
    deriveInput: (v, st) =>
      st === 'USERNAME' || st === 'ORGANIZATION' || st === 'PERSON' || st === 'NAME'
        ? v.trim().replace(/^@/, '')
        : null,
    collectors: [{ name: 'gitlab-public' }],
  },
  'contact.find-official-contact': {
    deriveInput: (v) => {
      const trimmed = v.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      const d = extractDomain(trimmed);
      return d ? `https://${d}` : null;
    },
    collectors: [{ name: 'url-metadata' }],
  },
  'mentions.search-public-web': {
    deriveInput: (v, st) =>
      st === 'ORGANIZATION' || st === 'USERNAME' || st === 'DOMAIN' || st === 'PERSON' || st === 'NAME'
        ? v.trim()
        : null,
    collectors: [{ name: 'web-search' }],
  },
};

/** Extract domain from various value formats */
function extractDomain(value: string): string {
  const v = value.trim();
  // URL → hostname
  try {
    if (v.startsWith('http://') || v.startsWith('https://')) {
      return new URL(v).hostname;
    }
  } catch { /* not a URL */ }
  // Email → domain
  if (v.includes('@') && !v.startsWith('http')) {
    return v.split('@').pop()!;
  }
  // Strip path or port if any
  return v.split('/')[0].split(':')[0];
}

/** Extract username/handle from various value formats */
function extractUsername(value: string): string {
  const v = value.trim();
  // Email → local part
  if (v.includes('@') && !v.startsWith('http')) {
    return v.split('@')[0];
  }
  // Strip @ prefix
  if (v.startsWith('@')) return v.slice(1);
  return v;
}

/**
 * Filter out entities that merely echo the original seed value.
 * This is critical — the seed must NOT be returned as a "discovery".
 */
function filterSeedEchoes(
  entities: EntityCandidate[],
  seedValue: string,
): EntityCandidate[] {
  const seedNorm = seedValue.trim().toLowerCase();
  return entities.filter((e) => {
    const eNorm = e.value.trim().toLowerCase();
    // Reject exact match
    if (eNorm === seedNorm) return false;
    // Reject if it's just the seed with spaces/case changes
    if (eNorm.replace(/[\s\-_]/g, '') === seedNorm.replace(/[\s\-_]/g, '')) return false;
    return true;
  });
}

/**
 * Execute a transform by ID against an entity value.
 * Returns structured results with seed echoes filtered out and provenance attached.
 */
export async function executeTransform(
  transformId: string,
  entityValue: string,
  seedType: SeedType,
  seedValue: string,
  ctx: CollectorContext,
): Promise<TransformResult> {
  const handler = TRANSFORM_HANDLERS[transformId];
  if (!handler) {
    return {
      transformId,
      status: 'FAILED',
      entities: [],
      relationships: [],
      evidence: [],
      warnings: [],
      error: `No handler registered for transform: ${transformId}`,
    };
  }

  const allEntities: EntityCandidate[] = [];
  const allRelationships: RelationshipCandidate[] = [];
  const allEvidence: EvidenceCandidate[] = [];
  const allWarnings: string[] = [];

  for (const col of handler.collectors) {
    const input = col.deriveInput
      ? col.deriveInput(entityValue, seedType)
      : handler.deriveInput(entityValue, seedType);

    if (!input) {
      // Skipped because input type is not suitable for this transform
      continue;
    }

    try {
      const result: CollectorResult = await runCollector(
        col.name as any,
        input,
        ctx,
      );
      allEntities.push(...result.entities);
      allRelationships.push(...result.relationships);
      allEvidence.push(...result.evidence);
      allWarnings.push(...result.warnings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Transform collector failed', {
        requestId: ctx.requestId,
        transformId,
        collector: col.name,
        error: msg,
      });
      allWarnings.push(`${col.name}: ${msg}`);
    }
  }

  // Filter out seed echoes
  const filtered = filterSeedEchoes(allEntities, seedValue);

  const status = filtered.length > 0
    ? 'COMPLETED'
    : allWarnings.some((w) => w.includes('error') || w.includes('Error') || w.includes('failed'))
      ? 'FAILED'
      : 'NOT_FOUND';

  return {
    transformId,
    status,
    entities: filtered,
    relationships: allRelationships,
    evidence: allEvidence,
    warnings: allWarnings,
  };
}

export { filterSeedEchoes, extractDomain, extractUsername };

