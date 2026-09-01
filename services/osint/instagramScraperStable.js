import { callRapidAPI } from '../../lib/rapidapi.js';

const HOST = 'instagram-scraper-stable-api.p.rapidapi.com';

/**
 * Get Instagram/FB profile data (v1).
 * @param {string} usernameOrUrl - Instagram username or profile URL
 * @param {string} [data='basic'] - Data type parameter ('basic', etc.)
 * @returns {Promise<any>} Profile data
 */
export async function getFbProfile(usernameOrUrl, data = 'basic') {
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
 * @param {string} usernameOrUrl - Instagram username or profile URL
 * @returns {Promise<any>} Profile data v3
 */
export async function getFbProfileV3(usernameOrUrl) {
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

export default {
  HOST,
  getFbProfile,
  getFbProfileV3,
};
