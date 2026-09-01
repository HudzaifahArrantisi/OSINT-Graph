import { instagramScraper } from './instagramScraper.js';
import { tiktok } from './tiktok.js';
import { tiktokBestExperience } from './tiktokBestExperience.js';
import { instagramFastReliable } from './instagramFastReliable.js';
import { instagramBestExperience } from './instagramBestExperience.js';
import { instagramScraperStable } from './instagramScraperStable.js';
import { linkedin } from './linkedin.js';

export {
  instagramScraper,
  tiktok,
  tiktokBestExperience,
  instagramFastReliable,
  instagramBestExperience,
  instagramScraperStable,
  linkedin,
};

export interface PlatformResult {
  status: 'fulfilled' | 'rejected';
  data?: any;
  error?: string;
}

export interface OsintLookupResult {
  target: string;
  timestamp: string;
  instagram?: PlatformResult;
  tiktok?: PlatformResult;
  linkedin?: PlatformResult;
  [key: string]: any;
}

function cleanTargetUsername(target: string): string {
  if (!target || typeof target !== 'string') return '';
  return target.trim().replace(/^@/, '');
}

/**
 * Aggregator function to look up target profile across multiple social media platforms simultaneously.
 * Uses Promise.allSettled so failures or rate limits on one service do not impact other platforms.
 */
export async function lookupAllPlatforms(
  target: string,
  platforms: string[] = ['instagram', 'tiktok', 'linkedin'],
): Promise<OsintLookupResult> {
  if (!target || typeof target !== 'string' || target.trim() === '') {
    throw new Error('Target (username or profile URL) is required');
  }

  const cleanTarget = cleanTargetUsername(target);
  const normalizedPlatforms = platforms.map((p) => p.toLowerCase().trim());
  const tasks: Promise<{ platform: string; data: any }>[] = [];

  // 1. Instagram lookup
  if (normalizedPlatforms.includes('instagram')) {
    tasks.push(
      (async () => {
        const data = await instagramScraper.getUserInfo(cleanTarget);
        return { platform: 'instagram', data };
      })(),
    );
  }

  // 2. TikTok lookup
  if (normalizedPlatforms.includes('tiktok')) {
    tasks.push(
      (async () => {
        const data = await tiktok.getProfile(cleanTarget);
        return { platform: 'tiktok', data };
      })(),
    );
  }

  // 3. LinkedIn lookup
  if (normalizedPlatforms.includes('linkedin')) {
    tasks.push(
      (async () => {
        let data: any;
        if (target.includes('linkedin.com')) {
          data = await linkedin.getProfileByUrl(target);
        } else {
          data = await linkedin.getProfileByUsername(cleanTarget);
        }
        return { platform: 'linkedin', data };
      })(),
    );
  }

  const settledResults = await Promise.allSettled(tasks);

  const response: OsintLookupResult = {
    target,
    timestamp: new Date().toISOString(),
  };

  let taskIndex = 0;
  if (normalizedPlatforms.includes('instagram')) {
    const res = settledResults[taskIndex++];
    if (res.status === 'fulfilled') {
      response.instagram = { status: 'fulfilled', data: res.value.data };
    } else {
      response.instagram = {
        status: 'rejected',
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      };
    }
  }

  if (normalizedPlatforms.includes('tiktok')) {
    const res = settledResults[taskIndex++];
    if (res.status === 'fulfilled') {
      response.tiktok = { status: 'fulfilled', data: res.value.data };
    } else {
      response.tiktok = {
        status: 'rejected',
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      };
    }
  }

  if (normalizedPlatforms.includes('linkedin')) {
    const res = settledResults[taskIndex++];
    if (res.status === 'fulfilled') {
      response.linkedin = { status: 'fulfilled', data: res.value.data };
    } else {
      response.linkedin = {
        status: 'rejected',
        error: res.reason instanceof Error ? res.reason.message : String(res.reason),
      };
    }
  }

  return response;
}

export const osintService = {
  lookupAllPlatforms,
  instagramScraper,
  tiktok,
  instagramFastReliable,
  instagramBestExperience,
  instagramScraperStable,
  linkedin,
};

export default osintService;
