/**
 * Collector Pipeline — orchestrates the full collection flow:
 * Collector → Validate → Normalize → Deduplicate → Correlate → Persist → Graph refresh
 */

import type { CollectorName, SeedType, CollectorResult } from '@nexusgraph/shared';
import { normalize } from '@nexusgraph/shared';
import { runCollector } from '../collectors/registry.js';
import { correlateEntities } from '../correlation/engine.js';
import {
  entityService,
  relationshipService,
  evidenceService,
  timelineService,
  collectorRunService,
} from '../services/index.js';
import { logger, generateRequestId } from '../lib/logger.js';

export interface PipelineInput {
  caseId: string;
  userId: string;
  seedType: SeedType;
  seedValue: string;
  collectors: CollectorName[];
}

export interface PipelineResult {
  totalEntities: number;
  totalRelationships: number;
  totalEvidence: number;
  warnings: string[];
  collectorRuns: Array<{
    collector: string;
    status: string;
    entityCount: number;
    relationshipCount: number;
    evidenceCount: number;
  }>;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { caseId, userId, seedType, seedValue, collectors } = input;
  const requestId = generateRequestId();
  const warnings: string[] = [];
  const runs: PipelineResult['collectorRuns'] = [];
  let totalEntities = 0;
  let totalRelationships = 0;
  let totalEvidence = 0;

  logger.info('Pipeline started', {
    requestId,
    caseId,
    seedType,
    collectors: collectors.join(','),
  });

  // Create seed entity first
  const seedEntityType = seedType === 'SOCIAL_PROFILE' ? 'SOCIAL_PROFILE' : seedType;
  await entityService.upsert(
    {
      type: seedEntityType as any,
      value: seedValue,
      confidence: 95,
      metadata: { isSeed: true, seedType },
    },
    caseId,
    userId,
  );

  // Run each collector
  for (const collectorName of collectors) {
    const runRecord = await collectorRunService.create({
      case_id: caseId,
      collector: collectorName,
      status: 'RUNNING',
      request_id: requestId,
      input_type: seedType,
      input_summary: seedValue.slice(0, 100),
    });

    try {
      const abortController = new AbortController();
      // 30 second timeout per collector
      const timeout = setTimeout(() => abortController.abort(), 30_000);

      const result: CollectorResult = await runCollector(collectorName, seedValue, {
        caseId,
        signal: abortController.signal,
        requestId,
      });

      clearTimeout(timeout);

      // Get existing entities for correlation
      const existingEntities = await entityService.list(caseId, userId);

      // Run correlation on new candidates
      const correlatedRelationships = correlateEntities(existingEntities, result.entities);

      // Persist entities
      let entityCount = 0;
      const entityMap = new Map<string, string>(); // value → entity id

      for (const candidate of result.entities) {
        try {
          const entity = await entityService.upsert(
            {
              type: candidate.type,
              value: candidate.value,
              title: candidate.title,
              confidence: candidate.confidence,
              metadata: candidate.metadata,
            },
            caseId,
            userId,
          );
          entityMap.set(normalize(candidate.type, candidate.value), entity.id);
          entityCount++;
        } catch (err) {
          logger.warn('Failed to persist entity', {
            requestId,
            value: candidate.value,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // Persist collector-generated relationships
      let relCount = 0;
      for (const rel of [...result.relationships, ...correlatedRelationships]) {
        try {
          const sourceNorm = normalize(rel.source_type, rel.source_value);
          const targetNorm = normalize(rel.target_type, rel.target_value);

          // Look up entity IDs
          let sourceId = entityMap.get(sourceNorm);
          let targetId = entityMap.get(targetNorm);

          // If not in map, look up from DB
          if (!sourceId) {
            const sourceEntity = await entityService.findByNormalizedValue(
              sourceNorm,
              caseId,
              userId,
            );
            sourceId = sourceEntity?.id;
          }
          if (!targetId) {
            const targetEntity = await entityService.findByNormalizedValue(
              targetNorm,
              caseId,
              userId,
            );
            targetId = targetEntity?.id;
          }

          if (sourceId && targetId && sourceId !== targetId) {
            await relationshipService.create(
              {
                source_entity_id: sourceId,
                target_entity_id: targetId,
                relationship_type: rel.relationship_type,
                confidence: rel.confidence,
                reason: rel.reason,
              },
              caseId,
              userId,
            );
            relCount++;
          }
        } catch (err) {
          logger.warn('Failed to persist relationship', {
            requestId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // Persist evidence with entity linkage
      let evCount = 0;
      for (const ev of result.evidence) {
        try {
          // Identify associated entity ID
          let associatedEntityId: string | undefined = undefined;
          if (ev.metadata?.domain && typeof ev.metadata.domain === 'string') {
            associatedEntityId = entityMap.get(normalize('DOMAIN', ev.metadata.domain));
          } else if (ev.metadata?.username && typeof ev.metadata.username === 'string') {
            associatedEntityId = entityMap.get(normalize('USERNAME', ev.metadata.username));
          } else if (ev.source_url) {
            associatedEntityId = entityMap.get(normalize('URL', ev.source_url)) || entityMap.get(normalize('DOMAIN', ev.source_url));
          }

          // Fallback to seed entity if single entity case
          if (!associatedEntityId) {
            associatedEntityId = entityMap.get(normalize(seedType, seedValue));
          }

          await evidenceService.create(
            {
              entity_id: associatedEntityId,
              source_url: ev.source_url,
              source_type: ev.source_type,
              title: ev.title,
              extracted_value: ev.extracted_value,
              content_hash: ev.content_hash,
              confidence: ev.confidence,
              metadata: ev.metadata,
              collector: collectorName,
            },
            caseId,
            userId,
          );
          evCount++;
        } catch (err) {
          logger.warn('Failed to persist evidence', {
            requestId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // Create timeline events for significant findings
      if (entityCount > 0) {
        await timelineService.create(
          {
            title: `${collectorName} collector completed`,
            description: `Discovered ${entityCount} entities, ${relCount} relationships, ${evCount} evidence items`,
            event_at: new Date().toISOString(),
          },
          caseId,
          userId,
        );
      }

      // Update collector run record
      await collectorRunService.update(runRecord.id, {
        status: 'COMPLETED',
        finished_at: new Date().toISOString(),
        result_count: entityCount + relCount + evCount,
        warning_count: result.warnings.length,
      });

      totalEntities += entityCount;
      totalRelationships += relCount;
      totalEvidence += evCount;
      warnings.push(...result.warnings);

      runs.push({
        collector: collectorName,
        status: 'COMPLETED',
        entityCount,
        relationshipCount: relCount,
        evidenceCount: evCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Collector pipeline error', {
        requestId,
        collector: collectorName,
        error: message,
      });

      await collectorRunService.update(runRecord.id, {
        status: 'FAILED',
        finished_at: new Date().toISOString(),
        error_message: message,
      });

      warnings.push(`${collectorName}: ${message}`);
      runs.push({
        collector: collectorName,
        status: 'FAILED',
        entityCount: 0,
        relationshipCount: 0,
        evidenceCount: 0,
      });
    }
  }

  logger.info('Pipeline completed', {
    requestId,
    caseId,
    totalEntities,
    totalRelationships,
    totalEvidence,
    warningCount: warnings.length,
  });

  return {
    totalEntities,
    totalRelationships,
    totalEvidence,
    warnings,
    collectorRuns: runs,
  };
}
