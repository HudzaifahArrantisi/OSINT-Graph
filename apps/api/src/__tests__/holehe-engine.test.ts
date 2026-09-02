import { describe, it, expect } from 'vitest';
import { holeheEngineCollector, runHoleheBridge } from '../collectors/holehe-engine.js';

const ctx = {
  caseId: 'test-case',
  requestId: 'test-req',
  signal: new AbortController().signal,
};

describe('holehe-engine collector', () => {
  it('supports EMAIL seed type only', () => {
    expect(holeheEngineCollector.supports('EMAIL')).toBe(true);
    expect(holeheEngineCollector.supports('USERNAME')).toBe(false);
    expect(holeheEngineCollector.supports('DOMAIN')).toBe(false);
    expect(holeheEngineCollector.supports('IP_ADDRESS')).toBe(false);
    expect(holeheEngineCollector.supports('PHONE')).toBe(false);
  });

  it('rejects invalid email formats without spawning Python process', async () => {
    for (const bad of ['not-an-email', 'bad@', '@domain.com', 'a@b', 'inj;rm -rf@evil.com']) {
      const result = await holeheEngineCollector.run(bad, ctx);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.entities).toHaveLength(0);
      expect(result.relationships).toHaveLength(0);
    }
  });

  it('runs the real vendored Holehe bridge and produces structured entities and relationships', async () => {
    // Run live test with a common public address to verify end-to-end integration
    const result = await holeheEngineCollector.run('test@gmail.com', ctx);

    expect(result).toBeDefined();
    expect(result.source).toBe('holehe-engine');
    expect(result.evidence.some((ev) => ev.title?.includes('Holehe OSINT Email Crawl Summary'))).toBe(true);

    if (result.entities.length > 0) {
      for (const entity of result.entities) {
        expect(entity.value).toMatch(/^https:\/\//);
        expect(entity.confidence).toBeGreaterThanOrEqual(80);
        expect((entity.metadata as any)?.engine).toBe('holehe-python');
        expect((entity.metadata as any)?.discoveredBy).toBe('holehe-engine');
      }

      for (const rel of result.relationships) {
        expect(rel.source_value).toBe('test@gmail.com');
        expect(rel.source_type).toBe('EMAIL');
        expect(rel.relationship_type).toBe('USES_EMAIL');
        expect(rel.confidence).toBe(85);
        expect(rel.reason).toContain('Holehe');
      }
    }
  }, 120_000);

  it('handles bridge error responses gracefully', async () => {
    // Calling bridge with invalid email format rejects via JSON error contract
    await expect(runHoleheBridge('invalid-email-test', ctx.signal, 5_000)).rejects.toThrow(/Holehe bridge error/i);
  });
});
