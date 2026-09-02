/**
 * Transform Adapter — wraps existing collectors as transforms.
 * Maps transform IDs → collector calls, uses value analysis for smart input derivation,
 * filters seed echoes, enforces provenance, and returns structured results.
 */

import type {
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
  TransformResult,
  SeedType,
} from '@nexusgraph/shared';
import { runCollector } from '../collectors/registry.js';
import { logger } from '../lib/logger.js';
import { analyzeValue } from '../discovery/value-analyzer.js';
import type { ValueAnalysis } from '../discovery/value-analyzer.js';

/** Mapping from transform ID → collector(s) + value-aware input derivation */
interface TransformHandler {
  /** Derive the collector input using value analysis for smart routing */
  deriveInput(entityValue: string, seedType: SeedType, analysis: ValueAnalysis): string | null;
  /** Which collector(s) to invoke */
  collectors: Array<{
    name: string;
    /** Optional: override input derivation for this specific collector */
    deriveInput?: (entityValue: string, seedType: SeedType, analysis: ValueAnalysis) => string | null;
  }>;
}

const TRANSFORM_HANDLERS: Record<string, TransformHandler> = {
  'phone.geo-metadata': {
    deriveInput: (v, st) => {
      // Only meaningful for phone seeds with international context
      if (st === 'PHONE') return v.trim();
      return null;
    },
    collectors: [{ name: 'phone-geo' }],
  },
  'web.discover-official-site': {
    deriveInput: (v, st, analysis) => {
      // Valid for: organizations, persons, names, and plain text queries
      if (st === 'ORGANIZATION' || st === 'PERSON' || st === 'NAME') return v.trim();
      // Also valid if the value is NOT a URL/domain/IP — it's a name to search
      if (!analysis.isUrl && !analysis.isDomain && !analysis.isIpAddress && !analysis.isEmail) return v.trim();
      return null;
    },
    collectors: [{ name: 'web-search' }],
  },
  'domain.resolve-dns': {
    deriveInput: (v, _st, analysis) => {
      // Extract domain from URL, email, or use directly if it's a domain
      if (analysis.isUrl && analysis.extractedHostname) return analysis.extractedHostname;
      if (analysis.isEmail && analysis.extractedDomain) return analysis.extractedDomain;
      if (analysis.isDomain) return v.trim();
      if (analysis.isIpAddress) return v.trim(); // Reverse DNS
      // Try to extract a domain from the raw value
      const d = extractDomain(v);
      return d && d.includes('.') ? d : null;
    },
    collectors: [{ name: 'dns' }],
  },
  'domain.find-subdomains-crt': {
    deriveInput: (_v, st, analysis) => {
      if (st === 'ORGANIZATION') {
        // Only meaningful when the organization value is itself a domain
        return analysis.isDomain ? _v.trim() : null;
      }
      if (analysis.isUrl && analysis.extractedHostname) return analysis.extractedHostname.replace(/^www\./, '');
      if (analysis.isDomain) return _v.trim();
      if (analysis.isEmail && analysis.extractedDomain) return analysis.extractedDomain;
      const d = extractDomain(_v);
      return d && d.includes('.') ? d : null;
    },
    collectors: [{ name: 'subdomain-crt' }],
  },
  'domain.find-tls': {
    deriveInput: (v, _st, analysis) => {
      if (analysis.isUrl && analysis.extractedHostname) return analysis.extractedHostname;
      if (analysis.isDomain) return v.trim();
      if (analysis.isEmail && analysis.extractedDomain) return analysis.extractedDomain;
      const d = extractDomain(v);
      return d && d.includes('.') ? d : null;
    },
    collectors: [{ name: 'tls-certificate' }],
  },
  'domain.webpage-metadata': {
    deriveInput: (v, _st, analysis) => {
      if (analysis.isUrl) return v.trim(); // Already a full URL
      if (analysis.isDomain) return `https://${v.trim()}`;
      if (analysis.isEmail && analysis.extractedDomain) return `https://${analysis.extractedDomain}`;
      // For social profile URLs, pass them directly
      const trimmed = v.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      const d = extractDomain(trimmed);
      return d && d.includes('.') ? `https://${d}` : null;
    },
    collectors: [{ name: 'url-metadata' }],
  },
  'domain.whois-rdap': {
    deriveInput: (v, _st, analysis) => {
      if (analysis.isUrl && analysis.extractedHostname) return analysis.extractedHostname;
      if (analysis.isDomain) return v.trim();
      if (analysis.isEmail && analysis.extractedDomain) return analysis.extractedDomain;
      const d = extractDomain(v);
      return d && d.includes('.') ? d : null;
    },
    collectors: [{ name: 'whois-rdap' }],
  },
  'infrastructure.ip-geolocation': {
    deriveInput: (v, _st, analysis) => {
      if (analysis.isIpAddress) return v.trim();
      return null;
    },
    collectors: [{ name: 'ip-geolocation' }],
  },
  'social.rapidapi-social-lookup': {
    deriveInput: (v, st, analysis) => {
      // Direct username or extracted username from profile URL
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      if (st === 'USERNAME' || st === 'PERSON' || st === 'NAME') return v.trim().replace(/^@/, '');
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      if (v.includes('instagram.com/') || v.includes('tiktok.com/') || v.includes('linkedin.com/')) {
        return v.trim();
      }
      return v.trim().replace(/^@/, '');
    },
    collectors: [{ name: 'social-rapidapi' }],
  },
  'social.discover-public-profiles': {
    deriveInput: (v, st, analysis) => {
      // Accept if value IS a username (regardless of declared seed type)
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      // Accept if declared USERNAME
      if (st === 'USERNAME') return v.trim().replace(/^@/, '');
      // If it's a URL with an extracted username, use the extracted username
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      return null;
    },
    collectors: [{ name: 'username-presence' }],
  },
  'social.youtube-channel': {
    deriveInput: (v, st, analysis) => {
      // Username-based search
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      if (st === 'USERNAME') return v.trim().replace(/^@/, '');
      if (st === 'ORGANIZATION' || st === 'PERSON' || st === 'NAME') return v.trim();
      // URL with extracted username
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      return null;
    },
    collectors: [{ name: 'youtube-public' }],
  },
  'developer.github-profile': {
    deriveInput: (v, st, analysis) => {
      // Username-based lookup
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      if (st === 'USERNAME') return v.trim();
      if (st === 'ORGANIZATION') return v.trim();
      if (st === 'EMAIL') return v.trim();
      if (st === 'PERSON' || st === 'NAME') return v.trim();
      // URL with extracted username
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      return null;
    },
    collectors: [{ name: 'github-public' }],
  },
  'developer.gitlab-profile': {
    deriveInput: (v, st, analysis) => {
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      if (st === 'USERNAME') return v.trim().replace(/^@/, '');
      if (st === 'ORGANIZATION' || st === 'PERSON' || st === 'NAME') return v.trim();
      // URL with extracted username
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      return null;
    },
    collectors: [{ name: 'gitlab-public' }],
  },
  'contact.find-official-contact': {
    deriveInput: (v, _st, analysis) => {
      if (analysis.isUrl) return v.trim();
      if (analysis.isDomain) return `https://${v.trim()}`;
      const trimmed = v.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
      const d = extractDomain(trimmed);
      return d && d.includes('.') ? `https://${d}` : null;
    },
    collectors: [{ name: 'url-metadata' }],
  },
  'social.username-sweep': {
    deriveInput: (v, st, analysis) => {
      if (st === 'USERNAME') return v.trim().replace(/^@/, '');
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      return null;
    },
    collectors: [{ name: 'username-sweep' }],
  },
  'intelligence.generate-dorks': {
    deriveInput: (v) => v.trim(),
    collectors: [{ name: 'dork-generator' }],
  },
  'contact.holehe-email-crawl': {
    deriveInput: (v, st, analysis) => {
      if (st !== 'EMAIL' && !analysis.isEmail) return null;
      return v.trim();
    },
    collectors: [{ name: 'holehe-engine' }],
  },
  'contact.email-breach-lookup': {
    deriveInput: (v, st, analysis) => {
      if (st !== 'EMAIL' && !analysis.isEmail) return null;
      return v.trim();
    },
    collectors: [{ name: 'email-lookup' }, { name: 'mrholmes-engine' }, { name: 'holehe-engine' }],
  },
  'domain.website-recon': {
    deriveInput: (_v, _st, analysis) => {
      if (analysis.isDomain || analysis.isIpAddress) return _v.trim();
      if (analysis.isUrl && analysis.extractedHostname) return analysis.extractedHostname;
      return null;
    },
    collectors: [{ name: 'website-recon' }, { name: 'mrholmes-engine' }],
  },
  'social.mrholmes-engine': {
    deriveInput: (v, st, analysis) => {
      // (1) SOCIAL-ACCOUNT-OSINT for usernames, (10) PEOPLE-OSINT for names
      if (st === 'USERNAME' || st === 'PERSON' || st === 'NAME') return v.trim().replace(/^@/, '');
      if (analysis.isUsername && analysis.extractedUsername) return analysis.extractedUsername;
      if (analysis.isUrl && analysis.extractedUsername) return analysis.extractedUsername;
      return null;
    },
    collectors: [{ name: 'mrholmes-engine' }],
  },
  'contact.mrholmes-phone': {
    deriveInput: (v, st) => {
      if (st !== 'PHONE') return null;
      return v.trim();
    },
    collectors: [{ name: 'mrholmes-engine' }],
  },
  'infrastructure.shodan-recon': {
    deriveInput: (v, st, analysis) => {
      if (st === 'IP_ADDRESS' || st === 'DOMAIN' || st === 'URL') return v.trim();
      if (analysis.isIpAddress || analysis.isDomain) return v.trim();
      if (analysis.isUrl && analysis.extractedHostname) return analysis.extractedHostname;
      return null;
    },
    collectors: [{ name: 'shodan-recon' }],
  },
  'mentions.search-public-web': {
    deriveInput: (v, st, analysis) => {
      // Only allowed for DOMAIN, IP_ADDRESS, URL, ORGANIZATION
      if (st === 'ORGANIZATION' || st === 'DOMAIN' || st === 'IP_ADDRESS' || st === 'URL') {
        return v.trim();
      }
      if (analysis.isUrl || analysis.isIpAddress || analysis.isDomain) {
        return v.trim();
      }
      return null;
    },
    collectors: [{ name: 'web-search' }],
  },
};

