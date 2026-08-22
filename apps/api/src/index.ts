import { Hono } from 'hono';
import { api } from './routes/index.js';
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

// Node.js server for dev
import { serve } from '@hono/node-server';

serve({
  fetch: app.fetch,
  port,
});

export default app;
