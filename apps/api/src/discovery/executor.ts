/**
 * Discovery Executor — orchestrates multi-transform discovery execution.
 *
 * Flow:
 * 1. Create seed entity (low confidence, SEED type)
 * 2. Build discovery plan
 * 3. Create DiscoveryJob + TransformRun records
 * 4. Execute each transform sequentially
 * 5. Filter seed echoes
 * 6. Persist entities, relationships, evidence
 * 7. Run correlation
 * 8. Update job progress
 * 9. Continue on failure — never abort the whole job for one transform
 */

import type {
  SeedType,
  TransformRun,
  DiscoveryProgressEvent,
  DiscoveryLogEntry,
  LogLevel,
} from '@nexusgraph/shared';
import { normalize } from '@nexusgraph/shared';
import { buildDiscoveryPlan } from './planner.js';
import { parseSeed } from './seed-classifier.js';
import { executeTransform } from '../transforms/adapter.js';
import { correlateEntities } from '../correlation/engine.js';
import {
  entityService,
  relationshipService,
  evidenceService,
  timelineService,
  discoveryJobService,
  transformRunService,
} from '../services/index.js';
import { logger, generateRequestId } from '../lib/logger.js';

export interface DiscoveryInput {
  caseId: string;
  userId: string;
  seedType: SeedType;
  seedValue: string;
  platforms?: string[];
  selectedTransforms?: string[];
  onProgress?: (event: DiscoveryProgressEvent) => void | Promise<void>;
}

export interface DiscoveryOutput {
  jobId: string;
  status: string;
  totalTransforms: number;
  completedTransforms: number;
  failedTransforms: number;
  notFoundTransforms: number;
  foundEntities: number;
  foundRelationships: number;
  foundEvidence: number;
  transformRuns: Array<{
    transformId: string;
    transformName: string;
    status: string;
    entitiesFound: number;
    relationshipsFound: number;
    error?: string;
  }>;
}

