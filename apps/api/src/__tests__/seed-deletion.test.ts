import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { api } from '../routes/index.js';
import {
  requestIdMiddleware,
  errorHandlerMiddleware,
  corsMiddleware,
} from '../middleware/index.js';
import { entityService } from '../services/index.js';

function createTestApp(userId = 'test-user-123', userEmail = 'analyst@test.com') {
  const app = new Hono();
  app.use('*', corsMiddleware);
  app.use('*', requestIdMiddleware);
  app.use('*', errorHandlerMiddleware);

  app.use('/api/v1/*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized', statusCode: 401 }, 401);
    }
    c.set('userId', userId);
    c.set('userEmail', userEmail);
    c.set('accessToken', 'valid-token');
    await next();
  });

  app.route('/api/v1', api);
  return app;
}

describe('Seed Target & Connected Graph Deletion Endpoint Tests', () => {
  const headers = {
    Authorization: 'Bearer valid-jwt-token',
    'Content-Type': 'application/json',
  };

  it('DELETE /api/v1/investigations/:id/seeds/:seedEntityId should call entityService.deleteSeed and return results', async () => {
    const app = createTestApp();
    const caseId = 'case-123';
    const seedEntityId = 'seed-456';

    const mockDeleteResult = {
      deletedEntitiesCount: 5,
      deletedRelationshipsCount: 4,
      deletedJobsCount: 1,
      seedValue: 'example.com',
    };

    vi.spyOn(entityService, 'deleteSeed').mockResolvedValueOnce(mockDeleteResult);

    const res = await app.request(`/api/v1/investigations/${caseId}/seeds/${seedEntityId}`, {
      method: 'DELETE',
      headers,
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(mockDeleteResult);
    expect(entityService.deleteSeed).toHaveBeenCalledWith(caseId, seedEntityId, 'test-user-123');
  });

  it('DELETE /api/v1/investigations/:id/seeds/:seedEntityId should return 400 if service throws', async () => {
    const app = createTestApp();
    const caseId = 'case-123';
    const seedEntityId = 'seed-not-found';

    vi.spyOn(entityService, 'deleteSeed').mockRejectedValueOnce(
      new Error('Seed entity not found'),
    );

    const res = await app.request(`/api/v1/investigations/${caseId}/seeds/${seedEntityId}`, {
      method: 'DELETE',
      headers,
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Error');
    expect(body.message).toContain('Seed entity not found');
  });
});
