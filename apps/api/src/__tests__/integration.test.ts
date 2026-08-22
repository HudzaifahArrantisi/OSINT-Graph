import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { api } from '../routes/index.js';
import {
  requestIdMiddleware,
  errorHandlerMiddleware,
  corsMiddleware,
} from '../middleware/index.js';
import {
  investigationService,
  exportService,
} from '../services/index.js';

// Setup mock test app
function createTestApp(userId = 'test-user-123', userEmail = 'analyst@test.com') {
  const app = new Hono();
  app.use('*', corsMiddleware);
  app.use('*', requestIdMiddleware);
  app.use('*', errorHandlerMiddleware);

  // Health check (public)
  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Authenticated routes middleware mock
  app.use('/api/v1/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Missing or invalid Authorization header',
          statusCode: 401,
        },
        401,
      );
    }

    const token = authHeader.slice(7);
    if (token === 'invalid-token') {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          statusCode: 401,
        },
        401,
      );
    }

    c.set('userId', userId);
    c.set('userEmail', userEmail);
    c.set('accessToken', token);
    await next();
  });

  app.route('/api/v1', api);
  return app;
}

describe('NexusGraph API Integration Tests', () => {
  const validToken = 'valid-jwt-token';
  const headers = {
    Authorization: `Bearer ${validToken}`,
    'Content-Type': 'application/json',
  };

  describe('Health Endpoint', () => {
    it('GET /health should return 200 without authentication', async () => {
      const app = createTestApp();
      const res = await app.request('/health');
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe('ok');
    });
  });

  describe('Authentication & Authorization Isolation', () => {
    it('should reject unauthenticated requests to protected endpoints', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations');
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid bearer token', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations', {
        headers: { Authorization: 'Bearer invalid-token' },
      });
      expect(res.status).toBe(401);
    });

    it('GET /api/v1/me should return current authenticated user identity', async () => {
      const app = createTestApp('user-analyst-1', 'lead@security.org');
      const res = await app.request('/api/v1/me', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe('user-analyst-1');
      expect(body.data.email).toBe('lead@security.org');
    });
  });

  describe('Investigations Endpoint CRUD & Validation', () => {
    it('POST /api/v1/investigations should validate body and reject missing title', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ priority: 'HIGH' }), // Missing title
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation Error');
    });

    it('POST /api/v1/investigations should reject invalid priority levels', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: 'Test Case', priority: 'INVALID_PRIORITY' }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation Error');
    });

    it('GET /api/v1/investigations/:id should return 404 for non-existent or unowned cases', async () => {
      const app = createTestApp();
      vi.spyOn(investigationService, 'getById').mockResolvedValueOnce(null);

      const res = await app.request('/api/v1/investigations/00000000-0000-0000-0000-000000000000', {
        headers,
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not Found');
    });

    it('PATCH /api/v1/investigations/:id should return 404 if ownership check fails', async () => {
      const app = createTestApp();
      vi.spyOn(investigationService, 'update').mockRejectedValueOnce(
        new Error('Investigation not found or access denied'),
      );

      const res = await app.request('/api/v1/investigations/case-unowned-123', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'CLOSED' }),
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe('Not Found');
    });

    it('DELETE /api/v1/investigations/:id should return 404 if case does not exist', async () => {
      const app = createTestApp();
      vi.spyOn(investigationService, 'delete').mockRejectedValueOnce(
        new Error('Investigation not found or access denied'),
      );

      const res = await app.request('/api/v1/investigations/case-missing', {
        method: 'DELETE',
        headers,
      });

      expect(res.status).toBe(404);
    });
  });

  describe('Entities & Relationships Validation', () => {
    it('POST /api/v1/investigations/:id/entities should reject invalid entity types', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations/case-123/entities', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'INVALID_TYPE',
          value: 'test',
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation Error');
    });

    it('POST /api/v1/investigations/:id/entities should reject out-of-range confidence scores', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations/case-123/entities', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'DOMAIN',
          value: 'example.com',
          confidence: 150, // Max is 100
        }),
      });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/investigations/:id/relationships should reject invalid relationship types', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations/case-123/relationships', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source_entity_id: '11111111-1111-1111-1111-111111111111',
          target_entity_id: '22222222-2222-2222-2222-222222222222',
          relationship_type: 'INVALID_RELATIONSHIP',
        }),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('Collector Run Validation & Pipeline', () => {
    it('POST /api/v1/investigations/:id/collect should reject invalid seed type', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations/case-123/collect', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          seed_type: 'NON_EXISTENT_SEED',
          seed_value: 'example.com',
          collectors: ['dns'],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('POST /api/v1/investigations/:id/collect should reject empty collectors array', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations/case-123/collect', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          seed_type: 'DOMAIN',
          seed_value: 'example.com',
          collectors: [],
        }),
      });

      expect(res.status).toBe(400);
    });

    it('GET /api/v1/collectors/available should return allowed collectors for seed', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/collectors/available?seed_type=DOMAIN', { headers });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toContain('dns');
      expect(body.data).toContain('url-metadata');
      expect(body.data).toContain('tls-certificate');
    });
  });

  describe('Search & Export Services', () => {
    it('GET /api/v1/investigations/:id/search should require q parameter', async () => {
      const app = createTestApp();
      const res = await app.request('/api/v1/investigations/case-123/search', { headers });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation Error');
    });

    it('GET /api/v1/investigations/:id/export/json should return JSON content-type', async () => {
      const app = createTestApp();
      vi.spyOn(exportService, 'exportJson').mockResolvedValueOnce({
        exportedAt: new Date().toISOString(),
        investigation: { id: 'c1', title: 'Audit' } as any,
        entities: [],
        relationships: [],
        evidence: [],
        timeline: [],
        notes: [],
      });

      const res = await app.request('/api/v1/investigations/case-123/export/json', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');
      const body = await res.json();
      expect(body.investigation.title).toBe('Audit');
    });

    it('GET /api/v1/investigations/:id/export/csv should return text/csv content-type', async () => {
      const app = createTestApp();
      vi.spyOn(exportService, 'exportCsv').mockResolvedValueOnce('# Entities\nid,type,value\n');

      const res = await app.request('/api/v1/investigations/case-123/export/csv', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/csv');
      const text = await res.text();
      expect(text).toContain('# Entities');
    });

    it('GET /api/v1/investigations/:id/export/markdown should return text/markdown content-type', async () => {
      const app = createTestApp();
      vi.spyOn(exportService, 'exportMarkdown').mockResolvedValueOnce('# Investigation Report\n');

      const res = await app.request('/api/v1/investigations/case-123/export/markdown', { headers });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/markdown');
      const text = await res.text();
      expect(text).toContain('# Investigation Report');
    });
  });
});
