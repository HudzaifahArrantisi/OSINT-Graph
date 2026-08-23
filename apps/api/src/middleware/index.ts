import { Context, Next } from 'hono';
import { getSupabaseAdmin } from '../lib/supabase.js';
import { logger, generateRequestId } from '../lib/logger.js';

// ─── Types for context variables ────────────────────────────────────

declare module 'hono' {
  interface ContextVariableMap {
    userId: string;
    userEmail: string;
    requestId: string;
    accessToken: string;
  }
}

// ─── Request ID Middleware ──────────────────────────────────────────

export async function requestIdMiddleware(c: Context, next: Next) {
  const requestId = generateRequestId();
  c.set('requestId', requestId);
  c.header('X-Request-Id', requestId);
  await next();
}

// ─── Request Logging Middleware ─────────────────────────────────────

export async function requestLogMiddleware(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const requestId = c.get('requestId');

  await next();

  const duration = Date.now() - start;
  // Ignore SSE stream routes from flooding request logs if desired, or log them once
  if (!path.includes('/system/logs/stream')) {
    logger.http(method, path, c.res.status, duration, { requestId });
  }
}

// ─── Auth Middleware ────────────────────────────────────────────────

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(
      {
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
        statusCode: 401,
        requestId: c.get('requestId'),
      },
      401,
    );
  }

  const token = authHeader.slice(7);

  try {
    const supabase = getSupabaseAdmin();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Invalid or expired token',
          statusCode: 401,
          requestId: c.get('requestId'),
        },
        401,
      );
    }

    c.set('userId', user.id);
    c.set('userEmail', user.email || '');
    c.set('accessToken', token);
  } catch (err) {
    logger.error('Auth middleware error', {
      requestId: c.get('requestId'),
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    return c.json(
      {
        error: 'Internal Server Error',
        message: 'Authentication service unavailable',
        statusCode: 500,
        requestId: c.get('requestId'),
      },
      500,
    );
  }

  await next();
}

// ─── Error Handler Middleware ───────────────────────────────────────

export async function errorHandlerMiddleware(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    const requestId = c.get('requestId');
    logger.error('Unhandled error', {
      requestId,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
    });

    return c.json(
      {
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        statusCode: 500,
        requestId,
      },
      500,
    );
  }
}

// ─── CORS Middleware ────────────────────────────────────────────────

export async function corsMiddleware(c: Context, next: Next) {
  const origin = c.req.header('Origin') || '*';

  c.header('Access-Control-Allow-Origin', origin);
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  c.header('Access-Control-Allow-Credentials', 'true');
  c.header('Access-Control-Max-Age', '86400');

  if (c.req.method === 'OPTIONS') {
    return c.body(null, 204);
  }

  await next();
}

// ─── Rate Limiting (in-memory for MVP) ──────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimitMiddleware(maxRequests: number, windowMs: number) {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId');
    const key = `${userId}:${c.req.path}`;
    const now = Date.now();

    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    } else if (entry.count >= maxRequests) {
      c.header('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return c.json(
        {
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s`,
          statusCode: 429,
          requestId: c.get('requestId'),
        },
        429,
      );
    } else {
      entry.count++;
    }

    await next();
  };
}

// Cleanup stale rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}, 60_000);
