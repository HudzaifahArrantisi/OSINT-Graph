import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import {
  createInvestigationSchema,
  updateInvestigationSchema,
  createEntitySchema,
  createRelationshipSchema,
  createEvidenceSchema,
  createTimelineEventSchema,
  createNoteSchema,
  updateNoteSchema,
  runCollectorSchema,
  startDiscoverySchema,
  runTransformSchema,
} from '@nexusgraph/shared';
import {
  investigationService,
  entityService,
  relationshipService,
  evidenceService,
  timelineService,
  noteService,
  graphService,
  searchService,
  collectorRunService,
  exportService,
  discoveryJobService,
  transformRunService,
} from '../services/index.js';
import { runPipeline } from '../collectors/pipeline.js';
import { getAvailableCollectors } from '../collectors/registry.js';
import {
  getAllTransforms,
  getTransformsForInput,
  getTransform,
  getTransformsGroupedByCategory,
} from '../transforms/registry.js';
import { executeTransform } from '../transforms/adapter.js';
import { runDiscovery } from '../discovery/executor.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { rateLimitMiddleware } from '../middleware/index.js';
import { findShortestPath } from '../correlation/pathfinder.js';
import { logger } from '../lib/logger.js';

const api = new Hono();

// ─── Auth ───────────────────────────────────────────────────────────

api.get('/me', async (c) => {
  return c.json({
    data: {
      id: c.get('userId'),
      email: c.get('userEmail'),
    },
  });
});

// ─── Investigations ─────────────────────────────────────────────────

api.get('/investigations', async (c) => {
  const userId = c.get('userId');
  const data = await investigationService.list(userId);
  return c.json({ data });
});

api.post('/investigations', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const parsed = createInvestigationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  const data = await investigationService.create(parsed.data, userId);
  return c.json({ data }, 201);
});

api.get('/investigations/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const data = await investigationService.getById(id, userId);

  if (!data) {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }

  return c.json({ data });
});

api.patch('/investigations/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = updateInvestigationSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await investigationService.update(id, parsed.data, userId);
    return c.json({ data });
  } catch (err) {
    return c.json(
      { error: 'Not Found', message: 'Investigation not found or access denied', statusCode: 404 },
      404,
    );
  }
});

api.delete('/investigations/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  try {
    await investigationService.delete(id, userId);
    return c.json({ data: { deleted: true } });
  } catch (err) {
    return c.json(
      { error: 'Not Found', message: 'Investigation not found or access denied', statusCode: 404 },
      404,
    );
  }
});

