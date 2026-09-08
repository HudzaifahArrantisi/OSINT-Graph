import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'tiktok-best-experience.p.rapidapi.com';

/**
 * Get TikTok user profile by username using tiktok-best-experience API.
 */
export async function getUserByUsername(username: string): Promise<any> {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/user/${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktokBestExperience.getUserByUsername] Failed for "${username}": ${message}`);
  }
}

/**
 * Get TikTok user profile by numerical user ID.
 */
export async function getUserById(userId: string | number): Promise<any> {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/user/id/${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktokBestExperience.getUserById] Failed for "${userId}": ${message}`);
  }
}

/**
 * Get TikTok user followings list by user ID.
 */
export async function getFollowings(userId: string | number): Promise<any> {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/user/id/${encodeURIComponent(String(userId))}/followings`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktokBestExperience.getFollowings] Failed for "${userId}": ${message}`);
  }
}

/**
 * Get TikTok user followers list by user ID.
 */
export async function getFollowers(userId: string | number): Promise<any> {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/user/id/${encodeURIComponent(String(userId))}/followers`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktokBestExperience.getFollowers] Failed for "${userId}": ${message}`);
  }
}

/**
 * Search TikTok users by keyword or name.
 */
export async function searchUsers(keyword: string): Promise<any> {
  try {
    if (!keyword) throw new Error('keyword is required');
    return await callRapidAPI(
      HOST,
      `/search/user/${encodeURIComponent(keyword.trim())}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktokBestExperience.searchUsers] Failed for "${keyword}": ${message}`);
  }
}

export const tiktokBestExperience = {
  HOST,
  getUserByUsername,
  getUserById,
  searchUsers,
  getFollowings,
  getFollowers,
};

export default tiktokBestExperience;
