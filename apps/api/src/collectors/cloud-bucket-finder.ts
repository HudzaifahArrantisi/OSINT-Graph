/**
 * Cloud Storage Bucket Finder Collector
 *
 * Probes public cloud storage providers (AWS S3, Google Cloud Storage, Azure Blob)
 * using permutations of the target's brand and apex domain.
 *
 * Classifies discovered buckets:
 * - 200 OK: Publicly readable / open bucket (High risk)
 * - 403 Forbidden: Bucket exists, confirmed asset, access restricted (Protected)
 * - 404 Not Found: Does not exist (Ignored)
 */

import type {
  Collector,
  CollectorContext,
  CollectorResult,
  EntityCandidate,
  RelationshipCandidate,
  EvidenceCandidate,
} from '@nexusgraph/shared';
import { normalizeDomain } from '@nexusgraph/shared';
import { safeFetch, validateUrl } from '../security/ssrf.js';
import { logger } from '../lib/logger.js';

const PROBE_TIMEOUT_MS = 4_000;
const MAX_CONCURRENT_PROBES = 5;

export interface BucketProbeTarget {
  name: string;
  provider: 'AWS_S3' | 'GCP_STORAGE' | 'AZURE_BLOB';
  url: string;
}

export interface BucketProbeResult extends BucketProbeTarget {
  status: 'PUBLIC_READ_OPEN' | 'EXISTS_RESTRICTED';
  httpStatus: number;
}

const BUCKET_SUFFIXES = [
  'assets',
  'public',
  'backup',
  'data',
  'static',
  'media',
  'storage',
  'files',
  'prod',
  'staging',
] as const;

export function deriveBrandKeywords(domainOrInput: string): string[] {
  let clean = domainOrInput.trim().toLowerCase();
  if (clean.includes('://')) {
    try {
      clean = new URL(clean).hostname;
    } catch {
      // Keep as-is
    }
  }

  clean = clean.replace(/^www\./, '');
  // Extract domain parts without TLD
  const parts = clean.split('.');
  if (parts.length >= 2) {
    // Drop common TLDs/ccTLDs
    const mainName = parts[0];
    const keywords = new Set<string>();
    if (mainName.length >= 3) {
      keywords.add(mainName);
    }
    // Also include hyphenated combinations if present (e.g. acme-corp)
    if (mainName.includes('-')) {
      const subParts = mainName.split('-').filter((p) => p.length >= 3);
      for (const sp of subParts) {
        keywords.add(sp);
      }
    }
    return Array.from(keywords).slice(0, 2);
  }

  // Fallback for raw organization name
  const sanitized = clean.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized.length >= 3 ? [sanitized] : [];
}

export function generateBucketPermutations(brands: string[]): BucketProbeTarget[] {
  const targets: BucketProbeTarget[] = [];
  const seenUrls = new Set<string>();

  for (const brand of brands) {
    // 1. Plain brand
    const plainNames = [brand];
    // 2. Suffixes
    for (const suffix of BUCKET_SUFFIXES) {
      plainNames.push(`${brand}-${suffix}`);
    }

    for (const name of plainNames) {
      // AWS S3
      const s3Url = `https://${name}.s3.amazonaws.com`;
      if (!seenUrls.has(s3Url)) {
        seenUrls.add(s3Url);
        targets.push({ name, provider: 'AWS_S3', url: s3Url });
      }

      // GCP Storage
      const gcpUrl = `https://storage.googleapis.com/${name}`;
      if (!seenUrls.has(gcpUrl)) {
        seenUrls.add(gcpUrl);
        targets.push({ name, provider: 'GCP_STORAGE', url: gcpUrl });
      }

      // Azure Blob
      const azureUrl = `https://${name}.blob.core.windows.net`;
      if (!seenUrls.has(azureUrl)) {
        seenUrls.add(azureUrl);
        targets.push({ name, provider: 'AZURE_BLOB', url: azureUrl });
      }
    }
  }

  return targets;
}

