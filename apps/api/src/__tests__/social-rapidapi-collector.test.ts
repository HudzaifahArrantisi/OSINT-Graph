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

  it('enforces zero dummy invariant when accounts do not exist or 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Simulate 404 Not Found from upstream APIs
      return new Response(JSON.stringify({ detail: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const res = await socialRapidapiCollector.run('nonexistent_user_xyz_9999', {
      requestId: 'test-404',
      caseId: 'case-123',
      signal: AbortSignal.timeout(5000),
      platforms: ['instagram', 'tiktok', 'linkedin'],
    });

    // Zero fake SOCIAL_PROFILE entities must be emitted!
    const profiles = res.entities.filter((e) => e.type === 'SOCIAL_PROFILE');
    expect(profiles.length).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(0);
  });

  it('executes Mode A Global Name Search when input contains spaces or is PERSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';

      if (urlStr.includes('search_users')) {
        return new Response(
          JSON.stringify({
            users: [
              {
                user: {
                  username: 'hudzaifaharrantisi',
                  full_name: 'Hudzaifah Arrantisi',
                  biography: 'Security Researcher',
                  follower_count: 320,
                  is_verified: false,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('/search/user') || urlStr.includes('/searchUser')) {
        return new Response(
          JSON.stringify({
            userInfoList: [
              {
                user: {
                  uniqueId: 'hudzaifah_arrantisi',
                  nickname: 'Hudzaifah Arrantisi',
                  signature: 'Tech enthusiast',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (urlStr.includes('search-people')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                username: 'hudzaifah-arrantisi-pro',
                full_name: 'Hudzaifah Arrantisi',
                headline: 'Cyber Security Specialist',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await socialRapidapiCollector.run('hudzaifah arrantisi', {
      requestId: 'test-name-search',
      caseId: 'case-123',
      signal: AbortSignal.timeout(5000),
      platforms: ['instagram', 'tiktok', 'linkedin'],
    });

    // Emits root PERSON node
    const person = res.entities.find(
      (e) => e.type === 'PERSON' && e.value === 'hudzaifah arrantisi',
    );
    expect(person).toBeDefined();

    // Discovered real social profiles
    const profiles = res.entities.filter((e) => e.type === 'SOCIAL_PROFILE');
    expect(profiles.length).toBeGreaterThanOrEqual(3);

    // Instagram profile was discovered and linked to PERSON
    expect(
      profiles.some((p) => p.value === 'https://www.instagram.com/hudzaifaharrantisi'),
    ).toBe(true);

    // TikTok profile was discovered and linked to PERSON
    expect(
      profiles.some((p) => p.value === 'https://www.tiktok.com/@hudzaifah_arrantisi'),
    ).toBe(true);

    // LinkedIn profile was discovered and linked to PERSON
    expect(
      profiles.some(
        (p) => p.value === 'https://www.linkedin.com/in/hudzaifah-arrantisi-pro',
      ),
    ).toBe(true);

    // Ensure relationships link PERSON to SOCIAL_PROFILE with SAME_AS or POSSIBLY_SAME_AS
    const rels = res.relationships.filter(
      (r) =>
        r.source_type === 'PERSON' &&
        r.source_value === 'hudzaifah arrantisi' &&
        r.target_type === 'SOCIAL_PROFILE',
    );
    expect(rels.length).toBeGreaterThanOrEqual(3);
    expect(rels.every((r) => r.relationship_type === 'SAME_AS')).toBe(true);
  });

  it('successfully recovers Instagram data via backup scrapers (2025 scraper and looter) when primary has quota 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';

      // Primary scraper & stable fail with 429 quota error
      if (urlStr.includes('instagram-scraper2') || urlStr.includes('instagram-scraper-stable')) {
        return new Response(
          JSON.stringify({ message: 'You have exceeded the MONTHLY quota for Requests on your current plan' }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Backup 1: instagram-scraper-20251 succeeds
      if (urlStr.includes('instagram-scraper-20251')) {
        return new Response(
          JSON.stringify({
            data: {
              user: {
                username: 'jyfrah',
                full_name: 'Jyfrah Backup Recon',
                biography: 'Cyber Security Analyst | Backup scraper test',
                follower_count: 840,
                following_count: 120,
                profile_pic_url_hd: 'https://images.instagram.com/jyfrah.jpg',
                is_verified: false,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Backup 2: instagram-looter2 succeeds
      if (urlStr.includes('instagram-looter2')) {
        return new Response(
          JSON.stringify({
            username: 'jyfrah',
            full_name: 'Jyfrah Backup Recon',
            edge_followed_by: { count: 840 },
            edge_follow: { count: 120 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await socialRapidapiCollector.run('jyfrah', {
      requestId: 'test-backup-scrapers',
      caseId: 'case-123',
      signal: AbortSignal.timeout(5000),
      platforms: ['instagram'],
    });

    const igProfile = res.entities.find(
      (e) => e.type === 'SOCIAL_PROFILE' && e.value === 'https://www.instagram.com/jyfrah',
    );
    expect(igProfile).toBeDefined();
    expect(igProfile?.metadata?.username).toBe('jyfrah');
    expect(igProfile?.metadata?.full_name).toBe('Jyfrah Backup Recon');
    expect(igProfile?.metadata?.followers_count).toBe(840);
  });

  it('extracts TikTok profile by username, ID, and recent video feed via tiktokBestExperience', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';

      // 1. Get user by username
      if (urlStr.includes('/user/nike')) {
        return new Response(
          JSON.stringify({
            data: {
              id: '208464585232822272',
              uniqueId: 'nike',
              nickname: 'Nike Official',
              signature: 'Just Do It.',
              avatarLarger: 'https://images.tiktok.com/nike.jpg',
              followerCount: 2500000,
              followingCount: 15,
              heartCount: 15000000,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // 2. Feed by ID
      if (urlStr.includes('/feed')) {
        return new Response(
          JSON.stringify({
            itemList: [
              {
                id: '7234567890123456789',
                desc: 'Winning isn’t for everyone. It’s for whoever is willing. #JustDoIt',
                stats: {
                  playCount: 1500000,
                  diggCount: 250000,
                  commentCount: 3400,
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    const res = await socialRapidapiCollector.run('nike', {
      requestId: 'test-tiktok-feed',
      caseId: 'case-123',
      signal: AbortSignal.timeout(5000),
      platforms: ['tiktok'],
    });

    const ttProfile = res.entities.find(
      (e) => e.type === 'SOCIAL_PROFILE' && e.value === 'https://www.tiktok.com/@nike',
    );
    expect(ttProfile).toBeDefined();
    expect(ttProfile?.metadata?.nickname).toBe('Nike Official');
    expect(ttProfile?.metadata?.user_id).toBe('208464585232822272');
    expect(ttProfile?.metadata?.followers_count).toBe(2500000);

    // Video feed item extracted as DOCUMENT
    const videoPost = res.entities.find(
      (e) => e.type === 'DOCUMENT' && e.value.includes('7234567890123456789'),
    );
    expect(videoPost).toBeDefined();
    expect(videoPost?.metadata?.description).toContain('Winning isn’t for everyone');
    expect(videoPost?.metadata?.play_count).toBe(1500000);
  });
});
