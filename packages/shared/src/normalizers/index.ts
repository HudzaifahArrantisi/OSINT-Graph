/**
 * Entity normalizers — preserve raw value, produce canonical normalized form.
 * WHY: The same artifact appears in many forms (HTTPS://Example.COM vs example.com).
 * Normalization enables deduplication and correlation across collectors.
 */

// ─── Domain Normalizer ──────────────────────────────────────────────

export function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();

  // Extract hostname from URL if someone pastes a full URL
  try {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      const url = new URL(domain);
      domain = url.hostname;
    }
  } catch {
    // Not a URL, treat as domain
  }

  // Remove trailing dot (DNS root notation)
  if (domain.endsWith('.')) {
    domain = domain.slice(0, -1);
  }

  // Remove www. prefix for canonical form
  if (domain.startsWith('www.')) {
    domain = domain.slice(4);
  }

  return domain;
}

// ─── Email Normalizer ───────────────────────────────────────────────

export function normalizeEmail(input: string): string {
  const email = input.trim();

  // Split local and domain parts
  const atIndex = email.lastIndexOf('@');
  if (atIndex === -1) return email.toLowerCase();

  const localPart = email.slice(0, atIndex);
  const domainPart = email.slice(atIndex + 1).toLowerCase();

  // Domain is case-insensitive, local part is technically case-sensitive
  // but for correlation we lowercase both
  return `${localPart.toLowerCase()}@${domainPart}`;
}

// ─── URL Normalizer ─────────────────────────────────────────────────

export function normalizeUrl(input: string): string {
  let raw = input.trim();

  // Add protocol if missing
  if (!raw.match(/^https?:\/\//i)) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw);

    // Lowercase protocol and hostname
    let normalized = `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}`;

    // Remove default ports
    if (url.port && url.port !== '80' && url.port !== '443') {
      normalized += `:${url.port}`;
    }

    // Path normalization — preserve path but normalize trailing slash
    let path = url.pathname;
    if (path !== '/' && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    normalized += path;

    // Keep search params if present
    if (url.search) {
      normalized += url.search;
    }

    return normalized;
  } catch {
    return raw.toLowerCase();
  }
}

// ─── Username Normalizer ────────────────────────────────────────────

export function normalizeUsername(input: string): string {
  // Trim whitespace, preserve original casing for display
  // but normalize to lowercase for correlation
  return input.trim().toLowerCase();
}

// ─── IP Address Normalizer ──────────────────────────────────────────

export function normalizeIpAddress(input: string): string {
  const ip = input.trim();

  // IPv4: just trim
  if (ip.includes('.') && !ip.includes(':')) {
    return ip;
  }

  // IPv6: expand and lowercase
  return ip.toLowerCase();
}

// ─── Organization Normalizer ────────────────────────────────────────

export function normalizeOrganization(input: string): string {
  return input.trim().toLowerCase();
}

// ─── Generic Normalizer Router ──────────────────────────────────────

import type { EntityType, SeedType } from '../constants/index.js';

type NormalizableType = EntityType | SeedType;

export function normalize(type: NormalizableType, value: string): string {
  switch (type) {
    case 'DOMAIN':
      return normalizeDomain(value);
    case 'EMAIL':
    case 'USES_EMAIL' as NormalizableType:
      return normalizeEmail(value);
    case 'URL':
      return normalizeUrl(value);
    case 'USERNAME':
    case 'SOCIAL_PROFILE':
      return normalizeUsername(value);
    case 'IP_ADDRESS':
      return normalizeIpAddress(value);
    case 'ORGANIZATION':
      return normalizeOrganization(value);
    default:
      return value.trim().toLowerCase();
  }
}
