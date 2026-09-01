import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callRapidAPI } from '../lib/rapidapi.js';
import { instagramScraper } from '../services/osint/instagramScraper.js';
import { tiktok } from '../services/osint/tiktok.js';
import { instagramFastReliable } from '../services/osint/instagramFastReliable.js';
import { instagramBestExperience } from '../services/osint/instagramBestExperience.js';
import { instagramScraperStable } from '../services/osint/instagramScraperStable.js';
import { linkedin } from '../services/osint/linkedin.js';
import { lookupAllPlatforms } from '../services/osint/index.js';
import app from '../index.js';

describe('RapidAPI Core HTTP Client & OSINT Modules', () => {
  const originalEnv = process.env.RAPIDAPI_KEY;

  beforeEach(() => {
    process.env.RAPIDAPI_KEY = 'test_rapidapi_mock_key';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.RAPIDAPI_KEY = originalEnv;
  });

  describe('lib/rapidapi', () => {
    it('throws error when RAPIDAPI_KEY is not configured', async () => {
      delete process.env.RAPIDAPI_KEY;
      await expect(callRapidAPI('test.host', '/test')).rejects.toThrow(
        /RAPIDAPI_KEY is not configured/i,
      );
    });

    it('performs GET request with required headers', async () => {
      const mockResponse = { user: 'testuser', id: 12345 };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'x-ratelimit-requests-remaining': '99',
          },
        }),
      );

      const result = await callRapidAPI('instagram-scraper2.p.rapidapi.com', '/user_info?user_name=testuser');

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://instagram-scraper2.p.rapidapi.com/user_info?user_name=testuser',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'x-rapidapi-key': 'test_rapidapi_mock_key',
            'x-rapidapi-host': 'instagram-scraper2.p.rapidapi.com',
          }),
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('handles POST requests with form-urlencoded body', async () => {
      const mockResponse = { status: 'success' };
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await callRapidAPI(
        'instagram-scraper-stable-api.p.rapidapi.com',
        '/ig_get_fb_profile.php',
        'POST',
        { username_or_url: 'target_user', data: 'basic' },
      );

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile.php',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
          body: 'username_or_url=target_user&data=basic',
        }),
      );
      expect(result).toEqual(mockResponse);
    });

    it('throws error with status code and body when API returns non-2xx', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response('API rate limit exceeded', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
      );

      await expect(callRapidAPI('test.host', '/limit')).rejects.toThrow(
        /RapidAPI \[test\.host\] error \(429 Too Many Requests\): API rate limit exceeded/,
      );
    });
  });

  describe('Individual OSINT Services', () => {
    it('instagramScraper calls user_info correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ username: 'cybersec' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await instagramScraper.getUserInfo('@cybersec');
      expect(res).toEqual({ username: 'cybersec' });
    });

    it('tiktok calls getProfile correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ nickname: 'osint_tok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await tiktok.getProfile('osint_tok');
      expect(res).toEqual({ nickname: 'osint_tok' });
    });

    it('instagramFastReliable calls getUserIdByUsername correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ user_id: '998877' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await instagramFastReliable.getUserIdByUsername('johndoe');
      expect(res).toEqual({ user_id: '998877' });
    });

    it('instagramBestExperience calls discoverChaining correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ chain: ['u1', 'u2'] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await instagramBestExperience.discoverChaining('12345');
      expect(res).toEqual({ chain: ['u1', 'u2'] });
    });

    it('instagramScraperStable calls getFbProfile via POST form-urlencoded', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ fb_data: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await instagramScraperStable.getFbProfile('user123', 'basic');
      expect(res).toEqual({ fb_data: 'ok' });
    });

    it('linkedin calls getAllProfileData correctly', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ full_name: 'Jane Doe' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const res = await linkedin.getAllProfileData('janedoe');
      expect(res).toEqual({ full_name: 'Jane Doe' });
    });
  });

  describe('lookupAllPlatforms Aggregator', () => {
    it('aggregates multiple platforms using Promise.allSettled and handles mixed success/failure', async () => {
      vi.spyOn(globalThis, 'fetch')
        // 1. Instagram success
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ig: 'found' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        // 2. TikTok error
        .mockResolvedValueOnce(
          new Response('Not found', {
            status: 404,
            statusText: 'Not Found',
          }),
        )
        // 3. LinkedIn success
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ linkedin: 'profile' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      const results = await lookupAllPlatforms('johndoe', ['instagram', 'tiktok', 'linkedin']);

      expect(results.target).toBe('johndoe');
      expect(results.instagram?.status).toBe('fulfilled');
      expect(results.instagram?.data).toEqual({ ig: 'found' });

      expect(results.tiktok?.status).toBe('rejected');
      expect(results.tiktok?.error).toContain('404');

      expect(results.linkedin?.status).toBe('fulfilled');
      expect(results.linkedin?.data).toEqual({ linkedin: 'profile' });
    });
  });

  describe('API Endpoint POST /api/osint/lookup', () => {
    it('returns combined result when valid payload is sent', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(JSON.stringify({ profile: 'ig_data' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const req = new Request('http://localhost:8787/api/osint/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'testuser',
          platforms: ['instagram'],
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.data.target).toBe('testuser');
      expect(body.data.instagram?.status).toBe('fulfilled');
      expect(body.data.instagram?.data).toEqual({ profile: 'ig_data' });
    });

    it('returns 400 validation error when target is missing', async () => {
      const req = new Request('http://localhost:8787/api/osint/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platforms: ['instagram'],
        }),
      });

      const res = await app.fetch(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Validation Error');
    });
  });
});
