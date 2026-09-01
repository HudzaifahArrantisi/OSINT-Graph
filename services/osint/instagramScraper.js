import { callRapidAPI } from '../../lib/rapidapi.js';

const HOST = 'instagram-scraper2.p.rapidapi.com';

/**
 * Get Instagram user information by username.
 * @param {string} username - Instagram handle / username
 * @returns {Promise<any>} User details
 */
export async function getUserInfo(username) {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/user_info?user_name=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[instagramScraper.getUserInfo] Failed for username "${username}": ${message}`);
  }
}

/**
 * Search followers of an Instagram user by user ID.
 * @param {string|number} userId - Instagram user ID
 * @param {string} query - Query string to search within followers
 * @returns {Promise<any>} Follower search results
 */
export async function searchFollowers(userId, query = '') {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/search_followers?user_id=${encodeURIComponent(String(userId))}&query=${encodeURIComponent(
        query,
      )}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraper.searchFollowers] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Search following list of an Instagram user by user ID.
 * @param {string|number} userId - Instagram user ID
 * @param {string} query - Query string to search within following
 * @returns {Promise<any>} Following search results
 */
export async function searchFollowing(userId, query = '') {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/search_following?user_id=${encodeURIComponent(String(userId))}&query=${encodeURIComponent(
        query,
      )}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramScraper.searchFollowing] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Get user reels by Instagram user ID.
 * @param {string|number} userId - Instagram user ID
 * @returns {Promise<any>} User reels data
 */
export async function getUserReels(userId) {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/user_reels?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[instagramScraper.getUserReels] Failed for userId "${userId}": ${message}`);
  }
}

export default {
  HOST,
  getUserInfo,
  searchFollowers,
  searchFollowing,
  getUserReels,
};
