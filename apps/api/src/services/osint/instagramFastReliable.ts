import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'instagram-api-fast-reliable-data-scraper.p.rapidapi.com';

/**
 * Get Instagram user ID by username.
 */
export async function getUserIdByUsername(username: string): Promise<any> {
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
      `[instagramFastReliable.getUserIdByUsername] Failed for username "${username}": ${message}`,
    );
  }
}

/**
 * Get Instagram username by user ID.
 */
export async function getUsernameById(userId: string | number): Promise<any> {
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
      `[instagramFastReliable.getUsernameById] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Get Instagram profile by user ID.
 */
export async function getProfile(userId: string | number): Promise<any> {
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
      `[instagramFastReliable.getProfile] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Get Instagram following list by user ID.
 */
export async function getFollowing(userId: string | number): Promise<any> {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/following?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramFastReliable.getFollowing] Failed for userId "${userId}": ${message}`,
    );
  }
}

/**
 * Get Instagram followers list by user ID.
 */
export async function getFollowers(userId: string | number): Promise<any> {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/followers?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[instagramFastReliable.getFollowers] Failed for userId "${userId}": ${message}`,
    );
  }
}

export const instagramFastReliable = {
  HOST,
  getUserIdByUsername,
  getUsernameById,
  getProfile,
  getFollowing,
  getFollowers,
};

export default instagramFastReliable;
