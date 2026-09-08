import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  cloudBucketFinderCollector,
  deriveBrandKeywords,
  generateBucketPermutations,
} from '../collectors/cloud-bucket-finder.js';
import * as ssrf from '../security/ssrf.js';

const ctx = {
  caseId: 'test-case-id',
  requestId: 'test-req-id',
  signal: new AbortController().signal,
};

describe('Cloud Storage Bucket Finder Collector', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('supports DOMAIN, URL, ORGANIZATION, and WEBSITE input types', () => {
    expect(cloudBucketFinderCollector.supports('DOMAIN')).toBe(true);
    expect(cloudBucketFinderCollector.supports('URL')).toBe(true);
    expect(cloudBucketFinderCollector.supports('ORGANIZATION')).toBe(true);
    expect(cloudBucketFinderCollector.supports('WEBSITE' as any)).toBe(true);
    expect(cloudBucketFinderCollector.supports('EMAIL')).toBe(false);
    expect(cloudBucketFinderCollector.supports('PHONE')).toBe(false);
  });

  it('derives brand keywords accurately from domain and url', () => {
    expect(deriveBrandKeywords('https://acme-corp.com/path')).toContain('acme-corp');
    expect(deriveBrandKeywords('example.co.id')).toContain('example');
    expect(deriveBrandKeywords('TargetCompany')).toContain('targetcompany');
  });

  it('generates multi-cloud permutations for AWS, GCP, and Azure', () => {
    const targets = generateBucketPermutations(['mybrand']);
    expect(targets.some((t) => t.provider === 'AWS_S3' && t.url.includes('mybrand-assets.s3.amazonaws.com'))).toBe(true);
    expect(targets.some((t) => t.provider === 'GCP_STORAGE' && t.url.includes('storage.googleapis.com/mybrand-public'))).toBe(true);
    expect(targets.some((t) => t.provider === 'AZURE_BLOB' && t.url.includes('mybrand-data.blob.core.windows.net'))).toBe(true);
  });

  it('discovers open and restricted cloud storage buckets', async () => {
    vi.spyOn(ssrf, 'safeFetch').mockImplementation(async (url: string) => {
      if (url.includes('example-assets.s3.amazonaws.com')) {
        return { status: 200, ok: true } as any;
      }
      if (url.includes('example-backup.s3.amazonaws.com')) {
        return { status: 403, ok: false } as any;
      }
      return { status: 404, ok: false } as any;
    });

    const result = await cloudBucketFinderCollector.run('example.com', ctx);

    expect(result.source).toBe('cloud-bucket-finder');
    const buckets = result.entities.filter((e) => e.type === 'CLOUD_BUCKET');
    expect(buckets.length).toBe(2);

    const openBucket = buckets.find((b) => b.value.includes('example-assets'));
    expect(openBucket).toBeDefined();
    expect(openBucket?.metadata?.status).toBe('PUBLIC_READ_OPEN');

    const restrictedBucket = buckets.find((b) => b.value.includes('example-backup'));
    expect(restrictedBucket).toBeDefined();
    expect(restrictedBucket?.metadata?.status).toBe('EXISTS_RESTRICTED');

    // Verify relationships
    expect(
      result.relationships.some(
        (r) => r.relationship_type === 'ASSOCIATED_STORAGE' && r.target_value === openBucket?.value,
      ),
    ).toBe(true);

    expect(result.evidence.some((ev) => ev.source_type === 'CLOUD_BUCKET_SCAN')).toBe(true);
  });

  it('handles zero bucket matches gracefully with warnings', async () => {
    vi.spyOn(ssrf, 'safeFetch').mockResolvedValue({ status: 404, ok: false } as any);

    const result = await cloudBucketFinderCollector.run('nonexistentbrandxyz.com', ctx);
    expect(result.source).toBe('cloud-bucket-finder');
    expect(result.entities).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