export const cloudBucketFinderCollector: Collector = {
  name: 'cloud-bucket-finder',

  supports(inputType: string): boolean {
    return (
      inputType === 'DOMAIN' ||
      inputType === 'URL' ||
      inputType === 'ORGANIZATION' ||
      inputType === 'WEBSITE'
    );
  },

  async run(input: string, ctx: CollectorContext): Promise<CollectorResult> {
    const collectedAt = new Date().toISOString();
    const entities: EntityCandidate[] = [];
    const relationships: RelationshipCandidate[] = [];
    const evidence: EvidenceCandidate[] = [];
    const warnings: string[] = [];

    let targetIdentifier: string;
    if (input.includes('://')) {
      const validation = validateUrl(input);
      if (!validation.safe) {
        warnings.push(`Input URL rejected by SSRF guard: ${validation.reason}`);
        return { source: 'cloud-bucket-finder', collectedAt, entities, relationships, evidence, warnings };
      }
      try {
        targetIdentifier = normalizeDomain(new URL(input).hostname);
      } catch {
        targetIdentifier = input.trim();
      }
    } else {
      targetIdentifier = input.trim().toLowerCase();
    }

    const brands = deriveBrandKeywords(targetIdentifier);
    if (brands.length === 0) {
      warnings.push(`Could not derive brand keyword from input: "${input}"`);
      return { source: 'cloud-bucket-finder', collectedAt, entities, relationships, evidence, warnings };
    }

    logger.info('Cloud storage bucket discovery started', {
      requestId: ctx.requestId,
      target: targetIdentifier,
      brands,
    });

    const candidates = generateBucketPermutations(brands).slice(0, 30); // Cap probe volume
    const discoveredBuckets: BucketProbeResult[] = [];

    // Probe in small batches to preserve network resources
    for (let i = 0; i < candidates.length; i += MAX_CONCURRENT_PROBES) {
      if (ctx.signal.aborted) break;
      const chunk = candidates.slice(i, i + MAX_CONCURRENT_PROBES);

      await Promise.all(
        chunk.map(async (candidate) => {
          try {
            const res = await safeFetch(candidate.url, {
              requestId: ctx.requestId,
              method: 'GET',
              timeoutMs: PROBE_TIMEOUT_MS,
              maxResponseBytes: 10 * 1024,
              signal: ctx.signal,
              headers: {
                'User-Agent': 'NexusGraph-CloudBucketScanner/1.0',
              },
            });

            if (res.status === 200) {
              discoveredBuckets.push({
                ...candidate,
                status: 'PUBLIC_READ_OPEN',
                httpStatus: 200,
              });
            } else if (res.status === 403) {
              discoveredBuckets.push({
                ...candidate,
                status: 'EXISTS_RESTRICTED',
                httpStatus: 403,
              });
            }
          } catch {
            // 404, connection refused, or timeout: ignore
          }
        }),
      );
    }

    if (discoveredBuckets.length > 0) {
      const openCount = discoveredBuckets.filter((b) => b.status === 'PUBLIC_READ_OPEN').length;
      const restrictedCount = discoveredBuckets.filter((b) => b.status === 'EXISTS_RESTRICTED').length;

      evidence.push({
        source_url: `cloud-storage://${targetIdentifier}`,
        source_type: 'CLOUD_BUCKET_SCAN',
        title: `Cloud Storage Bucket Reconnaissance (${targetIdentifier})`,
        extracted_value: `Ditemukan ${discoveredBuckets.length} bucket cloud terkait (${openCount} Terbuka Publik, ${restrictedCount} Terproteksi).`,
        confidence: 90,
        metadata: {
          totalDiscovered: discoveredBuckets.length,
          publicOpenCount: openCount,
          restrictedCount,
          buckets: discoveredBuckets.map((b) => ({
            name: b.name,
            provider: b.provider,
            url: b.url,
            status: b.status,
          })),
        },
      });

      for (const bucket of discoveredBuckets) {
        const isPublic = bucket.status === 'PUBLIC_READ_OPEN';
        entities.push({
          type: 'CLOUD_BUCKET',
          value: bucket.url,
          title: `Bucket [${bucket.provider}]: ${bucket.name}`,
          confidence: isPublic ? 95 : 85,
          metadata: {
            bucketName: bucket.name,
            provider: bucket.provider,
            status: bucket.status,
            httpStatus: bucket.httpStatus,
            is_public_read: isPublic,
            source: {
              collector: 'cloud-bucket-finder',
              derivedFrom: targetIdentifier,
              collectedAt,
            },
          },
        });

        relationships.push({
          source_value: targetIdentifier,
          source_type: input.includes('.') ? 'DOMAIN' : 'ORGANIZATION',
          target_value: bucket.url,
          target_type: 'CLOUD_BUCKET',
          relationship_type: 'ASSOCIATED_STORAGE',
          confidence: isPublic ? 95 : 85,
          reason: `Associated cloud storage bucket (${bucket.provider}) with access state: ${bucket.status}`,
        });
      }
    } else {
      warnings.push(`No active cloud storage buckets discovered for ${targetIdentifier}`);
    }

    logger.info('Cloud storage bucket discovery completed', {
      requestId: ctx.requestId,
      target: targetIdentifier,
      discoveredCount: discoveredBuckets.length,
    });

    return {
      source: 'cloud-bucket-finder',
      collectedAt,
      entities,
      relationships,
      evidence,
      warnings,
    };
  },
};
