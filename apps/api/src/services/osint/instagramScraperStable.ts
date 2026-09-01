import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

/**
 * Get Instagram/FB profile data (v1).
 */
export async function getFbProfile(usernameOrUrl: string, data = 'basic'): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/ig_get_fb_profile.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getFbProfile] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

/**
 * Get Instagram/FB profile data (v3).
 */
export async function getFbProfileV3(usernameOrUrl: string): Promise<any> {
  try {
    if (!usernameOrUrl) throw new Error('usernameOrUrl is required');
    return await callRapidAPI(HOST, '/ig_get_fb_profile_v3.php', 'POST', {
      username_or_url: usernameOrUrl.trim(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraperStable.getFbProfileV3] Failed for "${usernameOrUrl}": ${message}`,
    );
  }
}

export const instagramScraperStable = {
  HOST,
  getFbProfile,
  getFbProfileV3,
};

export default instagramScraperStable;