/** Extract domain from various value formats */
function extractDomain(value: string): string {
  const v = value.trim();
  // URL → hostname
  try {
    if (v.startsWith('http://') || v.startsWith('https://')) {
      return new URL(v).hostname;
    }
  } catch { /* not a URL */ }
  // Email → domain
  if (v.includes('@') && !v.startsWith('http')) {
    return v.split('@').pop()!;
  }
  // Strip path or port if any
  return v.split('/')[0].split(':')[0];
}

/** Extract username/handle from various value formats */
function extractUsername(value: string): string {
  const v = value.trim();
  // Email → local part
  if (v.includes('@') && !v.startsWith('http')) {
    return v.split('@')[0];
  }
  // Strip @ prefix
  if (v.startsWith('@')) return v.slice(1);
  return v;
}

/**
 * Filter out entities that merely echo the original seed value.
 * This is critical — the seed must NOT be returned as a "discovery".
 */
function filterSeedEchoes(
  entities: EntityCandidate[],
  seedValue: string,
): EntityCandidate[] {
  const seedNorm = seedValue.trim().toLowerCase();
  return entities.filter((e) => {
    const eNorm = e.value.trim().toLowerCase();
    // Reject exact match
    if (eNorm === seedNorm) return false;
    // Reject if it's just the seed with spaces/case changes
    if (eNorm.replace(/[\s\-_]/g, '') === seedNorm.replace(/[\s\-_]/g, '')) return false;
    return true;
  });
}

