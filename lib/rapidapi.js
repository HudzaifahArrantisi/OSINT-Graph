import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

/**
 * Per-host request serialization queue to enforce <= 1 req/sec rate limit per host.
 * @type {Map<string, Promise<void>>}
 */
const hostQueues = new Map();

/**
 * Enforces rate limiting (maximum 1 request per second per host).
 *
 * @template T
 * @param {string} host - The target RapidAPI host
 * @param {() => Promise<T>} fn - The async fetch function to execute
 * @returns {Promise<T>}
 */
async function scheduleHostRequest(host, fn) {
  const previous = hostQueues.get(host) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });

  // Append to host queue
  hostQueues.set(
    host,
    previous
      .catch(() => {}) // Don't let previous failures block subsequent calls
      .then(() => current),
  );

  await previous.catch(() => {});

  try {
    return await fn();
  } finally {
    // Hold next request on this host for 1000ms
    setTimeout(
      () => {
        release();
      },
      process.env.NODE_ENV === 'test' ? 0 : 1000,
    );
  }
}

/**
 * Generic HTTP client wrapper for RapidAPI requests.
 *
 * @param {string} host - RapidAPI host domain (e.g., 'instagram-scraper2.p.rapidapi.com')
 * @param {string} requestPath - URL path with query string (e.g., '/user_info?user_name=johndoe')
 * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} [method='GET'] - HTTP method
 * @param {Record<string, any> | string | URLSearchParams | null} [body=null] - Request payload
 * @returns {Promise<any>} Parsed response data (JSON or text)
 */
export async function callRapidAPI(host, requestPath, method = 'GET', body = null) {
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
    const headers = {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': cleanHost,
      'User-Agent': 'NexusGraph-OSINT-Lookup/1.0',
    };

    let serializedBody = undefined;

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

    let response;
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

    // Log remaining quota from response header if available
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
      return await response.json();
    }

    const rawText = await response.text();
    try {
      return JSON.parse(rawText);
    } catch {
      return rawText;
    }
  });
}

export default {
  callRapidAPI,
};
