import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'tiktok-best-experience.p.rapidapi.com';

/**
 * Get TikTok user profile by username using tiktok-best-experience API.
 */
export async function getUserByUsername(username) {
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
export async function getUserById(userId) {
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
export async function getFollowings(userId) {
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
export async function getFollowers(userId) {
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

export const tiktokBestExperience = {
  HOST,
  getUserByUsername,
  getUserById,
  getFollowings,
  getFollowers,
};

export default tiktokBestExperience;