/**
 * Ensure every entity candidate has provenance metadata.
 * If provenance is missing, inject it from the transform context.
 */
function enforceProvenance(
  entities: EntityCandidate[],
  transformId: string,
  collectorName: string,
): EntityCandidate[] {
  const now = new Date().toISOString();
  return entities.map((e) => {
    const meta = e.metadata || {};
    if (!meta.source || typeof meta.source !== 'object') {
      meta.source = {
        collector: collectorName,
        transform: transformId,
        collectedAt: now,
      };
    } else {
      // Ensure required fields exist
      const source = meta.source as Record<string, unknown>;
      if (!source.collector) source.collector = collectorName;
      if (!source.transform) source.transform = transformId;
      if (!source.collectedAt) source.collectedAt = now;
    }
    return { ...e, metadata: meta };
  });
}

/**
 * Execute a transform by ID against an entity value.
 * Uses value analysis for smart input derivation.
 * Returns structured results with seed echoes filtered out, provenance enforced.
 */
export async function executeTransform(
  transformId: string,
  entityValue: string,
  seedType: SeedType,
  seedValue: string,
  ctx: CollectorContext,
): Promise<TransformResult> {
  const handler = TRANSFORM_HANDLERS[transformId];
  if (!handler) {
    return {
      transformId,
      status: 'FAILED',
      entities: [],
      relationships: [],
      evidence: [],
      warnings: [],
      error: `No handler registered for transform: ${transformId}`,
    };
  }

  // Analyze the actual value to enable smart input derivation
  const analysis = analyzeValue(entityValue);

  const allEntities: EntityCandidate[] = [];
  const allRelationships: RelationshipCandidate[] = [];
  const allEvidence: EvidenceCandidate[] = [];
  const allWarnings: string[] = [];

  for (const col of handler.collectors) {
    const input = col.deriveInput
      ? col.deriveInput(entityValue, seedType, analysis)
      : handler.deriveInput(entityValue, seedType, analysis);

    if (!input) {
      // Skipped because value analysis determined this transform is not applicable
      continue;
    }

    try {
      const result: CollectorResult = await runCollector(
        col.name as any,
        input,
        ctx,
      );

      // Enforce provenance on all discovered entities
      const entitiesWithProvenance = enforceProvenance(
        result.entities,
        transformId,
        col.name,
      );

      allEntities.push(...entitiesWithProvenance);
      allRelationships.push(...result.relationships);
      allEvidence.push(...result.evidence);
      allWarnings.push(...result.warnings);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.warn('Transform collector failed', {
        requestId: ctx.requestId,
        transformId,
        collector: col.name,
        error: msg,
      });
      allWarnings.push(`${col.name}: ${msg}`);
    }
  }

  // Filter out seed echoes
  const filtered = filterSeedEchoes(allEntities, seedValue);

  const status = filtered.length > 0
    ? 'COMPLETED'
    : allWarnings.some((w) => w.includes('error') || w.includes('Error') || w.includes('failed'))
      ? 'FAILED'
      : 'NOT_FOUND';

  return {
    transformId,
    status,
    entities: filtered,
    relationships: allRelationships,
    evidence: allEvidence,
    warnings: allWarnings,
  };
}

export { filterSeedEchoes, extractDomain, extractUsername, enforceProvenance };
