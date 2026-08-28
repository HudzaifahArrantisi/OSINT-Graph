import { describe, it, expect } from 'vitest';
import { mrholmesEngineCollector, runMrHolmesBridge } from '../collectors/mrholmes-engine.js';

const ctx = {
  caseId: 'test-case',
  requestId: 'test-req',
  signal: new AbortController().signal,
};

describe('mrholmes-engine collector', () => {
  it('supports every Mr.Holmes category seed type', () => {
    expect(mrholmesEngineCollector.supports('USERNAME')).toBe(true);
    expect(mrholmesEngineCollector.supports('PERSON')).toBe(true);
    expect(mrholmesEngineCollector.supports('NAME')).toBe(true);
    expect(mrholmesEngineCollector.supports('EMAIL')).toBe(true);
    expect(mrholmesEngineCollector.supports('PHONE')).toBe(true);
    expect(mrholmesEngineCollector.supports('DOMAIN')).toBe(true);
    expect(mrholmesEngineCollector.supports('URL')).toBe(true);
    expect(mrholmesEngineCollector.supports('IP_ADDRESS')).toBe(false);
    expect(mrholmesEngineCollector.supports('ORGANIZATION')).toBe(false);
  });

  it('rejects invalid seeds without spawning the Python engine', async () => {
    for (const bad of ['x'.repeat(121), 'inj;rm -rf', '@b@c', 'not@@valid']) {
      const result = await mrholmesEngineCollector.run(bad, ctx);
      expect(result.warnings.length).toBe(1);
      expect(result.entities).toHaveLength(0);
    }
  });

  it('runs the real vendored bridge end-to-end and emits provenance-backed output', async () => {
    const result = await mrholmesEngineCollector.run('torvalds', ctx);

    // The bridge must complete and produce structured output
    expect(result).toBeDefined();
    expect(result.entities.every((e) => e.type === 'SOCIAL_PROFILE')).toBe(true);
    expect(result.entities.every((e) => e.value.startsWith('https://'))).toBe(true);
    expect(result.entities.every((e) => (e.metadata as any)?.engine === 'mrholmes-python')).toBe(true);

    for (const rel of result.relationships) {
      expect(rel.source_value).toBe('torvalds');
      expect(rel.source_type).toBe('USERNAME');
      expect(rel.target_type).toBe('SOCIAL_PROFILE');
      expect(rel.reason).toContain('Mr.Holmes');
    }

    // Network-dependent: profiles are usually found for a high-profile handle,
    // but we do not fail the suite when many upstream sites time out.
    if (result.entities.length === 0) {
      console.warn('[mrholmes-engine] live run found 0 profiles (likely upstream timeouts):', result.warnings.slice(0, 3));
    }
  }, 240_000);

  it('extracts phone metadata, geolocation, and dorks for PHONE seed', async () => {
    const result = await mrholmesEngineCollector.run('+6281385718755', ctx);
    expect(result).toBeDefined();
    expect(result.evidence.some((ev) => ev.source_type === 'PHONE_METADATA')).toBe(true);
    // Dorks or locations should be present
    expect(result.entities.length).toBeGreaterThan(0);
  }, 30_000);

  it('bridge rejects unsupported modes via the JSON contract', async () => {
    await expect(runMrHolmesBridge('nonsense' as never, 'x', ctx.signal)).rejects.toThrow(/bridge error/i);
  });
});

