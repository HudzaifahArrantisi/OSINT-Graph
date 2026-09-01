import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'node:dns';
import { socialRapidapiCollector } from '../collectors/social-rapidapi.js';
import { buildDiscoveryPlan } from '../discovery/planner.js';
import { executeTransform } from '../transforms/adapter.js';

describe('social-rapidapi collector and transform integration', () => {
  const originalEnv = process.env.RAPIDAPI_KEY;

  beforeEach(() => {
    process.env.RAPIDAPI_KEY = 'test_key';
    vi.restoreAllMocks();
    vi.spyOn(dns.promises, 'lookup').mockResolvedValue({ address: '93.184.216.34', family: 4 } as any);
  });

  afterEach(() => {
    process.env.RAPIDAPI_KEY = originalEnv;
  });

  it('is included in Discovery Plan for USERNAME, PERSON, SOCIAL_PROFILE, NAME', () => {
    const plan = buildDiscoveryPlan('USERNAME', 'candalenaa');
    expect(plan.transforms.some((t) => t.id === 'social.rapidapi-social-lookup')).toBe(true);

    const personPlan = buildDiscoveryPlan('PERSON', 'John Doe');
    expect(personPlan.transforms.some((t) => t.id === 'social.rapidapi-social-lookup')).toBe(true);

    const socialPlan = buildDiscoveryPlan('SOCIAL_PROFILE', 'https://instagram.com/candalenaa');
    expect(socialPlan.transforms.some((t) => t.id === 'social.rapidapi-social-lookup')).toBe(true);
  });

  it('runs social-rapidapi collector and extracts PERSON, SOCIAL_PROFILE, EMAIL, PHONE, ORGANIZATION, LOCATION, WEBSITE', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';

      if (urlStr.includes('instagram')) {
        return new Response(
          JSON.stringify({
            user: {
              username: 'candalenaa',
              full_name: 'Canda Lena',
              biography: 'Security Analyst | Contact: canda@example.com | +628123456789',
              public_email: 'canda@example.com',
              contact_phone_number: '+628123456789',
              external_url: 'https://candalena.dev',
              follower_count: 1500,
              is_verified: true,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('tiktok')) {
        return new Response(
          JSON.stringify({
            userInfo: {
              user: {
                uniqueId: 'candalenaa',
                nickname: 'Canda TikTok',
                signature: 'Official TikTok | bio link below',
                bioLink: { link: 'https://candalena.dev/tiktok' },
                followerCount: 5000,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('linkedin')) {
        return new Response(
          JSON.stringify({
            profile_url: 'https://www.linkedin.com/in/candalenaa',
            full_name: 'Canda Lena, CISSP',
            headline: 'Senior Threat Analyst at CyberCorp',
            city: 'Jakarta',
            country_full_name: 'Indonesia',
            experiences: [{ company: 'CyberCorp Ltd' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const result = await socialRapidapiCollector.run('candalenaa', {
      requestId: 'test-req',
      caseId: 'case-123',
      signal: AbortSignal.timeout(5000),
      platforms: ['instagram', 'tiktok', 'linkedin'],
    });

    // Check extracted entities
    const entityTypes = result.entities.map((e) => e.type);
    expect(entityTypes).toContain('SOCIAL_PROFILE');
    expect(entityTypes).toContain('PERSON');
    expect(entityTypes).toContain('EMAIL');
    expect(entityTypes).toContain('PHONE');
    expect(entityTypes).toContain('WEBSITE');
    expect(entityTypes).toContain('ORGANIZATION');
    expect(entityTypes).toContain('LOCATION');

    // Specific entities
    const person = result.entities.find((e) => e.type === 'PERSON' && e.value === 'Canda Lena');
    expect(person).toBeDefined();

    const email = result.entities.find((e) => e.type === 'EMAIL' && e.value === 'canda@example.com');
    expect(email).toBeDefined();

    const phone = result.entities.find((e) => e.type === 'PHONE' && e.value.includes('628123456789'));
    expect(phone).toBeDefined();

    const org = result.entities.find((e) => e.type === 'ORGANIZATION' && e.value === 'CyberCorp Ltd');
    expect(org).toBeDefined();

    const loc = result.entities.find((e) => e.type === 'LOCATION' && e.value.includes('Jakarta'));
    expect(loc).toBeDefined();

    // Check relationships
    expect(result.relationships.some((r) => r.relationship_type === 'SAME_AS')).toBe(true);
    expect(result.relationships.some((r) => r.relationship_type === 'HAS_PUBLIC_EMAIL')).toBe(true);
    expect(result.relationships.some((r) => r.relationship_type === 'HAS_PUBLIC_PHONE')).toBe(true);
    expect(result.relationships.some((r) => r.relationship_type === 'HAS_WEBSITE')).toBe(true);
    expect(result.relationships.some((r) => r.relationship_type === 'BELONGS_TO')).toBe(true);
    expect(result.relationships.some((r) => r.relationship_type === 'GEOLOCATED_IN')).toBe(true);
  });

  it('runs only selected platform when filtered in ctx.platforms', async () => {
    let instagramCalled = false;
    let tiktokCalled = false;
    let linkedinCalled = false;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';

      if (urlStr.includes('instagram')) {
        instagramCalled = true;
        return new Response(JSON.stringify({ user: { username: 'candalenaa' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('tiktok')) {
        tiktokCalled = true;
        return new Response(JSON.stringify({ userInfo: { user: { uniqueId: 'candalenaa' } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (urlStr.includes('linkedin')) {
        linkedinCalled = true;
        return new Response(JSON.stringify({ full_name: 'Canda Lena' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    // Run ONLY Instagram
    await socialRapidapiCollector.run('candalenaa', {
      requestId: 'test-ig-only',
      caseId: 'case-123',
      signal: AbortSignal.timeout(5000),
      platforms: ['instagram'],
    });

    expect(instagramCalled).toBe(true);
    expect(tiktokCalled).toBe(false);
    expect(linkedinCalled).toBe(false);
  });

  it('executes via Transform Adapter cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';
      if (urlStr.includes('instagram')) {
        return new Response(
          JSON.stringify({ user: { username: 'testuser', full_name: 'Test Analyst' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (urlStr.includes('tiktok')) {
        return new Response(
          JSON.stringify({ userInfo: { user: { uniqueId: 'testuser' } } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (urlStr.includes('linkedin')) {
        return new Response(
          JSON.stringify({ full_name: 'Test Analyst' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await executeTransform(
      'social.rapidapi-social-lookup',
      'testuser',
      'USERNAME',
      'testuser',
      {
        requestId: 'req-transform',
        caseId: 'case-transform',
        signal: AbortSignal.timeout(5000),
      },
    );

    expect(res.transformId).toBe('social.rapidapi-social-lookup');
    expect(res.entities.length).toBeGreaterThan(0);
  });
});