export async function runDiscovery(input: DiscoveryInput): Promise<DiscoveryOutput> {
  const { caseId, userId, seedType, seedValue, onProgress } = input;
  const requestId = generateRequestId();

  logger.info('Discovery started', { requestId, caseId, seedType, seedValue });

  // 1. Deterministically parse seed and extract immediate structural entities
  const parsed = parseSeed(seedType, seedValue);
  const seedEntity = await entityService.upsert(parsed.seedEntity, caseId, userId);

  // Map for tracking entities within this run
  const entityMap = new Map<string, string>();
  entityMap.set(normalize('SEED', seedValue), seedEntity.id);
  entityMap.set(normalize(seedType, seedValue), seedEntity.id);

  let totalEntities = 0;
  let totalRelationships = 0;
  let totalEvidence = 0;

  // Persist any deterministic derived entities (e.g. URL -> DOMAIN, EMAIL -> DOMAIN)
  for (const derived of parsed.derivedEntities) {
    try {
      const derivedEntity = await entityService.upsert(
        {
          type: derived.type,
          value: derived.value,
          title: `${derived.type}: ${derived.value}`,
          confidence: 85,
          metadata: {
            derivedFromSeed: seedValue,
            isDeterministicDerivation: true,
            source: {
              collector: 'deterministic-parser',
              transform: 'seed.deterministic-parse',
              derivedFrom: seedValue,
              collectedAt: new Date().toISOString(),
            },
          },
        },
        caseId,
        userId,
      );
      entityMap.set(normalize(derived.type, derived.value), derivedEntity.id);
      totalEntities++;

      await relationshipService.create(
        {
          source_entity_id: seedEntity.id,
          target_entity_id: derivedEntity.id,
          relationship_type: derived.relationshipType,
          confidence: 90,
          reason: derived.reason,
        },
        caseId,
        userId,
      );
      totalRelationships++;

      await evidenceService.create(
        {
          entity_id: derivedEntity.id,
          source_url: seedValue.startsWith('http') ? seedValue : undefined,
          source_type: 'MANUAL_INPUT',
          title: `Derived ${derived.type}: ${derived.value}`,
          extracted_value: derived.value,
          confidence: 90,
          metadata: {
            derivation: derived.reason,
            seedType,
            seedValue,
          },
          collector: 'seed-parser',
        },
        caseId,
        userId,
      );
      totalEvidence++;
    } catch (err) {
      logger.warn('Failed to persist derived seed entity', {
        requestId,
        derivedValue: derived.value,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  // 2. Build discovery plan strictly based on seed type
  let plan = buildDiscoveryPlan(seedType, seedValue);
  if (input.selectedTransforms && input.selectedTransforms.length > 0) {
    plan.transforms = plan.transforms.filter((t) => input.selectedTransforms!.includes(t.id));
  }

  logger.info('Discovery plan built', {
    requestId,
    transforms: plan.transforms.map((t) => t.id).join(', '),
    count: plan.transforms.length,
  });

  // 3. Create discovery job
  const job = await discoveryJobService.create({
    case_id: caseId,
    seed_entity_id: seedEntity.id,
    seed_value: seedValue,
    seed_type: seedType,
    total_transforms: plan.transforms.length,
  });

  let completedCount = 0;
  let failedCount = 0;
  let notFoundCount = 0;

  const emitProgress = (
    level: LogLevel,
    message: string,
    extra?: {
      type?: DiscoveryProgressEvent['type'];
      transformId?: string;
      transformName?: string;
      entityCount?: number;
      relationshipCount?: number;
      data?: Record<string, unknown>;
    },
  ) => {
    if (!onProgress) return;
    try {
      const logEntry: DiscoveryLogEntry = {
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: new Date().toISOString(),
        level,
        message,
        transformId: extra?.transformId,
        transformName: extra?.transformName,
        entityCount: extra?.entityCount,
        relationshipCount: extra?.relationshipCount,
        data: extra?.data,
      };

      onProgress({
        type: extra?.type || 'log',
        jobId: job.id,
        log: logEntry,
        totalTransforms: plan.transforms.length,
        completedTransforms: completedCount + failedCount + notFoundCount,
        foundEntities: totalEntities,
        foundRelationships: totalRelationships,
        foundEvidence: totalEvidence,
      });
    } catch {
      // Ignore callback errors
    }
  };

  // Emit discovery start log
  emitProgress('info', `Initializing OSINT Discovery for seed: "${seedValue}" [Type: ${seedType}]`, {
    type: 'discovery_start',
  });
  emitProgress('scan', `Registered investigation seed node in dossier graph (Initial confidence: 30%)`);
  if (parsed.derivedEntities.length > 0) {
    for (const d of parsed.derivedEntities) {
      emitProgress('found', `Extracted ${d.type}: "${d.value}"`);
    }
  }
  emitProgress(
    'info',
    `Discovery plan formulated: ${plan.transforms.length} automated transforms queued (${plan.transforms.map((t) => t.name).join(', ')})`,
  );

  // 4. Create transform run records
  const runRecords: Array<{ record: TransformRun; transformId: string; transformName: string }> = [];
  for (const transform of plan.transforms) {
    const record = await transformRunService.create({
      discovery_job_id: job.id,
      transform_id: transform.id,
      transform_name: transform.name,
    });
    runRecords.push({
      record: record as TransformRun,
      transformId: transform.id,
      transformName: transform.name,
    });
  }

  // Mark job as running
  await discoveryJobService.update(job.id, {
    status: 'RUNNING',
    started_at: new Date().toISOString(),
  });

  // 5. Execute transforms sequentially
  const transformResults: DiscoveryOutput['transformRuns'] = [];

  for (const { record, transformId, transformName } of runRecords) {
    // Mark transform as running
    await transformRunService.update(record.id, {
      status: 'RUNNING',
      started_at: new Date().toISOString(),
    });

    emitProgress('scan', `Executing transform: ${transformName}...`, {
      type: 'transform_start',
      transformId,
      transformName,
    });

    try {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 30_000);

      const result = await executeTransform(
        transformId,
        seedValue,
        seedType,
        seedValue,
        {
          caseId,
          signal: abortController.signal,
          requestId,
          platforms: input.platforms,
        },
      );

      clearTimeout(timeout);

      // Persist discovered entities
      let entityCount = 0;

      for (const candidate of result.entities) {
        try {
          const entity = await entityService.upsert(
            {
              type: candidate.type,
              value: candidate.value,
              title: candidate.title,
              confidence: candidate.confidence,
              metadata: {
                ...candidate.metadata,
                discoveredBy: transformId,
                discoveryJobId: job.id,
                source: candidate.metadata?.source || {
                  collector: transformId,
                  transform: transformId,
                  derivedFrom: seedValue,
                  collectedAt: new Date().toISOString(),
                },
              },
            },
            caseId,
            userId,
          );
          entityMap.set(normalize(candidate.type, candidate.value), entity.id);
          entityCount++;

          emitProgress(
            'found',
            `Discovered ${candidate.type}: "${candidate.value}" [${candidate.confidence || 50}% confidence]`,
            {
              transformId,
              transformName,
              data: { entityId: entity.id, type: candidate.type, value: candidate.value },
            },
          );
        } catch (err) {
          logger.warn('Failed to persist discovered entity', {
            requestId,
            transformId,
            value: candidate.value,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // Run correlation
      const existingEntities = await entityService.list(caseId, userId);
      const correlatedRelationships = correlateEntities(existingEntities, result.entities);

      // Persist relationships
      let relCount = 0;
      for (const rel of [...result.relationships, ...correlatedRelationships]) {
        try {
          const sourceNorm = normalize(rel.source_type, rel.source_value);
          const targetNorm = normalize(rel.target_type, rel.target_value);

          let sourceId = entityMap.get(sourceNorm);
          let targetId = entityMap.get(targetNorm);

          if (!sourceId) {
            const src = await entityService.findByNormalizedValue(sourceNorm, caseId, userId);
            sourceId = src?.id;
          }
          if (!targetId) {
            const tgt = await entityService.findByNormalizedValue(targetNorm, caseId, userId);
            targetId = tgt?.id;
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

            emitProgress(
              'found',
              `Linked: "${rel.source_value}" -> "${rel.target_value}" [${rel.relationship_type}]`,
              {
                transformId,
                transformName,
              },
            );
          }
        } catch (err) {
          logger.warn('Failed to persist relationship', {
            requestId,
            transformId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // Persist evidence
      let evCount = 0;
      for (const ev of result.evidence) {
        try {
          let associatedEntityId: string | undefined;
          if (ev.metadata?.domain && typeof ev.metadata.domain === 'string') {
            associatedEntityId = entityMap.get(normalize('DOMAIN', ev.metadata.domain));
          } else if (ev.metadata?.username && typeof ev.metadata.username === 'string') {
            associatedEntityId = entityMap.get(normalize('USERNAME', ev.metadata.username));
          } else if (ev.source_url) {
            associatedEntityId =
              entityMap.get(normalize('URL', ev.source_url)) ||
              entityMap.get(normalize('DOMAIN', ev.source_url));
          }
          if (!associatedEntityId) {
            associatedEntityId = seedEntity.id;
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
              metadata: {
                ...ev.metadata,
                transformId,
                discoveryJobId: job.id,
              },
              collector: transformId,
            },
            caseId,
            userId,
          );
          evCount++;
        } catch (err) {
          logger.warn('Failed to persist evidence', {
            requestId,
            transformId,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }

      // Determine final transform status
      const finalStatus = result.status;

      // Update transform run record
      await transformRunService.update(record.id, {
        status: finalStatus,
        completed_at: new Date().toISOString(),
        result_count: entityCount + relCount + evCount,
        entities_found: entityCount,
        relationships_found: relCount,
        error: result.error || null,
      });

      if (finalStatus === 'COMPLETED') {
        completedCount++;
        emitProgress(
          'success',
          `[${transformName}] Completed - ${entityCount} entities, ${relCount} relationships found`,
          {
            type: 'transform_complete',
            transformId,
            transformName,
            entityCount,
            relationshipCount: relCount,
          },
        );
      } else if (finalStatus === 'NOT_FOUND') {
        notFoundCount++;
        emitProgress(
          'info',
          `[${transformName}] Completed - 0 results found on this vector`,
          {
            type: 'transform_complete',
            transformId,
            transformName,
            entityCount: 0,
            relationshipCount: 0,
          },
        );
      } else {
        failedCount++;
        emitProgress(
          'warn',
          `[${transformName}] Completed with warning: ${result.error || 'Vector unavailable'}`,
          {
            type: 'transform_failed',
            transformId,
            transformName,
          },
        );
      }

      totalEntities += entityCount;
      totalRelationships += relCount;
      totalEvidence += evCount;

      transformResults.push({
        transformId,
        transformName,
        status: finalStatus,
        entitiesFound: entityCount,
        relationshipsFound: relCount,
        error: result.error,
      });

      // Update job progress
      await discoveryJobService.update(job.id, {
        completed_transforms: completedCount + failedCount + notFoundCount,
        found_entities: totalEntities,
        found_relationships: totalRelationships,
        found_evidence: totalEvidence,
        failed_transforms: failedCount,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Transform execution failed', {
        requestId,
        transformId,
        error: message,
      });

      await transformRunService.update(record.id, {
        status: 'FAILED',
        completed_at: new Date().toISOString(),
        error: message,
      });

      failedCount++;
      emitProgress('warn', `[${transformName}] Failed: ${message}`, {
        type: 'transform_failed',
        transformId,
        transformName,
      });

      transformResults.push({
        transformId,
        transformName,
        status: 'FAILED',
        entitiesFound: 0,
        relationshipsFound: 0,
        error: message,
      });

      // Continue — don't abort the whole job
      await discoveryJobService.update(job.id, {
        completed_transforms: completedCount + failedCount + notFoundCount,
        failed_transforms: failedCount,
      });
    }
  }

  // 6. Finalize job
  const finalStatus =
    failedCount === plan.transforms.length
      ? 'FAILED'
      : failedCount > 0 || notFoundCount > 0
        ? 'PARTIAL'
        : 'COMPLETED';

  await discoveryJobService.update(job.id, {
    status: finalStatus,
    completed_at: new Date().toISOString(),
    completed_transforms: completedCount + failedCount + notFoundCount,
    found_entities: totalEntities,
    found_relationships: totalRelationships,
    found_evidence: totalEvidence,
    failed_transforms: failedCount,
  });

  // Create timeline event
  await timelineService.create(
    {
      title: `Discovery ${finalStatus.toLowerCase()}`,
      description: `Ran ${plan.transforms.length} transforms. Found ${totalEntities} entities, ${totalRelationships} relationships. ${failedCount} failed, ${notFoundCount} not found.`,
      event_at: new Date().toISOString(),
    },
    caseId,
    userId,
  );

  emitProgress(
    'success',
    `OSINT Discovery Complete: ${totalEntities} entities, ${totalRelationships} relationships, ${totalEvidence} evidence items persisted.`,
    {
      type: 'discovery_complete',
    },
  );

  logger.info('Discovery completed', {
    requestId,
    caseId,
    jobId: job.id,
    status: finalStatus,
    totalEntities,
    totalRelationships,
    totalEvidence,
    failedCount,
    notFoundCount,
  });

  return {
    jobId: job.id,
    status: finalStatus,
    totalTransforms: plan.transforms.length,
    completedTransforms: completedCount,
    failedTransforms: failedCount,
    notFoundTransforms: notFoundCount,
    foundEntities: totalEntities,
    foundRelationships: totalRelationships,
    foundEvidence: totalEvidence,
    transformRuns: transformResults,
  };
}
