import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const hostQueues = new Map<string, Promise<void>>();

/**
 * Enforces rate limiting (maximum 1 request per second per host).
 */
async function scheduleHostRequest<T>(host: string, fn: () => Promise<T>): Promise<T> {
  const previous = hostQueues.get(host) || Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((res) => {
    release = res;
  });

  hostQueues.set(
    host,
    previous
      .catch(() => {})
      .then(() => current),
  );

  await previous.catch(() => {});

  try {
    return await fn();
  } finally {
    setTimeout(() => {
      release();
    }, 1000);
  }
}

/**
 * Generic HTTP client wrapper for RapidAPI requests with rate-limiting and error handling.
 */
export async function callRapidAPI<T = any>(
  host: string,
  requestPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body: Record<string, any> | string | URLSearchParams | null = null,
): Promise<T> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your_rapidapi_key_here') {
    throw new Error(
      `RAPIDAPI_KEY is not configured or is set to placeholder value. Please set RAPIDAPI_KEY in your .env file.`,
    );
  }

  const cleanHost = host.trim();
  const formattedPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  const url = `https://${cleanHost}${formattedPath}`;
  const httpMethod = method.toUpperCase();

  return scheduleHostRequest(cleanHost, async () => {
    const headers: Record<string, string> = {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': cleanHost,
      'User-Agent': 'NexusGraph-OSINT-Lookup/1.0',
    };

    let serializedBody: string | undefined = undefined;

    if (body !== null && body !== undefined && httpMethod !== 'GET' && httpMethod !== 'HEAD') {
      if (body instanceof URLSearchParams) {
        serializedBody = body.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (typeof body === 'object') {
        const formParams = new URLSearchParams();
        for (const [key, val] of Object.entries(body)) {
          if (val !== undefined && val !== null) {
            formParams.append(key, String(val));
          }
        }
        serializedBody = formParams.toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else if (typeof body === 'string') {
        serializedBody = body;
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      }
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: httpMethod,
        headers,
        body: serializedBody,
      });
    } catch (networkError) {
      const errorMsg = networkError instanceof Error ? networkError.message : String(networkError);
      throw new Error(`RapidAPI network error [${cleanHost}]: ${errorMsg}`);
    }

    const remainingQuota =
      response.headers.get('x-ratelimit-requests-remaining') ||
      response.headers.get('x-ratelimit-remaining');
    if (remainingQuota !== null) {
      console.log(`[RapidAPI][${cleanHost}] Remaining quota: ${remainingQuota}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(
        `RapidAPI [${cleanHost}] error (${response.status} ${response.statusText}): ${
          errorText || 'No error response body'
        }`,
      );
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return (await response.json()) as T;
    }

    const rawText = await response.text();
    try {
      return JSON.parse(rawText) as T;
    } catch {
      return rawText as unknown as T;
    }
  });
}

export default {
  callRapidAPI,
};
