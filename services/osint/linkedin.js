import { callRapidAPI } from '../../lib/rapidapi.js';

const HOST = 'linkedin-data-api.p.rapidapi.com';

/**
 * Get LinkedIn profile data by full profile URL.
 * @param {string} url - Full LinkedIn profile URL
 * @returns {Promise<any>} Profile data
 */
export async function getProfileByUrl(url) {
  try {
    if (!url) throw new Error('url is required');
    return await callRapidAPI(
      HOST,
      `/get-profile-data-by-url?url=${encodeURIComponent(url.trim())}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getProfileByUrl] Failed for url "${url}": ${message}`);
  }
}

/**
 * Get LinkedIn user profile posts.
 * @param {string} username - LinkedIn username / vanity name
 * @returns {Promise<any>} Profile posts data
 */
export async function getProfilePosts(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/get-profile-posts?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getProfilePosts] Failed for username "${username}": ${message}`);
  }
}

/**
 * Get LinkedIn profile recent activity timestamp.
 * @param {string} username - LinkedIn username / vanity name
 * @returns {Promise<any>} Recent activity time data
 */
export async function getProfileRecentActivity(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/get-profile-recent-activity-time?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[linkedin.getProfileRecentActivity] Failed for username "${username}": ${message}`,
    );
  }
}

/**
 * Get "About This Profile" metadata for LinkedIn profile.
 * @param {string} username - LinkedIn username / vanity name
 * @returns {Promise<any>} About profile data
 */
export async function getAboutProfile(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/about-this-profile?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getAboutProfile] Failed for username "${username}": ${message}`);
  }
}

/**
 * Get LinkedIn profile connection count and posts summary.
 * @param {string} username - LinkedIn username / vanity name
 * @returns {Promise<any>} Connection count and posts summary
 */
export async function getProfileConnectionCountPosts(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/profile-data-connection-count-posts?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[linkedin.getProfileConnectionCountPosts] Failed for username "${username}": ${message}`,
    );
  }
}

/**
 * Get all available LinkedIn profile data by username.
 * @param {string} username - LinkedIn username / vanity name
 * @returns {Promise<any>} Complete profile data
 */
export async function getAllProfileData(username) {
  try {
    if (!username) throw new Error('username is required');
    const cleanUsername = username.replace(/^@/, '').trim();
    return await callRapidAPI(
      HOST,
      `/all-profile-data?username=${encodeURIComponent(cleanUsername)}`,
      'GET',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[linkedin.getAllProfileData] Failed for username "${username}": ${message}`);
  }
}

export default {
  HOST,
  getProfileByUrl,
  getProfilePosts,
  getProfileRecentActivity,
  getAboutProfile,
  getProfileConnectionCountPosts,
  getAllProfileData,
};
