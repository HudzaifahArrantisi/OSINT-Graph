/**
 * Value Analyzer — intelligent pattern detection for OSINT seed values.
 *
 * Analyzes the raw seed value to determine what it actually IS,
 * independent of the user-declared seed type. This enables proper
 * transform routing: e.g. SOCIAL_PROFILE + "candalenaa" → username transforms.
 *
 * Every detection is deterministic (regex/parsing), never probabilistic.
 */

import type { SeedType } from '@nexusgraph/shared';

// ─── Value Analysis Result ──────────────────────────────────────────

export interface ValueAnalysis {
  /** The raw value that was analyzed */
  raw: string;

  /** Detected patterns */
  isUrl: boolean;
  isDomain: boolean;
  isEmail: boolean;
  isUsername: boolean;
  isIpAddress: boolean;

  /** Extracted components (only populated when the pattern matches) */
  extractedUsername: string | null;
  extractedDomain: string | null;
  extractedHostname: string | null;
  extractedPath: string | null;
}

// ─── Pattern Regexes ────────────────────────────────────────────────

const IP_V4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IP_V6_RE = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;
const USERNAME_RE = /^@?[a-zA-Z0-9_.-]{2,50}$/;

/** Well-known social platform hostnames for username extraction from URLs */
const SOCIAL_PLATFORMS = new Set([
  'github.com',
  'gitlab.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'facebook.com',
  'tiktok.com',
  'youtube.com',
  'reddit.com',
  'medium.com',
  'dev.to',
  'linkedin.com',
  'keybase.io',
  'hackerone.com',
  'npmjs.com',
  'www.npmjs.com',
  'www.reddit.com',
  'www.instagram.com',
  'www.facebook.com',
  'www.tiktok.com',
  'www.youtube.com',
  'www.linkedin.com',
  'www.twitter.com',
]);

// ─── Core Analyzer ──────────────────────────────────────────────────

/**
 * Analyze a raw seed value to detect what type of data it actually contains.
 * This is pure pattern matching — no network calls.
 */
export function analyzeValue(value: string): ValueAnalysis {
  const raw = value.trim();
  const result: ValueAnalysis = {
    raw,
    isUrl: false,
    isDomain: false,
    isEmail: false,
    isUsername: false,
    isIpAddress: false,
    extractedUsername: null,
    extractedDomain: null,
    extractedHostname: null,
    extractedPath: null,
  };

  if (!raw) return result;

  // 1. Check URL first (most specific)
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const urlObj = new URL(raw);
      result.isUrl = true;
      result.extractedHostname = urlObj.hostname;
      result.extractedDomain = urlObj.hostname.replace(/^www\./, '');
      result.extractedPath = urlObj.pathname;

      // Try to extract username from social platform URLs
      const username = extractUsernameFromUrl(urlObj);
      if (username) {
        result.isUsername = true;
        result.extractedUsername = username;
      }

      return result;
    } catch {
      // Invalid URL, fall through to other checks
    }
  }

  // 2. Check IP address
  if (IP_V4_RE.test(raw) || IP_V6_RE.test(raw)) {
    result.isIpAddress = true;
    return result;
  }

  // 3. Check email
  if (EMAIL_RE.test(raw)) {
    result.isEmail = true;
    const parts = raw.split('@');
    result.extractedDomain = parts[parts.length - 1];
    result.extractedUsername = parts[0];
    return result;
  }

  // 4. Check domain (must have a TLD dot, no spaces)
  if (DOMAIN_RE.test(raw) && raw.includes('.') && !raw.includes(' ')) {
    result.isDomain = true;
    result.extractedDomain = raw;
    return result;
  }

  // 5. Check username (alphanumeric, underscores, dots, hyphens, 2-50 chars)
  const stripped = raw.startsWith('@') ? raw.slice(1) : raw;
  if (USERNAME_RE.test(raw) && !raw.includes('.') && !raw.includes(' ')) {
    result.isUsername = true;
    result.extractedUsername = stripped;
    return result;
  }

  // 6. Could still be a username if it's a short alphanumeric string with dots
  if (USERNAME_RE.test(raw) && !raw.includes(' ')) {
    result.isUsername = true;
    result.extractedUsername = stripped;
    return result;
  }

  // 7. None of the above — plain text value
  return result;
}

// ─── URL Username Extraction ────────────────────────────────────────

/**
 * Extract a username/handle from a social platform URL.
 */
function extractUsernameFromUrl(urlObj: URL): string | null {
  const hostname = urlObj.hostname.toLowerCase();

  if (!SOCIAL_PLATFORMS.has(hostname)) return null;

  const pathParts = urlObj.pathname.split('/').filter(Boolean);
  if (pathParts.length === 0) return null;

  let username = pathParts[0];

  if (username.startsWith('@')) {
    username = username.slice(1);
  }

  if (hostname.includes('youtube.com')) {
    if (username === 'c' || username === 'channel' || username === 'user') {
      username = pathParts[1] || '';
    }
    if (username.startsWith('@')) {
      username = username.slice(1);
    }
  }

  if (hostname.includes('linkedin.com')) {
    if (username === 'in' || username === 'company') {
      username = pathParts[1] || '';
    }
  }

  if (hostname.includes('npmjs.com') && username.startsWith('~')) {
    username = username.slice(1);
  }

  const genericPaths = new Set([
    'explore', 'search', 'settings', 'about', 'help',
    'login', 'signup', 'register', 'terms', 'privacy',
    'topics', 'trending', 'notifications', 'messages',
  ]);
  if (genericPaths.has(username.toLowerCase())) return null;

  if (!username || username.length < 2) return null;

  return username;
}

// ─── Effective Type Inference ───────────────────────────────────────

/**
 * Infer the most useful "effective input type" for transform planning,
 * by combining the user-declared seed type with actual value pattern analysis.
 */
export function inferEffectiveInputType(
  seedType: SeedType,
  analysis: ValueAnalysis,
): SeedType {
  if (seedType === 'SOCIAL_PROFILE') {
    if (analysis.isUrl) return 'URL';
    if (analysis.isUsername) return 'USERNAME';
    if (analysis.isDomain) return 'DOMAIN';
    return 'USERNAME';
  }

  if (seedType === 'NAME') {
    if (analysis.isUsername && !analysis.raw.includes(' ')) return 'USERNAME';
    if (analysis.isEmail) return 'EMAIL';
    return 'NAME';
  }

  return seedType;
}

export { extractUsernameFromUrl };
