import { describe, it, expect } from 'vitest';
import {
  getAllTransforms,
  getTransformsForInput,
  getTransform,
  getTransformsGroupedByCategory,
} from '../transforms/registry.js';
import { buildDiscoveryPlan, isApiKeyConfigured } from '../discovery/planner.js';
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

  describe('API Key Requirements & Detection', () => {
    it('marks Shodan and RapidAPI transforms as requiring API keys', () => {
      const shodan = getTransform('infrastructure.shodan-recon');
      expect(shodan).toBeDefined();
      expect(shodan?.requiresApiKey).toBe(true);
      expect(shodan?.apiKeyName).toBe('SHODAN_API_KEY');

      const rapidApi = getTransform('social.rapidapi-social-lookup');
      expect(rapidApi).toBeDefined();
      expect(rapidApi?.requiresApiKey).toBe(true);
      expect(rapidApi?.apiKeyName).toBe('RAPIDAPI_KEY');
    });

    it('confirms WHOIS and DNS transforms do NOT require API keys (open protocols)', () => {
      const whois = getTransform('domain.whois-rdap');
      expect(whois).toBeDefined();
      expect(whois?.requiresApiKey).toBeFalsy();

      const dns = getTransform('domain.resolve-dns');
      expect(dns).toBeDefined();
      expect(dns?.requiresApiKey).toBeFalsy();
    });

    it('correctly evaluates isApiKeyConfigured for set, empty, and placeholder keys', () => {
      const origKey = process.env.TEST_CUSTOM_API_KEY;

      process.env.TEST_CUSTOM_API_KEY = 'valid_secret_key_12345';
      expect(isApiKeyConfigured('TEST_CUSTOM_API_KEY')).toBe(true);

      process.env.TEST_CUSTOM_API_KEY = '';
      expect(isApiKeyConfigured('TEST_CUSTOM_API_KEY')).toBe(false);

      process.env.TEST_CUSTOM_API_KEY = '   ';
      expect(isApiKeyConfigured('TEST_CUSTOM_API_KEY')).toBe(false);

      process.env.TEST_CUSTOM_API_KEY = 'your_rapidapi_key_here';
      expect(isApiKeyConfigured('TEST_CUSTOM_API_KEY')).toBe(false);

      process.env.TEST_CUSTOM_API_KEY = 'your-api-key-here';
      expect(isApiKeyConfigured('TEST_CUSTOM_API_KEY')).toBe(false);

      delete process.env.TEST_CUSTOM_API_KEY;
      expect(isApiKeyConfigured('TEST_CUSTOM_API_KEY')).toBe(false);

      if (origKey !== undefined) {
        process.env.TEST_CUSTOM_API_KEY = origKey;
      }
    });

    it('attaches apiKeyConfigured boolean to planned transforms requiring keys', () => {
      const plan = buildDiscoveryPlan('IP_ADDRESS', '8.8.8.8');
      const shodan = plan.transforms.find((t) => t.id === 'infrastructure.shodan-recon');
      expect(shodan).toBeDefined();
      expect(shodan?.requiresApiKey).toBe(true);
      expect(typeof shodan?.apiKeyConfigured).toBe('boolean');

      const whoisPlan = buildDiscoveryPlan('DOMAIN', 'example.com');
      const whois = whoisPlan.transforms.find((t) => t.id === 'domain.whois-rdap');
      expect(whois).toBeDefined();
      expect(whois?.requiresApiKey).toBeFalsy();
    });
  });
});
