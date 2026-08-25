/**
 * Dork Generator Collector (Mr.Holmes integration)
 *
 * Ported from Mr.Holmes (Lucksi/Mr.Holmes, GPL-3.0) Google/Yandex dork
 * generation for websites and domain investigations.
 *
 * Excluded for personal identity seeds (USERNAME, EMAIL, PHONE, PERSON, NAME, SOCIAL_PROFILE)
 * to keep the investigation graph strictly focused on verified OSINT intelligence.
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
  SeedType,
} from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';
import { MR_HOLMES_DORK_GROUPS } from './data/mrholmes-dorks.generated.js';

const CATEGORY_BY_SEED: Record<SeedType, string[]> = {
  DOMAIN: ['username'],
  URL: ['username'],
  USERNAME: [],
  PERSON: [],
  NAME: [],
  EMAIL: [],
  PHONE: [],
  IP_ADDRESS: [],
  ORGANIZATION: [],
  SOCIAL_PROFILE: [],
};

export function inferDorkSeedType(seed: string): SeedType {
  if (/^https?:\/\//i.test(seed)) return 'URL';
  return 'DOMAIN';
}

export function buildDorkUrls(categories: string[], seed: string): { url: string; engine: string; category: string }[] {
  const encoded = encodeURIComponent(seed);
  const urls: { url: string; engine: string; category: string }[] = [];
  const seen = new Set<string>();
  for (const group of MR_HOLMES_DORK_GROUPS) {
    if (!categories.includes(group.category)) continue;
    for (const template of group.templates) {
      const url = template.replace(/\{\}/g, encoded);
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push({ url, engine: group.engine, category: group.category });
    }
  }
  return urls;
}

function seedTypeToEntityType(seedType: SeedType): EntityCandidate['type'] {
  return seedType === 'NAME' ? 'PERSON' : seedType;
}

export const dorkGeneratorCollector: Collector = {
  name: 'dork-generator',

  supports(inputType: string): boolean {
    return (CATEGORY_BY_SEED[inputType as SeedType] ?? []).length > 0;
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const seed = input.trim();
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    if (seed.length < 2 || seed.length > 200) {
      warnings.push(`Invalid dork seed: "${input}".`);
      return { source: 'mrholmes-dork-generator', collectedAt, entities, relationships, evidence, warnings };
    }

    const seedType = inferDorkSeedType(seed);
    const categories = CATEGORY_BY_SEED[seedType] ?? [];
    if (!categories.length) {
      warnings.push(`No dork templates configured for seed type ${seedType}.`);
      return { source: 'mrholmes-dork-generator', collectedAt, entities, relationships, evidence, warnings };
    }

    const dorks = buildDorkUrls(categories, seed);

    logger.info('Mr.Holmes dork generator started', {
      requestId: ctx.requestId,
      categories,
      dorkCount: dorks.length,
    });

    logger.debug('Dork generation context', { requestId: ctx.requestId, caseId: ctx.caseId, seedType });

    for (const dork of dorks) {
      entities.push({
        type: 'URL',
        value: dork.url,
        title: `Dork [${dork.engine}/website]`,
        confidence: 100,
        metadata: {
          kind: 'SEARCH_DORK',
          engine: dork.engine,
          category: 'website',
          source: {
            url: dork.url,
            collector: 'dork-generator',
            transform: 'mrholmes.generate-dorks',
            derivedFrom: seed,
            collectedAt,
          },
        },
      });

      relationships.push({
        source_value: seed,
        source_type: seedTypeToEntityType(seedType),
        target_value: dork.url,
        target_type: 'URL',
        relationship_type: 'LINKS_TO',
        confidence: 100,
        reason: `Deterministic ${dork.engine} website dork URL generated for domain/URL reconnaissance.`,
      });

      evidence.push({
        source_url: dork.url,
        source_type: 'DORK_TEMPLATE',
        title: `${dork.engine} website dork`,
        extracted_value: dork.url,
        confidence: 100,
        metadata: {
          engine: dork.engine,
          category: 'website',
          deterministic: true,
        },
      });
    }

    return {
      source: 'mrholmes-dork-generator',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
