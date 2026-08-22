import { describe, it, expect } from 'vitest';
import { classifySeed, getEffectiveType } from '../discovery/seed-classifier.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';

describe('Discovery & Seed Classification Tests', () => {
  it('should create seed entity with low initial confidence (30%)', () => {
    const seed = classifySeed('ORGANIZATION', 'Nurul Fikri');
    expect(seed.type).toBe('SEED');
    expect(seed.value).toBe('Nurul Fikri');
    expect(seed.confidence).toBe(30); // NOT treated as proof (confidence <= 30)
    expect(seed.metadata?.isSeed).toBe(true);
    expect(seed.metadata?.status).toBe('investigation_seed');
  });

  it('should map seed types to correct effective entity types', () => {
    expect(getEffectiveType('ORGANIZATION')).toBe('ORGANIZATION');
    expect(getEffectiveType('USERNAME')).toBe('USERNAME');
    expect(getEffectiveType('DOMAIN')).toBe('DOMAIN');
    expect(getEffectiveType('EMAIL')).toBe('EMAIL');
    expect(getEffectiveType('PERSON')).toBe('PERSON');
    expect(getEffectiveType('NAME')).toBe('PERSON');
  });

  it('should produce multi-category transforms for username seed', () => {
    const plan = buildDiscoveryPlan('USERNAME', 'octocat');
    const transformIds = plan.transforms.map((t) => t.id);

    expect(transformIds).toContain('developer.github-profile');
    expect(transformIds).toContain('developer.gitlab-profile');
    expect(transformIds).toContain('social.discover-public-profiles');
    expect(transformIds).toContain('social.youtube-channel');
  });

  it('should produce infrastructure transforms for domain seed', () => {
    const plan = buildDiscoveryPlan('DOMAIN', 'example.com');
    const transformIds = plan.transforms.map((t) => t.id);

    expect(transformIds).toContain('domain.resolve-dns');
    expect(transformIds).toContain('domain.find-tls');
    expect(transformIds).toContain('domain.webpage-metadata');
  });
});
