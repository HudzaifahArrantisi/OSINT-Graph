import { callRapidAPI } from '../../lib/rapidapi.js';

const HOST = 'instagram-best-experience.p.rapidapi.com';

/**
 * Get Instagram user ID by username.
 * @param {string} username - Instagram username
 * @returns {Promise<any>} User ID data
 */
export async function getUserIdByUsername(username) {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/user_id_by_username?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramBestExperience.getUserIdByUsername] Failed for username "${username}": ${message}`,
    );
  }
}

/**
 * Get Instagram username by user ID.
 * @param {string|number} userId - Instagram user ID
 * @returns {Promise<any>} Username data
 */
export async function getUsernameById(userId) {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/username_by_id?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramBestExperience.getUsernameById] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Get Instagram profile by username.
 * @param {string} username - Instagram username
 * @returns {Promise<any>} Profile data
 */
export async function getProfileByUsername(username) {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/profile?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramBestExperience.getProfileByUsername] Failed for username "${username}": ${message}`,
    );
  }
}

/**
 * Get Instagram profile by user ID.
 * @param {string|number} userId - Instagram user ID
 * @returns {Promise<any>} Profile data
 */
export async function getProfileById(userId) {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/profile?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramBestExperience.getProfileById] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Discover account chaining / recommended similar accounts by user ID.
 * @param {string|number} userId - Instagram user ID
 * @returns {Promise<any>} Account chaining discovery data
 */
export async function discoverChaining(userId) {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/discover_chaining?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramBestExperience.discoverChaining] Failed for userId "${userId}": ${message}`,
    );
  }
}

export default {
  HOST,
  getUserIdByUsername,
  getUsernameById,
  getProfileByUsername,
  getProfileById,
  discoverChaining,
};
