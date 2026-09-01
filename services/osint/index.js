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

/**
 * Extract clean username or handle from input target (stripping leading @ and trimming).
 * @param {string} target
 * @returns {string}
 */
function cleanTargetUsername(target) {
  if (!target || typeof target !== 'string') return '';
  return target.trim().replace(/^@/, '');
}

/**
 * Aggregator function to look up target profile across multiple social media platforms simultaneously.
 * Uses Promise.allSettled so failures or rate limits on one service do not impact other platforms.
 *
 * @param {string} target - Username or profile URL to investigate
 * @param {string[]} [platforms=['instagram', 'tiktok', 'linkedin']] - List of platforms to query
 * @returns {Promise<{
 *   target: string;
 *   timestamp: string;
 *   instagram?: { status: 'fulfilled' | 'rejected'; data?: any; error?: string };
 *   tiktok?: { status: 'fulfilled' | 'rejected'; data?: any; error?: string };
 *   linkedin?: { status: 'fulfilled' | 'rejected'; data?: any; error?: string };
 * }>}
 */
export async function lookupAllPlatforms(
  target,
  platforms = ['instagram', 'tiktok', 'linkedin'],
) {
  if (!target || typeof target !== 'string' || target.trim() === '') {
    throw new Error('Target (username or profile URL) is required');
  }

  const cleanTarget = cleanTargetUsername(target);
  const normalizedPlatforms = platforms.map((p) => p.toLowerCase().trim());
  const tasks = [];

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
        let data;
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

  /** @type {Record<string, any>} */
  const response = {
    target,
    timestamp: new Date().toISOString(),
  };

  // Populate platform results based on Promise settlement
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

export default {
  lookupAllPlatforms,
  instagramScraper,
  tiktok,
  instagramFastReliable,
  instagramBestExperience,
  instagramScraperStable,
  linkedin,
};
