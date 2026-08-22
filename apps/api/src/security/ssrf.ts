/**
 * SSRF Defense-in-Depth Module
 *
 * WHY this exists: OSINT tools fetch attacker-controlled infrastructure.
 * Without proper SSRF protection, a malicious target URL could redirect
 * the server to internal services, cloud metadata endpoints, or private networks.
 *
 * This module validates URLs before fetching by:
 * 1. Parsing and validating URL structure
 * 2. Restricting to HTTP/HTTPS only
 * 3. Resolving DNS and checking resolved IPs
 * 4. Blocking private/reserved/metadata IPs
 * 5. Validating every redirect hop
 * 6. Enforcing timeouts and response size limits
 */

import { METADATA_SERVICE_IPS } from '@nexusgraph/shared';
import { logger } from '../lib/logger.js';

export interface SsrfValidationResult {
  safe: boolean;
  reason?: string;
  resolvedIp?: string;
}

export interface SafeFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowedContentTypes?: string[];
  requestId?: string;
  headers?: Record<string, string> | HeadersInit;
  method?: string;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_MAX_REDIRECTS = 5;

// ─── IP Range Checks ────────────────────────────────────────────────

function isPrivateIp(ip: string): boolean {
  // IPv4 checks
  if (ip.includes('.')) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true; // Malformed → reject
    }

    const [a, b, c] = parts;

    // 127.0.0.0/8 — Loopback
    if (a === 127) return true;

    // 10.0.0.0/8 — Private
    if (a === 10) return true;

    // 172.16.0.0/12 — Private
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16 — Private
    if (a === 192 && b === 168) return true;

    // 169.254.0.0/16 — Link-local
    if (a === 169 && b === 254) return true;

    // 0.0.0.0/8 — Current network
    if (a === 0) return true;

    // 100.64.0.0/10 — Shared address space (CGNAT)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 192.0.0.0/24 — IETF Protocol Assignments
    if (a === 192 && b === 0 && c === 0) return true;

    // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — TEST-NET
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;

    // 224.0.0.0/4 — Multicast
    if (a >= 224 && a <= 239) return true;

    // 240.0.0.0/4 — Reserved
    if (a >= 240) return true;

    return false;
  }

  // IPv6 checks
  const ipLower = ip.toLowerCase();

  // ::1 — Loopback
  if (ipLower === '::1' || ipLower === '0000:0000:0000:0000:0000:0000:0000:0001') return true;

  // :: — Unspecified
  if (ipLower === '::') return true;

  // fc00::/7 — Unique Local
  if (ipLower.startsWith('fc') || ipLower.startsWith('fd')) return true;

  // fe80::/10 — Link-local
  if (ipLower.startsWith('fe8') || ipLower.startsWith('fe9') || ipLower.startsWith('fea') || ipLower.startsWith('feb')) return true;

  // ff00::/8 — Multicast
  if (ipLower.startsWith('ff')) return true;

  // IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  const v4Match = ipLower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Match) {
    return isPrivateIp(v4Match[1]);
  }

  return false;
}

function isMetadataServiceIp(ip: string): boolean {
  return (METADATA_SERVICE_IPS as readonly string[]).includes(ip);
}

// ─── URL Validation ─────────────────────────────────────────────────

export function validateUrl(urlString: string): SsrfValidationResult {
  let url: URL;

  try {
    url = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL format' };
  }

  // Only HTTP and HTTPS
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { safe: false, reason: `Blocked protocol: ${url.protocol}` };
  }

  // Block URLs with auth info (user:pass@host)
  if (url.username || url.password) {
    return { safe: false, reason: 'URLs with credentials are not allowed' };
  }

  const hostname = url.hostname;

  // Block localhost variants
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost')
  ) {
    return { safe: false, reason: 'Localhost targets are blocked' };
  }

  // Check if hostname is an IP literal (IPv4 or IPv6) and validate it
  const isIpv4 = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const isIpv6 = hostname.startsWith('[') && hostname.endsWith(']') || /^[0-9a-fA-F:]+$/.test(hostname) && hostname.includes(':');

  if (isIpv4 || isIpv6) {
    const ip = hostname.replace(/^\[|\]$/g, '');

    if (isPrivateIp(ip)) {
      return { safe: false, reason: `Private/reserved IP blocked: ${ip}` };
    }

    if (isMetadataServiceIp(ip)) {
      return { safe: false, reason: `Cloud metadata service IP blocked: ${ip}` };
    }
  }

  return { safe: true };
}

// ─── DNS Resolution + IP Validation ─────────────────────────────────

