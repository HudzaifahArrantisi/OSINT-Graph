import { describe, it, expect } from 'vitest';
import { classifySeed, getEffectiveType, parseSeed } from '../discovery/seed-classifier.js';
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
    expect(getEffectiveType('SOCIAL_PROFILE')).toBe('SOCIAL_PROFILE');
  });

  it('should produce multi-category transforms for username seed', () => {
    const plan = buildDiscoveryPlan('USERNAME', 'octocat');
    const transformIds = plan.transforms.map((t) => t.id);

    expect(transformIds).toContain('developer.github-profile');
    expect(transformIds).toContain('developer.gitlab-profile');
    expect(transformIds).toContain('social.discover-public-profiles');
    expect(transformIds).toContain('social.youtube-channel');
  });

  it('should produce smart transforms for SOCIAL_PROFILE seed with username value', () => {
    const plan = buildDiscoveryPlan('SOCIAL_PROFILE', 'candalenaa');
    const transformIds = plan.transforms.map((t) => t.id);

    expect(transformIds).toContain('social.discover-public-profiles');
    expect(transformIds).toContain('developer.github-profile');
    expect(transformIds).toContain('developer.gitlab-profile');
    expect(transformIds).toContain('social.youtube-channel');
  });

  it('should deterministically extract username & domain from SOCIAL_PROFILE URL', () => {
    const parsed = parseSeed('SOCIAL_PROFILE', 'https://instagram.com/candalenaa');
    expect(parsed.derivedEntities.length).toBeGreaterThanOrEqual(2);
    
    const domainEntity = parsed.derivedEntities.find((e) => e.type === 'DOMAIN');
    const userEntity = parsed.derivedEntities.find((e) => e.type === 'USERNAME');

    expect(domainEntity?.value).toBe('instagram.com');
    expect(userEntity?.value).toBe('candalenaa');
  });

  it('should produce infrastructure transforms for domain seed', () => {
    const plan = buildDiscoveryPlan('DOMAIN', 'example.com');
    const transformIds = plan.transforms.map((t) => t.id);

    expect(transformIds).toContain('domain.resolve-dns');
    expect(transformIds).toContain('domain.find-tls');
    expect(transformIds).toContain('domain.webpage-metadata');
    expect(transformIds).toContain('mentions.search-public-web');
  });

  it('should strictly limit Public Web Mentions to DOMAIN, IP_ADDRESS, URL, and ORGANIZATION only', () => {
    // Permitted categories
    const domainPlan = buildDiscoveryPlan('DOMAIN', 'example.com');
    expect(domainPlan.transforms.map((t) => t.id)).toContain('mentions.search-public-web');

    const urlPlan = buildDiscoveryPlan('URL', 'https://example.com');
    expect(urlPlan.transforms.map((t) => t.id)).toContain('mentions.search-public-web');

    const ipPlan = buildDiscoveryPlan('IP_ADDRESS', '93.184.216.34');
    expect(ipPlan.transforms.map((t) => t.id)).toContain('mentions.search-public-web');

    const orgPlan = buildDiscoveryPlan('ORGANIZATION', 'Example Corp');
    expect(orgPlan.transforms.map((t) => t.id)).toContain('mentions.search-public-web');

    // Forbidden categories
    const emailPlan = buildDiscoveryPlan('EMAIL', 'test@example.com');
    expect(emailPlan.transforms.map((t) => t.id)).not.toContain('mentions.search-public-web');

    const usernamePlan = buildDiscoveryPlan('USERNAME', 'johndoe');
    expect(usernamePlan.transforms.map((t) => t.id)).not.toContain('mentions.search-public-web');

    const personPlan = buildDiscoveryPlan('PERSON', 'John Doe');
    expect(personPlan.transforms.map((t) => t.id)).not.toContain('mentions.search-public-web');

    const namePlan = buildDiscoveryPlan('NAME', 'John Doe');
    expect(namePlan.transforms.map((t) => t.id)).not.toContain('mentions.search-public-web');

    const socialPlan = buildDiscoveryPlan('SOCIAL_PROFILE', 'johndoe');
    expect(socialPlan.transforms.map((t) => t.id)).not.toContain('mentions.search-public-web');

    const phonePlan = buildDiscoveryPlan('PHONE', '+12025550123');
    expect(phonePlan.transforms.map((t) => t.id)).not.toContain('mentions.search-public-web');
  });
});
