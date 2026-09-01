import { Hono } from 'hono';
import { osintLookupSchema } from '@nexusgraph/shared';
import { api } from './routes/index.js';
import { lookupAllPlatforms } from './services/osint/index.js';
import {
  requestIdMiddleware,
  requestLogMiddleware,
  authMiddleware,
  errorHandlerMiddleware,
  corsMiddleware,
} from './middleware/index.js';

// Load env vars in dev
import dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const app = new Hono();

// Global middleware
app.use('*', corsMiddleware);
app.use('*', requestIdMiddleware);
app.use('*', errorHandlerMiddleware);
app.use('*', requestLogMiddleware);

// Health check — no auth required
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// OSINT Social Media Lookup endpoint (direct access)
app.post('/api/osint/lookup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = osintLookupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        error: 'Validation Error',
        message: 'Invalid OSINT lookup request body',
        details: parsed.error.flatten(),
      },
      400,
    );
  }

  try {
    const result = await lookupAllPlatforms(parsed.data.target, parsed.data.platforms);
    return c.json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return c.json({ error: 'OSINT Lookup Failed', message }, 500);
  }
});

// Authenticated API routes
app.use('/api/v1/*', authMiddleware);
app.route('/api/v1', api);

// 404 fallback
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
      statusCode: 404,
    },
    404,
  );
});

// Start server for local dev
const port = parseInt(process.env.PORT || '8787', 10);

console.log(`
╔══════════════════════════════════════╗
║   NexusGraph API Server              ║
║   http://localhost:${port}              ║
║   Health: /health                    ║
║   API: /api/v1                       ║
╚══════════════════════════════════════╝
`);

// Node.js server for dev (only start server when not in test environment)
import { serve } from '@hono/node-server';

if (process.env.NODE_ENV !== 'test') {
  serve({
    fetch: app.fetch,
    port,
  });
}

export default app;
