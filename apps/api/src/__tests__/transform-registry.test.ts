import { describe, it, expect } from 'vitest';
import {
  getAllTransforms,
  getTransformsForInput,
  getTransform,
  getTransformsGroupedByCategory,
} from '../transforms/registry.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { filterSeedEchoes } from '../transforms/adapter.js';

describe('Transform Registry & Planning Tests', () => {
  it('should list all enabled transforms', () => {
    const transforms = getAllTransforms();
    expect(transforms.length).toBeGreaterThanOrEqual(8);
    expect(transforms.every((t) => t.enabled)).toBe(true);
  });

  it('should find transform by id', () => {
    const dnsTransform = getTransform('domain.resolve-dns');
    expect(dnsTransform).toBeDefined();
    expect(dnsTransform?.name).toBe('DNS Resolution');
    expect(dnsTransform?.category).toBe('infrastructure');
  });

  it('should return compatible transforms for ORGANIZATION seed', () => {
    const orgTransforms = getTransformsForInput('ORGANIZATION');
    const ids = orgTransforms.map((t) => t.id);

    expect(ids).toContain('web.discover-official-site');
    expect(ids).toContain('developer.github-profile');
    expect(ids).toContain('developer.gitlab-profile');
    expect(ids).toContain('social.youtube-channel');
    expect(ids).toContain('mentions.search-public-web');
    // Ensure username presence is NOT returned for organization
    expect(ids).not.toContain('social.discover-public-profiles');
  });

  it('should return infrastructure transforms for DOMAIN', () => {
    const domainTransforms = getTransformsForInput('DOMAIN');
    const ids = domainTransforms.map((t) => t.id);

    expect(ids).toContain('domain.resolve-dns');
    expect(ids).toContain('domain.find-tls');
    expect(ids).toContain('domain.webpage-metadata');
    expect(ids).not.toContain('social.discover-public-profiles');
    expect(ids).not.toContain('developer.gitlab-profile');
  });

  it('should group transforms by category correctly', () => {
    const grouped = getTransformsGroupedByCategory();
    expect(grouped['web']).toBeDefined();
    expect(grouped['infrastructure']).toBeDefined();
    expect(grouped['social']).toBeDefined();
    expect(grouped['developer']).toBeDefined();
  });

  it('should build comprehensive multi-category plan for ORGANIZATION', () => {
    const plan = buildDiscoveryPlan('ORGANIZATION', 'Acme Corp');
    expect(plan.transforms.length).toBeGreaterThanOrEqual(4);

    const categories = new Set(plan.transforms.map((t) => t.category));
    expect(categories.has('web')).toBe(true);
    expect(categories.has('social')).toBe(true);
    expect(categories.has('developer')).toBe(true);
  });

  it('should filter out seed echoes and NEVER return seed as discovery', () => {
    const seed = 'Nurul Fikri';
    const mockEntities: any[] = [
      { type: 'ORGANIZATION', value: 'Nurul Fikri', title: 'Nurul Fikri' },
      { type: 'ORGANIZATION', value: 'nurul fikri', title: 'nurul fikri' },
      { type: 'WEBSITE', value: 'https://nurulfikri.ac.id', title: 'Official Website' },
      { type: 'DOMAIN', value: 'nurulfikri.ac.id', title: 'Domain' },
      { type: 'SOCIAL_PROFILE', value: 'https://instagram.com/nurulfikri', title: 'Instagram' },
    ];

    const filtered = filterSeedEchoes(mockEntities, seed);
    expect(filtered.length).toBe(3);
    expect(filtered.map((e) => e.value)).toEqual([
      'https://nurulfikri.ac.id',
      'nurulfikri.ac.id',
      'https://instagram.com/nurulfikri',
    ]);
  });
});
