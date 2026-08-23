import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeTransform, enforceProvenance } from '../transforms/adapter.js';
import type { CollectorContext, EntityCandidate } from '@nexusgraph/shared';

describe('Adapter Smart Routing & Provenance Tests', () => {
  const dummyCtx: CollectorContext = {
    caseId: 'case-test-123',
    signal: new AbortController().signal,
    requestId: 'req-test-123',
  };

  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock global fetch for fast, deterministic unit test
    global.fetch = vi.fn().mockImplementation(async (_url: string) => {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '<html></html>',
      };
    }) as any;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should enforce provenance metadata on all candidates missing source', () => {
    const candidates: EntityCandidate[] = [
      {
        type: 'SOCIAL_PROFILE',
        value: 'https://github.com/candalenaa',
        confidence: 80,
      },
    ];

    const withProv = enforceProvenance(candidates, 'developer.github-profile', 'github-public');
    expect(withProv[0].metadata?.source).toBeDefined();
    const src = withProv[0].metadata?.source as any;
    expect(src.collector).toBe('github-public');
    expect(src.transform).toBe('developer.github-profile');
    expect(src.collectedAt).toBeDefined();
  });

  it('should route SOCIAL_PROFILE with username value to username-presence transform cleanly', async () => {
    const result = await executeTransform(
      'social.discover-public-profiles',
      'candalenaa',
      'SOCIAL_PROFILE',
      'candalenaa',
      dummyCtx,
    );

    expect(result).toBeDefined();
    expect(result.transformId).toBe('social.discover-public-profiles');
    expect(['COMPLETED', 'NOT_FOUND', 'FAILED']).toContain(result.status);
    expect(result.entities.length).toBeGreaterThan(0);
  });
});
