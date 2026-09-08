import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'instagram-looter2.p.rapidapi.com';

/**
 * Get Instagram user profile data using instagram-looter2 API (v2 profile endpoint).
 * GET /profile2?username={username}
 */
export async function getProfile2(username: string): Promise<any> {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/profile2?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[instagramLooter.getProfile2] Failed for username "${username}": ${message}`);
  }
}

export const instagramLooter = {
  HOST,
  getProfile2,
};

export default instagramLooter;
