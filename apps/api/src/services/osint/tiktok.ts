import { callRapidAPI } from '../../lib/rapidapi.js';

export const HOST = 'tiktok82.p.rapidapi.com';

/**
 * Get TikTok user secUid by username.
 */
export async function getUserSecUid(username: string): Promise<any> {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/getUserSecUid?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktok.getUserSecUid] Failed for username "${username}": ${message}`);
  }
}

/**
 * Get TikTok user information by user ID.
 */
export async function getUserInfoById(userId: string | number): Promise<any> {
  try {
    if (!userId) throw new Error('userId is required');
    return await callRapidAPI(
      HOST,
      `/getUserInfoByID?user_id=${encodeURIComponent(String(userId))}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktok.getUserInfoById] Failed for userId "${userId}": ${message}`);
  }
}

/**
 * Get TikTok user profile by username.
 */
export async function getProfile(username: string): Promise<any> {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/getProfile?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktok.getProfile] Failed for username "${username}": ${message}`);
  }
}

/**
 * Get complete TikTok user details by username.
 */
export async function getUserComplete(username: string): Promise<any> {
  try {
    if (!username) throw new Error('Username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/getUserComplete?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[tiktok.getUserComplete] Failed for username "${username}": ${message}`);
  }
}

export const tiktok = {
  HOST,
  getUserSecUid,
  getUserInfoById,
  getProfile,
  getUserComplete,
};

export default tiktok;