export async function validateResolvedIp(hostname: string): Promise<SsrfValidationResult> {
  try {
    // Use DNS-over-HTTPS for Cloudflare Workers compatibility
    const response = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!response.ok) {
      return { safe: false, reason: 'DNS resolution failed' };
    }

    const result = (await response.json()) as { Answer?: Array<{ data: string; type: number }> };
    const answers = result.Answer || [];

    for (const answer of answers) {
      if (answer.type === 1 || answer.type === 28) {
        // A or AAAA record
        const ip = answer.data;

        if (isPrivateIp(ip)) {
          return {
            safe: false,
            reason: `DNS resolved to private/reserved IP: ${ip}`,
            resolvedIp: ip,
          };
        }

        if (isMetadataServiceIp(ip)) {
          return {
            safe: false,
            reason: `DNS resolved to cloud metadata IP: ${ip}`,
            resolvedIp: ip,
          };
        }
      }
    }

    if (answers.length === 0) {
      return { safe: false, reason: 'No DNS records found' };
    }

    return {
      safe: true,
      resolvedIp: answers.find((a) => a.type === 1)?.data || answers[0]?.data,
    };
  } catch (error) {
    return {
      safe: false,
      reason: `DNS resolution error: ${error instanceof Error ? error.message : 'unknown'}`,
    };
  }
}

// ─── Safe Fetch with Redirect Validation ────────────────────────────

export async function safeFetch(
  urlString: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const {
    maxRedirects = DEFAULT_MAX_REDIRECTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
    requestId = 'unknown',
  } = options;

  // Step 1: Validate URL structure
  const urlCheck = validateUrl(urlString);
  if (!urlCheck.safe) {
    throw new SsrfError(`SSRF blocked: ${urlCheck.reason}`, urlString, requestId);
  }

  // Step 2: Resolve DNS and validate IP
  const url = new URL(urlString);
  const dnsCheck = await validateResolvedIp(url.hostname);
  if (!dnsCheck.safe) {
    throw new SsrfError(`SSRF blocked: ${dnsCheck.reason}`, urlString, requestId);
  }

  // Step 3: Fetch with redirect validation
  let currentUrl = urlString;
  let redirectCount = 0;

  while (redirectCount <= maxRedirects) {
    logger.info('Safe fetch request', {
      requestId,
      url: currentUrl,
      redirectCount,
    });

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'NexusGraph-OSINT/1.0 (Security Research Tool)',
      ...(options.headers as Record<string, string> || {}),
    };

    const combinedSignal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs);

    const response = await fetch(currentUrl, {
      method: options.method || 'GET',
      redirect: 'manual',
      signal: combinedSignal,
      headers: fetchHeaders,
    });

    // Check for redirect
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location');
      if (!location) {
        throw new SsrfError('Redirect without Location header', currentUrl, requestId);
      }

      // Resolve relative URLs
      const redirectUrl = new URL(location, currentUrl).toString();

      // Validate the redirect target
      const redirectCheck = validateUrl(redirectUrl);
      if (!redirectCheck.safe) {
        throw new SsrfError(
          `SSRF blocked on redirect: ${redirectCheck.reason}`,
          redirectUrl,
          requestId,
        );
      }

      // Validate DNS of redirect target
      const redirectDns = await validateResolvedIp(new URL(redirectUrl).hostname);
      if (!redirectDns.safe) {
        throw new SsrfError(
          `SSRF blocked on redirect DNS: ${redirectDns.reason}`,
          redirectUrl,
          requestId,
        );
      }

      currentUrl = redirectUrl;
      redirectCount++;
      continue;
    }

    // Enforce response size limit by reading the body with a limit
    const contentLength = response.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength, 10) > maxResponseBytes) {
      throw new SsrfError(
        `Response too large: ${contentLength} bytes exceeds ${maxResponseBytes} limit`,
        currentUrl,
        requestId,
      );
    }

    return response;
  }

  throw new SsrfError(
    `Too many redirects (${maxRedirects})`,
    currentUrl,
    requestId,
  );
}

/**
 * Read response body with size limit enforcement.
 * Prevents memory exhaustion from oversized/infinite responses.
 */
export async function readResponseWithLimit(
  response: Response,
  maxBytes: number = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    totalSize += value.length;
    if (totalSize > maxBytes) {
      reader.cancel();
      throw new Error(`Response body exceeded ${maxBytes} bytes limit`);
    }

    chunks.push(value);
  }

  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('');
}

// ─── SSRF Error ─────────────────────────────────────────────────────

export class SsrfError extends Error {
  public readonly url: string;
  public readonly requestId: string;

  constructor(message: string, url: string, requestId: string) {
    super(message);
    this.name = 'SsrfError';
    this.url = url;
    this.requestId = requestId;

    logger.warn('SSRF attempt blocked', {
      requestId,
      url,
      reason: message,
    });
  }
}

export { safeFetch as ssrfSafeFetch };