api.post('/investigations/bulk-delete', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const ids = Array.isArray(body.ids) ? body.ids : [];

  try {
    const count = await investigationService.bulkDelete(ids, userId);
    return c.json({ data: { deletedCount: count } });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

api.post('/investigations/:id/reset', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');

  try {
    await investigationService.resetCase(id, userId);
    return c.json({ data: { reset: true } });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

// ─── Entities ───────────────────────────────────────────────────────

api.get('/investigations/:id/entities', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await entityService.list(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.post('/investigations/:id/entities', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createEntitySchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await entityService.upsert(parsed.data, caseId, userId);
    return c.json({ data }, 201);
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

api.delete('/investigations/:id/entities/by-type/:type', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const type = c.req.param('type');

  try {
    const count = await entityService.deleteByType(caseId, type, userId);
    return c.json({ data: { deletedCount: count } });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

api.delete('/investigations/:id/entities/:entityId', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const entityId = c.req.param('entityId');

  try {
    await entityService.delete(entityId, caseId, userId);
    return c.json({ data: { deleted: true } });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

api.delete('/investigations/:id/seeds/:seedEntityId', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const seedEntityId = c.req.param('seedEntityId');

  try {
    const result = await entityService.deleteSeed(caseId, seedEntityId, userId);
    return c.json({ data: result });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed to delete seed and connected graph', statusCode: 400 }, 400);
  }
});

// ─── Relationships ──────────────────────────────────────────────────

api.get('/investigations/:id/relationships', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await relationshipService.list(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.post('/investigations/:id/relationships', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createRelationshipSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await relationshipService.create(parsed.data, caseId, userId);
    return c.json({ data }, 201);
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

// ─── Evidence ───────────────────────────────────────────────────────

api.get('/investigations/:id/evidence', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await evidenceService.list(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.post('/investigations/:id/evidence', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createEvidenceSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await evidenceService.create(parsed.data, caseId, userId);
    return c.json({ data }, 201);
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

// ─── Timeline ───────────────────────────────────────────────────────

api.get('/investigations/:id/timeline', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await timelineService.list(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.post('/investigations/:id/timeline', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createTimelineEventSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await timelineService.create(parsed.data, caseId, userId);
    return c.json({ data }, 201);
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

// ─── Notes ──────────────────────────────────────────────────────────

api.get('/investigations/:id/notes', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await noteService.list(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.post('/investigations/:id/notes', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const body = await c.req.json();
  const parsed = createNoteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await noteService.create(parsed.data, caseId, userId);
    return c.json({ data }, 201);
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

api.patch('/investigations/:id/notes/:noteId', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const noteId = c.req.param('noteId');
  const body = await c.req.json();
  const parsed = updateNoteSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
      400,
    );
  }

  try {
    const data = await noteService.update(noteId, parsed.data.content, caseId, userId);
    return c.json({ data });
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

api.delete('/investigations/:id/notes/:noteId', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const noteId = c.req.param('noteId');

  try {
    await noteService.delete(noteId, caseId, userId);
    return c.json({ data: { deleted: true } });
  } catch (err) {
    return c.json(
      { error: 'Error', message: err instanceof Error ? err.message : 'Failed', statusCode: 400 },
      400,
    );
  }
});

// ─── Graph ──────────────────────────────────────────────────────────

api.get('/investigations/:id/graph', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await graphService.getGraphPayload(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.get('/investigations/:id/graph/path', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const from = c.req.query('from');
  const to = c.req.query('to');

  if (!from || !to) {
    return c.json(
      { error: 'Validation Error', message: 'Both "from" and "to" query parameters are required', statusCode: 400 },
      400,
    );
  }

  try {
    const data = await findShortestPath(caseId, from, to, userId);
    return c.json({ data });
  } catch (err: any) {
    const status = err.message?.includes('not found') ? 404 : 400;
    return c.json(
      { error: 'Error', message: err.message || 'Path finder failed', statusCode: status },
      status,
    );
  }
});

// ─── Collectors ─────────────────────────────────────────────────────

api.post(
  '/investigations/:id/collect',
  rateLimitMiddleware(20, 3600_000), // 20 per hour
  async (c) => {
    const userId = c.get('userId');
    const caseId = c.req.param('id') || '';
    const body = await c.req.json();
    const parsed = runCollectorSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
        400,
      );
    }

    try {
      const result = await runPipeline({
        caseId,
        userId,
        seedType: parsed.data.seed_type,
        seedValue: parsed.data.seed_value,
        collectors: parsed.data.collectors,
      });

      return c.json({ data: result });
    } catch (err) {
      return c.json(
        { error: 'Error', message: err instanceof Error ? err.message : 'Collection failed', statusCode: 500 },
        500,
      );
    }
  },
);

api.get('/investigations/:id/collector-runs', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await collectorRunService.list(caseId, userId);
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.get('/collectors/available', async (c) => {
  const seedType = c.req.query('seed_type');
  if (seedType) {
    const available = getAvailableCollectors(seedType as any);
    return c.json({ data: available });
  }
  return c.json({
    data: ['dns', 'url-metadata', 'tls-certificate', 'github-public', 'username-presence', 'gitlab-public', 'youtube-public', 'web-search'],
  });
});

// ─── Transforms & Discovery ─────────────────────────────────────────

api.get('/transforms', async (c) => {
  const inputType = c.req.query('inputType') || c.req.query('input_type');
  if (inputType) {
    const transforms = getTransformsForInput(inputType as any);
    return c.json({ data: transforms });
  }
  return c.json({ data: getAllTransforms() });
});

api.get('/transforms/categories', async (c) => {
  const inputType = c.req.query('inputType') || c.req.query('input_type');
  const grouped = getTransformsGroupedByCategory(inputType as any);
  return c.json({ data: grouped });
});

api.post(
  '/investigations/:id/discover',
  rateLimitMiddleware(10, 3600_000), // 10 per hour
  async (c) => {
    const userId = c.get('userId');
    const caseId = c.req.param('id') || '';
    const body = await c.req.json();
    const parsed = startDiscoverySchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
        400,
      );
    }

    try {
      const result = await runDiscovery({
        caseId,
        userId,
        seedType: parsed.data.seed_type,
        seedValue: parsed.data.seed_value,
      });

      return c.json({ data: result });
    } catch (err) {
      return c.json(
        {
          error: 'Error',
          message: err instanceof Error ? err.message : 'Discovery failed',
          statusCode: 500,
        },
        500,
      );
    }
  },
);

api.post(
  '/investigations/:id/discover/stream',
  rateLimitMiddleware(10, 3600_000),
  async (c) => {
    const userId = c.get('userId');
    const caseId = c.req.param('id') || '';
    const body = await c.req.json();
    const parsed = startDiscoverySchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
        400,
      );
    }

    return streamSSE(c, async (stream) => {
      try {
        await runDiscovery({
          caseId,
          userId,
          seedType: parsed.data.seed_type,
          seedValue: parsed.data.seed_value,
          onProgress: async (event) => {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            });
          },
        });
      } catch (err: any) {
        await stream.writeSSE({
          event: 'error',
          data: JSON.stringify({
            message: err.message || 'Discovery failed',
          }),
        });
      }
    });
  },
);

api.get('/investigations/:id/discover/plan', async (c) => {
  const seedType = c.req.query('seed_type') as any || 'ORGANIZATION';
  const seedValue = c.req.query('seed_value') || '';
  const plan = buildDiscoveryPlan(seedType, seedValue);
  return c.json({ data: plan });
});

api.get('/investigations/:id/discoveries', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const jobs = await discoveryJobService.list(caseId, userId);
    return c.json({ data: jobs });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

api.get('/investigations/:id/discoveries/:jobId', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id') || '';
  const jobId = c.req.param('jobId') || '';

  try {
    const job = await discoveryJobService.getById(jobId, caseId, userId);
    if (!job) {
      return c.json({ error: 'Not Found', message: 'Discovery job not found', statusCode: 404 }, 404);
    }
    const runs = await transformRunService.listByJob(jobId);
    return c.json({ data: { ...job, runs } });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

api.get('/investigations/:id/entities/:entityId/transforms', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id') || '';
  const entityId = c.req.param('entityId') || '';

  try {
    const entity = await entityService.getById(entityId, caseId, userId);
    if (!entity) {
      return c.json({ error: 'Not Found', message: 'Entity not found', statusCode: 404 }, 404);
    }

    const transforms = getTransformsForInput(entity.type);
    const grouped = getTransformsGroupedByCategory(entity.type);
    return c.json({ data: { transforms, grouped, entity } });
  } catch (err: any) {
    return c.json({ error: 'Error', message: err.message || 'Failed', statusCode: 400 }, 400);
  }
});

api.post(
  '/investigations/:id/transforms/:transformId/run',
  rateLimitMiddleware(20, 3600_000),
  async (c) => {
    const userId = c.get('userId');
    const caseId = c.req.param('id') || '';
    const transformId = c.req.param('transformId') || '';
    const body = await c.req.json();
    const parsed = runTransformSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: 'Validation Error', message: parsed.error.message, statusCode: 400 },
        400,
      );
    }

    try {
      const entity = await entityService.getById(parsed.data.entity_id, caseId, userId);
      if (!entity) {
        return c.json({ error: 'Not Found', message: 'Entity not found', statusCode: 404 }, 404);
      }

      const transform = getTransform(transformId);
      if (!transform) {
        return c.json({ error: 'Not Found', message: `Transform ${transformId} not found`, statusCode: 404 }, 404);
      }

      const result = await executeTransform(
        transformId,
        entity.value,
        entity.type as any,
        entity.value,
        {
          caseId,
          signal: AbortSignal.timeout(30_000),
          requestId: `manual-${Date.now()}`,
        },
      );

      // Persist results
      let entityCount = 0;
      for (const candidate of result.entities) {
        await entityService.upsert(
          {
            type: candidate.type,
            value: candidate.value,
            title: candidate.title,
            confidence: candidate.confidence,
            metadata: { ...candidate.metadata, manualTransform: transformId },
          },
          caseId,
          userId,
        );
        entityCount++;
      }

      return c.json({
        data: {
          transformId,
          status: result.status,
          entitiesFound: entityCount,
          relationshipsFound: result.relationships.length,
          evidenceFound: result.evidence.length,
        },
      });
    } catch (err: any) {
      return c.json({ error: 'Error', message: err.message || 'Transform execution failed', statusCode: 500 }, 500);
    }
  },
);

// ─── Search ─────────────────────────────────────────────────────────

api.get('/investigations/:id/search', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');
  const q = c.req.query('q') || '';
  const type = c.req.query('type');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  if (!q) {
    return c.json({ error: 'Validation Error', message: 'Query parameter "q" is required', statusCode: 400 }, 400);
  }

  try {
    const data = await searchService.search(caseId, q, userId, { type, limit, offset });
    return c.json({ data });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

// ─── Export ─────────────────────────────────────────────────────────

api.get('/investigations/:id/export/json', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const data = await exportService.exportJson(caseId, userId);
    c.header('Content-Type', 'application/json');
    c.header('Content-Disposition', `attachment; filename="investigation-${caseId}.json"`);
    return c.json(data);
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.get('/investigations/:id/export/csv', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const csv = await exportService.exportCsv(caseId, userId);
    return c.body(csv, 200, {
      'Content-Type': 'text/csv; charset=UTF-8',
      'Content-Disposition': `attachment; filename="investigation-${caseId}.csv"`,
    });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

api.get('/investigations/:id/export/markdown', async (c) => {
  const userId = c.get('userId');
  const caseId = c.req.param('id');

  try {
    const md = await exportService.exportMarkdown(caseId, userId);
    return c.body(md, 200, {
      'Content-Type': 'text/markdown; charset=UTF-8',
      'Content-Disposition': `attachment; filename="investigation-${caseId}.md"`,
    });
  } catch {
    return c.json({ error: 'Not Found', message: 'Investigation not found', statusCode: 404 }, 404);
  }
});

// ─── System & Execution Live Logs ───────────────────────────────────

api.get('/system/logs', (c) => {
  const buffer = logger.getBuffer();
  return c.json({ data: buffer });
});

api.delete('/system/logs', (c) => {
  logger.clearBuffer();
  return c.json({ data: { message: 'Logs buffer cleared' } });
});

api.get('/system/logs/stream', async (c) => {
  return streamSSE(c, async (stream) => {
    // 1. Send recent buffered history
    const buffer = logger.getBuffer();
    if (buffer.length > 0) {
      await stream.writeSSE({
        event: 'history',
        data: JSON.stringify(buffer),
      });
    }

    // 2. Stream new logs in real-time
    const onNewLog = async (entry: any) => {
      try {
        await stream.writeSSE({
          event: 'log',
          data: JSON.stringify(entry),
        });
      } catch {
        // stream may be closed
      }
    };

    logger.onLog(onNewLog);

    // 3. Heartbeat ping loop
    const pingInterval = setInterval(async () => {
      try {
        await stream.writeSSE({
          event: 'ping',
          data: JSON.stringify({ ping: Date.now() }),
        });
      } catch {
        clearInterval(pingInterval);
        logger.offLog(onNewLog);
      }
    }, 15000);

    stream.onAbort(() => {
      clearInterval(pingInterval);
      logger.offLog(onNewLog);
    });

    // Keep stream open until abort
    await new Promise<void>((resolve) => {
      stream.onAbort(() => {
        clearInterval(pingInterval);
        logger.offLog(onNewLog);
        resolve();
      });
    });
  });
});

export { api };

